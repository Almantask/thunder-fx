use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::fs::{File, OpenOptions};
use std::io::{copy, BufRead, BufReader, Write};
use std::path::{Component, Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};

use std::collections::HashMap;
use std::sync::mpsc::{channel, Sender};

struct Engine {
    proc: Mutex<Option<Arc<EngineProc>>>,
}

struct PendingRequests {
    map: Mutex<HashMap<String, Sender<serde_json::Value>>>,
}

struct EngineProc {
    stdin: Mutex<ChildStdin>,
    pending: Arc<PendingRequests>,
    child: Mutex<Child>,
    alive: Arc<AtomicBool>,
}

impl EngineProc {
    /// False once the reader thread has seen the worker's stdout close, which
    /// is how a crashed or killed Python process shows up here.
    fn is_alive(&self) -> bool {
        self.alive.load(Ordering::SeqCst)
    }
}

impl Drop for EngineProc {
    fn drop(&mut self) {
        self.alive.store(false, Ordering::SeqCst);
        if let Ok(mut child) = self.child.lock() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[derive(Serialize, Clone)]
struct WeaveProgressPayload {
    step: u32,
    total: u32,
    #[serde(rename = "elapsedMs")]
    elapsed_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    phase: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    ratio: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

fn library_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("THUNDER_FX_LIBRARY_DIR") {
        let trimmed = dir.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        return PathBuf::from(local).join("thunder-fx").join("library");
    }
    if let Ok(home) = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")) {
        return PathBuf::from(home).join(".thunder-fx").join("library");
    }
    std::env::temp_dir().join("thunder-fx").join("library")
}

fn logs_dir() -> PathBuf {
    if let Ok(dir) = std::env::var("THUNDER_FX_LOG_DIR") {
        let trimmed = dir.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        return PathBuf::from(local).join("thunder-fx").join("logs");
    }
    if let Ok(home) = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")) {
        return PathBuf::from(home).join(".thunder-fx").join("logs");
    }
    std::env::temp_dir().join("thunder-fx").join("logs")
}

/// Directories the webview is allowed to touch without an explicit grant.
///
/// The renderer only ever loads local assets, but these commands are the one
/// place a compromised frontend could reach the whole disk, so every path
/// argument is resolved and checked against this list first.
fn default_scope_roots() -> Vec<PathBuf> {
    vec![library_dir(), logs_dir(), std::env::temp_dir()]
}

/// Grants live outside every scope root on purpose: the frontend must not be
/// able to widen its own sandbox by writing this file through `write_file`.
fn scope_config_file() -> PathBuf {
    if let Ok(dir) = std::env::var("THUNDER_FX_SCOPE_FILE") {
        let trimmed = dir.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        return PathBuf::from(local)
            .join("thunder-fx")
            .join("allowed-paths.json");
    }
    std::env::temp_dir().join("thunder-fx-allowed-paths.json")
}

/// Folders the frontend may touch beyond the built-in defaults.
///
/// `granted` only ever grows through a native dialog ([`pick_save_path`] and
/// [`pick_directory`]) — the webview cannot add to it on its own word.
/// `library` is the one exception, and a deliberate one: the "Generated sounds
/// folder" setting already decides where the Python worker writes and which
/// tree the scan commands walk, so the app has to be able to read back what it
/// just wrote there. It is a single replaceable root rather than a growing
/// list, so pointing it somewhere else narrows the sandbox again instead of
/// widening it further.
struct PathScope {
    granted: Mutex<Vec<PathBuf>>,
    library: Mutex<Option<PathBuf>>,
}

#[derive(Serialize, Deserialize, Default)]
struct ScopeConfig {
    #[serde(default)]
    granted: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    library: Option<String>,
}

impl PathScope {
    fn load() -> Self {
        let config = read_scope_config().unwrap_or_default();
        PathScope {
            granted: Mutex::new(
                config
                    .granted
                    .iter()
                    .map(|p| normalize_path(Path::new(p)))
                    .collect(),
            ),
            library: Mutex::new(
                config
                    .library
                    .map(|p| normalize_path(Path::new(&p)))
                    .filter(|p| !p.as_os_str().is_empty()),
            ),
        }
    }

    fn grant(&self, path: &Path) {
        let normalized = normalize_path(path);
        {
            let Ok(mut granted) = self.granted.lock() else {
                return;
            };
            if granted.contains(&normalized) {
                return;
            }
            granted.push(normalized);
        }
        self.persist();
    }

    /// Points the library root at `dir`, or back at the built-in default when
    /// it is empty. Called whenever the frontend hands a library folder to the
    /// engine or the settings panel changes it.
    fn set_library(&self, dir: Option<&str>) {
        let next = dir
            .map(str::trim)
            .filter(|d| !d.is_empty())
            .map(|d| normalize_path(Path::new(d)));
        {
            let Ok(mut library) = self.library.lock() else {
                return;
            };
            if *library == next {
                return;
            }
            *library = next;
        }
        self.persist();
    }

    fn persist(&self) {
        let config = ScopeConfig {
            granted: match self.granted.lock() {
                Ok(granted) => granted
                    .iter()
                    .map(|p| p.to_string_lossy().into_owned())
                    .collect(),
                Err(_) => return,
            },
            library: match self.library.lock() {
                Ok(library) => library.as_ref().map(|p| p.to_string_lossy().into_owned()),
                Err(_) => return,
            },
        };
        let file = scope_config_file();
        if let Some(parent) = file.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(text) = serde_json::to_string_pretty(&config) {
            let _ = write_bytes_atomic(&file, text.as_bytes());
        }
    }

    fn roots(&self) -> Vec<PathBuf> {
        let mut roots: Vec<PathBuf> = default_scope_roots()
            .iter()
            .map(|root| normalize_path(root))
            .collect();
        if let Ok(library) = self.library.lock() {
            roots.extend(library.iter().cloned());
        }
        if let Ok(granted) = self.granted.lock() {
            roots.extend(granted.iter().cloned());
        }
        roots
    }
}

fn scope_sidecar_bak(path: &Path) -> PathBuf {
    match path.file_name().and_then(|name| name.to_str()) {
        Some(name) => path.with_file_name(format!("{name}.bak")),
        None => path.with_extension("bak"),
    }
}

fn parse_scope_config(text: &str) -> Option<ScopeConfig> {
    serde_json::from_str::<ScopeConfig>(text).ok().or_else(|| {
        // Older builds stored a bare array of granted folders.
        serde_json::from_str::<Vec<String>>(text)
            .ok()
            .map(|granted| ScopeConfig {
                granted,
                library: None,
            })
    })
}

fn read_scope_config() -> Option<ScopeConfig> {
    let file = scope_config_file();
    if let Ok(text) = std::fs::read_to_string(&file) {
        if let Some(config) = parse_scope_config(&text) {
            return Some(config);
        }
    }
    let bak = scope_sidecar_bak(&file);
    std::fs::read_to_string(bak)
        .ok()
        .and_then(|text| parse_scope_config(&text))
}

/// Lexical resolution: absolutise, then fold away `.` and `..` without
/// touching the filesystem, so a path that does not exist yet still resolves.
fn normalize_path(path: &Path) -> PathBuf {
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(path)
    };
    // Prefer the real path when it exists so symlinks and 8.3 names collapse.
    let candidate = strip_verbatim(std::fs::canonicalize(&absolute).unwrap_or(absolute));
    let mut out = PathBuf::new();
    for component in candidate.components() {
        match component {
            Component::ParentDir => {
                out.pop();
            }
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

/// `canonicalize` returns `\\?\C:\…` on Windows while a path typed by a user or
/// built lexically does not, so the two would never compare equal.
fn strip_verbatim(path: PathBuf) -> PathBuf {
    if cfg!(not(windows)) {
        return path;
    }
    let text = path.to_string_lossy().into_owned();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{rest}"));
    }
    match text.strip_prefix(r"\\?\") {
        Some(rest) => PathBuf::from(rest),
        None => path,
    }
}

fn path_is_within(root: &Path, path: &Path) -> bool {
    if root.as_os_str().is_empty() {
        return false;
    }
    if cfg!(windows) {
        // Windows paths are case-insensitive; compare on a folded copy so a
        // drive letter or folder typed in another case still matches.
        let fold = |p: &Path| PathBuf::from(p.to_string_lossy().to_lowercase());
        let (root, path) = (fold(root), fold(path));
        return path == root || path.starts_with(&root);
    }
    path == root || path.starts_with(root)
}

/// Returns the normalized path when it sits inside an allowed root.
fn ensure_allowed(scope: &PathScope, path: &str) -> Result<PathBuf, String> {
    let requested = Path::new(path);
    if requested.as_os_str().is_empty() {
        return Err(fail("Empty path"));
    }
    let normalized = normalize_path(requested);
    // A file that does not exist yet cannot be canonicalized, so fall back to
    // checking the directory it would be created in.
    let probe = if normalized.exists() {
        normalized.clone()
    } else {
        match normalized.parent() {
            Some(parent) => normalize_path(parent),
            None => normalized.clone(),
        }
    };
    for root in scope.roots() {
        if path_is_within(&root, &probe) || path_is_within(&root, &normalized) {
            return Ok(normalized);
        }
    }
    Err(fail(format!(
        "Path is outside the folders Thunder FX may use: {}",
        requested.display()
    )))
}

fn error_log_file() -> PathBuf {
    let path = logs_dir().join("error.log");
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if !path.exists() {
        let _ = OpenOptions::new().create(true).append(true).open(&path);
    }
    path
}

fn append_error_log(message: &str) {
    let path = error_log_file();
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let line = format!("[{secs}] ERROR {message}\n\n");
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&path) {
        let _ = file.write_all(line.as_bytes());
    }
}

fn fail(message: impl Into<String>) -> String {
    let message = message.into();
    append_error_log(&message);
    message
}

fn worker_path(app: &AppHandle) -> PathBuf {
    if let Ok(p) = std::env::var("THUNDER_FX_WORKER") {
        return PathBuf::from(p);
    }
    if let Ok(dir) = app.path().resource_dir() {
        let nested = dir.join("engine").join("worker.py");
        if nested.exists() {
            return nested;
        }
        let flat = dir.join("worker.py");
        if flat.exists() {
            return flat;
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("engine")
        .join("worker.py")
}

fn python_in_venv(root: &Path) -> Option<PathBuf> {
    let windows = root.join("Scripts").join("python.exe");
    if windows.exists() {
        return Some(windows);
    }
    let unix = root.join("bin").join("python");
    if unix.exists() {
        return Some(unix);
    }
    None
}

fn venv_root_candidates(script: &Path) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    let mut push = |path: PathBuf| {
        if !roots.iter().any(|existing| existing == &path) {
            roots.push(path);
        }
    };
    if let Some(dir) = script.parent() {
        push(dir.join(".venv"));
        if dir.file_name().is_some_and(|name| name == "engine") {
            if let Some(parent) = dir.parent() {
                push(parent.join(".venv"));
                if parent.file_name().is_some_and(|name| name == "_up_") {
                    if let Some(release_dir) = parent.parent() {
                        push(release_dir.join(".venv"));
                    }
                }
            }
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            push(parent.join(".venv"));
        }
    }
    roots
}

fn venv_python(script: &Path) -> Option<PathBuf> {
    venv_root_candidates(script)
        .into_iter()
        .find_map(|root| python_in_venv(&root))
}

fn python_commands(script: &Path) -> Vec<Command> {
    let mut commands = Vec::new();
    if let Ok(explicit) = std::env::var("THUNDER_FX_PYTHON") {
        let mut cmd = Command::new(explicit);
        cmd.arg("-u").arg(script);
        commands.push(cmd);
    }
    if let Some(venv) = venv_python(script) {
        let mut cmd = Command::new(venv);
        cmd.arg("-u").arg(script);
        commands.push(cmd);
    }
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let bundled = PathBuf::from(local)
            .join("Programs")
            .join("Python")
            .join("Python312")
            .join("python.exe");
        if bundled.exists() {
            let mut cmd = Command::new(bundled);
            cmd.arg("-u").arg(script);
            commands.push(cmd);
        }
    }
    let mut python = Command::new("python");
    python.arg("-u").arg(script);
    commands.push(python);
    let mut py = Command::new("py");
    py.args(["-3.12", "-u"]).arg(script);
    commands.push(py);
    commands
}

fn default_pytorch_cuda_alloc_conf() -> Option<&'static str> {
    // Expandable segments cut allocator-fragmentation OOMs on long sessions.
    // Leave an explicit user value alone.
    if std::env::var("PYTORCH_CUDA_ALLOC_CONF").is_ok() {
        None
    } else {
        Some("expandable_segments:True")
    }
}

fn spawn_python(script: &Path) -> Result<Child, String> {
    let mock = std::env::var("THUNDER_FX_MOCK_ENGINE").ok();
    let mut last_err = "no Python interpreter attempted".to_string();
    for mut cmd in python_commands(script) {
        cmd.stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .env("PYTHONUNBUFFERED", "1")
            // Without these, Python decodes our UTF-8 JSON with the Windows ANSI
            // code page: an em dash in a category name arrives as mojibake and
            // an undefined byte kills the worker outright.
            .env("PYTHONUTF8", "1")
            .env("PYTHONIOENCODING", "utf-8");
        if let Some(conf) = default_pytorch_cuda_alloc_conf() {
            cmd.env("PYTORCH_CUDA_ALLOC_CONF", conf);
        }
        if let Some(parent) = script.parent() {
            let hf = parent.join(".hf-cache");
            if hf.exists() && std::env::var("HF_HUB_CACHE").is_err() {
                cmd.env("HF_HUB_CACHE", hf);
            }
        }
        if let Some(ref mock) = mock {
            cmd.env("THUNDER_FX_MOCK_ENGINE", mock);
        }
        #[cfg(all(windows, not(debug_assertions)))]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }
        match cmd.spawn() {
            Ok(child) => return Ok(child),
            Err(err) => last_err = err.to_string(),
        }
    }
    Err(format!(
        "Failed to start Python worker (python / py -3.12): {last_err}"
    ))
}

fn spawn_engine(app: &AppHandle) -> Result<EngineProc, String> {
    let script = worker_path(app);
    let script = std::fs::canonicalize(&script).unwrap_or(script);
    if !script.exists() {
        return Err(fail(format!(
            "Engine worker missing at {}",
            script.display()
        )));
    }
    let mut child = spawn_python(&script).map_err(fail)?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| fail("engine stdin missing"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| fail("engine stdout missing"))?;

    let pending = Arc::new(PendingRequests {
        map: Mutex::new(HashMap::new()),
    });
    let alive = Arc::new(AtomicBool::new(true));

    let reader_pending = Arc::clone(&pending);
    let reader_alive = Arc::clone(&alive);
    let app_handle = app.clone();
    std::thread::spawn(move || {
        // Whatever ends this loop, the worker is no longer usable: flag it so
        // the next command respawns instead of writing into a dead pipe.
        let _guard = AliveGuard(reader_alive);
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line) {
                Ok(0) => {
                    if let Ok(mut map) = reader_pending.map.lock() {
                        for (_, tx) in map.drain() {
                            let _ = tx.send(serde_json::json!({
                                "event": "error",
                                "message": "Engine process closed"
                            }));
                        }
                    }
                    break;
                }
                Ok(_) => {
                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(trimmed) {
                        let event = parsed.get("event").and_then(|v| v.as_str()).unwrap_or("");
                        if event == "progress" {
                            let payload = WeaveProgressPayload {
                                step: parsed.get("step").and_then(|v| v.as_u64()).unwrap_or(0)
                                    as u32,
                                total: parsed.get("total").and_then(|v| v.as_u64()).unwrap_or(20)
                                    as u32,
                                elapsed_ms: parsed
                                    .get("elapsedMs")
                                    .and_then(|v| v.as_u64())
                                    .unwrap_or(0),
                                phase: parsed
                                    .get("phase")
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.to_string()),
                                ratio: parsed.get("ratio").and_then(|v| v.as_f64()),
                                message: parsed
                                    .get("message")
                                    .and_then(|v| v.as_str())
                                    .map(|s| s.to_string()),
                            };
                            let _ = app_handle.emit("weave-progress", payload.clone());
                            let _ = app_handle.emit("scribe-progress", payload);
                        } else if let Some(id_val) = parsed.get("id") {
                            let id_str = match id_val {
                                serde_json::Value::String(s) => s.clone(),
                                _ => id_val.to_string(),
                            };
                            let tx_opt = if let Ok(mut map) = reader_pending.map.lock() {
                                map.remove(&id_str)
                            } else {
                                None
                            };
                            if let Some(tx) = tx_opt {
                                let _ = tx.send(parsed);
                            }
                        }
                    }
                }
                Err(e) => {
                    fail(format!("Engine stdout read error: {e}"));
                    if let Ok(mut map) = reader_pending.map.lock() {
                        for (_, tx) in map.drain() {
                            let _ = tx.send(serde_json::json!({
                                "event": "error",
                                "message": format!("Engine read error: {e}")
                            }));
                        }
                    }
                    break;
                }
            }
        }
    });

    Ok(EngineProc {
        stdin: Mutex::new(stdin),
        pending,
        child: Mutex::new(child),
        alive,
    })
}

/// Clears the alive flag however the reader thread exits, including a panic.
struct AliveGuard(Arc<AtomicBool>);

impl Drop for AliveGuard {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

fn ensure_engine(app: &AppHandle, state: &State<Engine>) -> Result<Arc<EngineProc>, String> {
    let mut guard = state.proc.lock().map_err(|e| fail(e.to_string()))?;
    if let Some(existing) = guard.as_ref() {
        if existing.is_alive() {
            return Ok(Arc::clone(existing));
        }
        // Dropping the dead handle reaps the child before we start a new one.
        *guard = None;
        append_error_log("Engine worker died; restarting it");
    }
    let proc = Arc::new(spawn_engine(app)?);
    *guard = Some(Arc::clone(&proc));
    Ok(proc)
}

fn send_line(proc: &EngineProc, payload: &serde_json::Value) -> Result<(), String> {
    let mut stdin = proc.stdin.lock().map_err(|e| fail(e.to_string()))?;
    writeln!(stdin, "{payload}").map_err(|e| fail(e.to_string()))?;
    stdin.flush().map_err(|e| fail(e.to_string()))
}

fn send_and_receive(
    proc: &EngineProc,
    payload: serde_json::Value,
    timeout_secs: u64,
) -> Result<serde_json::Value, String> {
    let id_str = match payload.get("id") {
        Some(serde_json::Value::String(s)) => s.clone(),
        Some(v) => v.to_string(),
        None => return Err(fail("Payload missing id")),
    };
    let (tx, rx) = channel();
    {
        let mut map = proc.pending.map.lock().map_err(|e| fail(e.to_string()))?;
        map.insert(id_str.clone(), tx);
    }
    if let Err(e) = send_line(proc, &payload) {
        if let Ok(mut map) = proc.pending.map.lock() {
            map.remove(&id_str);
        }
        return Err(e);
    }
    match rx.recv_timeout(std::time::Duration::from_secs(timeout_secs)) {
        Ok(res) => {
            if res.get("event").and_then(|v| v.as_str()) == Some("error") {
                let msg = res
                    .get("message")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Engine error");
                return Err(fail(msg));
            }
            Ok(res)
        }
        Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
            if let Ok(mut map) = proc.pending.map.lock() {
                map.remove(&id_str);
            }
            Err(fail(format!(
                "Engine command timed out after {timeout_secs}s"
            )))
        }
        Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
            if let Ok(mut map) = proc.pending.map.lock() {
                map.remove(&id_str);
            }
            Err(fail("Engine disconnected"))
        }
    }
}

async fn run_blocking<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|e| fail(e.to_string()))?
}

#[tauri::command]
async fn engine_status(
    app: AppHandle,
    state: State<'_, Engine>,
) -> Result<serde_json::Value, String> {
    let proc = ensure_engine(&app, &state)?;
    let payload = serde_json::json!({"id": uuid::Uuid::new_v4().to_string(), "cmd": "status"});
    run_blocking(move || send_and_receive(&proc, payload, 10)).await
}

#[tauri::command]
async fn engine_probe(
    app: AppHandle,
    state: State<'_, Engine>,
    hf_token: Option<String>,
) -> Result<serde_json::Value, String> {
    let proc = ensure_engine(&app, &state)?;
    let payload = serde_json::json!({"id": uuid::Uuid::new_v4().to_string(), "cmd": "probe", "hf_token": hf_token});
    run_blocking(move || send_and_receive(&proc, payload, 30)).await
}

/// Wall-clock budget for one generation.
///
/// Diffusion cost scales with `seconds × steps`; the constant is deliberately
/// loose (roughly 6x slower than a mid-range GPU) because timing out a real
/// run is far worse than waiting on a wedged one — a hung worker is now
/// recovered by [`ensure_engine`] respawning it, and the user can cancel.
fn generate_timeout_secs(seconds: f32, steps: u32) -> u64 {
    let work = f64::from(seconds.max(0.0)) * f64::from(steps.max(1));
    let budget = 240.0 + work * 0.6;
    budget.clamp(600.0, 7200.0) as u64
}

/// Steps the worker will actually run for a preset, used only to size the
/// timeout. The worker owns the real decision; this just has to not undercut
/// it, so the slowest preset is assumed when steps are not pinned.
fn preset_steps(preset: Option<&str>, steps: Option<u32>) -> u32 {
    match preset {
        Some("speed") => 8,
        Some("balanced") => 20,
        // Max quality runs 50 steps on medium-base, or 32 on the fallback.
        Some("quality") => 50,
        _ => steps.unwrap_or(20),
    }
}

#[tauri::command]
#[allow(clippy::too_many_arguments)] // one parameter per IPC field
async fn engine_generate(
    app: AppHandle,
    state: State<'_, Engine>,
    scope: State<'_, PathScope>,
    prompt: String,
    seconds: f32,
    seed: i64,
    cfg: f32,
    negative: String,
    hf_token: Option<String>,
    library_dir: Option<String>,
    mode: Option<String>,
    instruments: Option<Vec<String>>,
    steps: Option<u32>,
    category: Option<String>,
    subcategory: Option<String>,
    intensity: Option<String>,
    seamless_loop: Option<bool>,
    preset: Option<String>,
    sampler: Option<String>,
) -> Result<serde_json::Value, String> {
    let proc = ensure_engine(&app, &state)?;
    // The worker writes the WAV under this folder, so the app has to be able to
    // read it straight back; adopting it here keeps scope and output in step
    // even for a folder that was typed in rather than picked in a dialog.
    scope.set_library(library_dir.as_deref());
    // Max quality swaps to medium-base, which means an unload + load before the
    // run even starts, so give it the extra headroom on top of its step count.
    let timeout = generate_timeout_secs(seconds, preset_steps(preset.as_deref(), steps))
        + if preset.as_deref() == Some("quality") {
            600
        } else {
            0
        };
    let payload = serde_json::json!({
        "id": uuid::Uuid::new_v4().to_string(),
        "cmd": "generate",
        "prompt": prompt,
        "seconds": seconds,
        "seed": seed,
        "cfg": cfg,
        "negative": negative,
        "hf_token": hf_token,
        "library_dir": library_dir,
        "mode": mode,
        "instruments": instruments,
        // Null lets the preset own the step count; only the custom preset pins it.
        "steps": steps,
        "preset": preset,
        "sampler": sampler,
        "category": category,
        "subcategory": subcategory,
        "intensity": intensity,
        "seamless_loop": seamless_loop.unwrap_or(false)
    });
    run_blocking(move || send_and_receive(&proc, payload, timeout)).await
}

#[tauri::command]
fn engine_cancel(app: AppHandle, state: State<Engine>) -> Result<serde_json::Value, String> {
    let proc = ensure_engine(&app, &state)?;
    let payload = serde_json::json!({"id": uuid::Uuid::new_v4().to_string(), "cmd": "cancel"});
    send_line(&proc, &payload)?;
    Ok(payload)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)] // one parameter per IPC field
async fn engine_encode_audio(
    app: AppHandle,
    state: State<'_, Engine>,
    scope: State<'_, PathScope>,
    wav_path: String,
    dest_path: String,
    format: Option<String>,
    sample_rate: Option<u32>,
    bit_depth: Option<u32>,
    mono: Option<bool>,
    bitrate: Option<u32>,
    quality: Option<f32>,
) -> Result<serde_json::Value, String> {
    let wav_path = ensure_allowed(&scope, &wav_path)?
        .to_string_lossy()
        .into_owned();
    let dest_path = ensure_allowed(&scope, &dest_path)?
        .to_string_lossy()
        .into_owned();
    let proc = ensure_engine(&app, &state)?;
    let payload = serde_json::json!({
        "id": uuid::Uuid::new_v4().to_string(),
        "cmd": "encode_audio",
        "wav_path": wav_path,
        "dest_path": dest_path,
        "ogg_path": dest_path,
        "format": format.unwrap_or_else(|| "ogg".into()),
        "sample_rate": sample_rate,
        "bit_depth": bit_depth,
        "mono": mono.unwrap_or(false),
        "bitrate": bitrate,
        "quality": quality
    });
    run_blocking(move || send_and_receive(&proc, payload, 120)).await
}

#[tauri::command]
async fn engine_warmup(
    app: AppHandle,
    state: State<'_, Engine>,
    hf_token: Option<String>,
    precision: Option<String>,
    preset: Option<String>,
    model: Option<String>,
) -> Result<serde_json::Value, String> {
    let proc = ensure_engine(&app, &state)?;
    // Preloading medium-base means a multi-GB download on first use, so it gets
    // a far longer budget than a warm local load of Medium.
    let downloading = model.as_deref() == Some("medium-base")
        || (model.is_none() && preset.as_deref() == Some("quality"));
    let timeout = if downloading { 7200 } else { 600 };
    let payload = serde_json::json!({
        "id": uuid::Uuid::new_v4().to_string(),
        "cmd": "warmup",
        "hf_token": hf_token,
        "precision": precision,
        "preset": preset,
        "model": model
    });
    run_blocking(move || send_and_receive(&proc, payload, timeout)).await
}

#[tauri::command]
async fn engine_unload(
    app: AppHandle,
    state: State<'_, Engine>,
) -> Result<serde_json::Value, String> {
    let proc = ensure_engine(&app, &state)?;
    let payload = serde_json::json!({"id": uuid::Uuid::new_v4().to_string(), "cmd": "unload"});
    run_blocking(move || send_and_receive(&proc, payload, 30)).await
}

fn sidecar_tmp_path(path: &Path) -> PathBuf {
    match path.file_name().and_then(|name| name.to_str()) {
        Some(name) => path.with_file_name(format!("{name}.tmp")),
        None => path.with_extension("tmp"),
    }
}

fn write_bytes_to(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| fail(e.to_string()))?;
    }
    std::fs::write(path, bytes).map_err(|e| fail(e.to_string()))
}

/// Write to `<name>.tmp`, fsync, keep `<name>.bak`, then rename over the original.
///
/// A crash mid-write used to leave a truncated sidecar that the next save would
/// happily overwrite with an empty index. Rename-over is atomic on the same
/// volume; the `.bak` is the previous complete version if the new file cannot
/// be parsed.
fn write_bytes_atomic(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| fail(e.to_string()))?;
    }
    let tmp = sidecar_tmp_path(path);
    {
        let mut file = std::fs::File::create(&tmp).map_err(|e| fail(e.to_string()))?;
        file.write_all(bytes).map_err(|e| fail(e.to_string()))?;
        file.sync_all().map_err(|e| fail(e.to_string()))?;
    }
    let bak = scope_sidecar_bak(path);
    if path.exists() {
        let _ = std::fs::copy(path, &bak);
    }
    if cfg!(windows) && path.exists() {
        std::fs::remove_file(path).map_err(|e| fail(e.to_string()))?;
    }
    match std::fs::rename(&tmp, path) {
        Ok(()) => Ok(()),
        Err(err) => {
            let _ = std::fs::remove_file(&tmp);
            Err(fail(err.to_string()))
        }
    }
}

/// Raw-bytes write. The frontend sends an `ArrayBuffer` as the request body and
/// the destination as a base64 header, so audio never round-trips through a
/// base64 JSON string.
#[tauri::command]
async fn write_file(
    scope: State<'_, PathScope>,
    request: tauri::ipc::Request<'_>,
) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err(fail("write_file expects a binary body"));
    };
    let path = header_path(&request, "x-thunder-path")?;
    let path = ensure_allowed(&scope, &path)?;
    let bytes = bytes.clone();
    run_blocking(move || write_bytes_to(&path, &bytes)).await
}

/// Atomic sibling of [`write_file`] for JSON sidecars (meta, trash, scope).
#[tauri::command]
async fn write_file_atomic(
    scope: State<'_, PathScope>,
    request: tauri::ipc::Request<'_>,
) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err(fail("write_file_atomic expects a binary body"));
    };
    let path = header_path(&request, "x-thunder-path")?;
    let path = ensure_allowed(&scope, &path)?;
    let bytes = bytes.clone();
    run_blocking(move || write_bytes_atomic(&path, &bytes)).await
}

/// Raw-bytes read: returns an `ArrayBuffer` straight to the webview.
#[tauri::command]
async fn read_file(
    scope: State<'_, PathScope>,
    path: String,
) -> Result<tauri::ipc::Response, String> {
    let path = ensure_allowed(&scope, &path)?;
    let bytes = run_blocking(move || std::fs::read(path).map_err(|e| fail(e.to_string()))).await?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
async fn copy_file(scope: State<'_, PathScope>, src: String, dest: String) -> Result<(), String> {
    let src = ensure_allowed(&scope, &src)?;
    let dest = ensure_allowed(&scope, &dest)?;
    run_blocking(move || {
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent).map_err(|e| fail(e.to_string()))?;
        }
        std::fs::copy(&src, &dest).map_err(|e| fail(e.to_string()))?;
        Ok(())
    })
    .await
}

/// Rename within the library, used by both "rename clip" and "move to trash".
///
/// `std::fs::rename` is instant on one volume but fails across volumes, and a
/// library folder junctioned to another drive is a supported setup here — so
/// the copy-then-delete fallback is load-bearing, not defensive.
#[tauri::command]
async fn move_file(scope: State<'_, PathScope>, src: String, dest: String) -> Result<(), String> {
    let src = ensure_allowed(&scope, &src)?;
    let dest = ensure_allowed(&scope, &dest)?;
    run_blocking(move || {
        if !src.exists() {
            return Err(fail(format!("No such file: {}", src.to_string_lossy())));
        }
        if dest.exists() {
            return Err(fail(format!("{} already exists", dest.to_string_lossy())));
        }
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent).map_err(|e| fail(e.to_string()))?;
        }
        match std::fs::rename(&src, &dest) {
            Ok(()) => Ok(()),
            Err(_) => {
                std::fs::copy(&src, &dest).map_err(|e| fail(e.to_string()))?;
                std::fs::remove_file(&src).map_err(|e| fail(e.to_string()))?;
                Ok(())
            }
        }
    })
    .await
}

#[tauri::command]
async fn delete_file(scope: State<'_, PathScope>, path: String) -> Result<(), String> {
    let path = ensure_allowed(&scope, &path)?;
    run_blocking(move || {
        if path.exists() {
            std::fs::remove_file(&path).map_err(|e| fail(e.to_string()))?;
        }
        Ok(())
    })
    .await
}

fn header_path(request: &tauri::ipc::Request<'_>, name: &str) -> Result<String, String> {
    let raw = request
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| fail(format!("Missing {name} header")))?;
    // Base64 so non-ASCII paths survive HTTP header encoding.
    let bytes = STANDARD.decode(raw).map_err(|e| fail(e.to_string()))?;
    String::from_utf8(bytes).map_err(|e| fail(e.to_string()))
}

#[derive(Deserialize)]
struct ZipEntry {
    src: String,
    dest: String,
}

fn zip_compression_for(name: &str) -> zip::CompressionMethod {
    let lower = name.to_ascii_lowercase();
    if lower.ends_with(".wav")
        || lower.ends_with(".aiff")
        || lower.ends_with(".aif")
        || lower.ends_with(".flac")
        || lower.ends_with(".opus")
        || lower.ends_with(".ogg")
        || lower.ends_with(".mp3")
    {
        zip::CompressionMethod::Stored
    } else {
        zip::CompressionMethod::Deflated
    }
}

fn write_zip_archive(
    entries: Vec<ZipEntry>,
    dest: &Path,
    manifest: Option<String>,
) -> Result<(), String> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| fail(e.to_string()))?;
    }
    let file = std::fs::File::create(dest).map_err(|e| fail(e.to_string()))?;
    let mut zip = zip::ZipWriter::new(file);
    for entry in entries {
        let name = entry.dest.replace('\\', "/");
        let options =
            zip::write::SimpleFileOptions::default().compression_method(zip_compression_for(&name));
        zip.start_file(&name, options)
            .map_err(|e| fail(e.to_string()))?;
        let mut src = File::open(&entry.src).map_err(|e| fail(e.to_string()))?;
        copy(&mut src, &mut zip).map_err(|e| fail(e.to_string()))?;
    }
    if let Some(body) = manifest {
        let options = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        zip.start_file("manifest.json", options)
            .map_err(|e| fail(e.to_string()))?;
        zip.write_all(body.as_bytes())
            .map_err(|e| fail(e.to_string()))?;
    }
    zip.finish().map_err(|e| fail(e.to_string()))?;
    Ok(())
}

#[tauri::command]
async fn zip_files(
    scope: State<'_, PathScope>,
    entries: Vec<ZipEntry>,
    dest: String,
    manifest: Option<String>,
) -> Result<String, String> {
    for entry in &entries {
        ensure_allowed(&scope, &entry.src)?;
    }
    let dest_path = ensure_allowed(&scope, &dest)?;
    run_blocking(move || {
        write_zip_archive(entries, &dest_path, manifest)?;
        Ok(dest_path.to_string_lossy().into_owned())
    })
    .await
}

#[tauri::command]
fn temp_dir() -> Result<String, String> {
    Ok(std::env::temp_dir().to_string_lossy().into_owned())
}

/// Native save dialog. The chosen path is granted to [`PathScope`], which is
/// the only way the frontend can write outside the library and temp folders.
#[tauri::command]
async fn pick_save_path(
    app: AppHandle,
    scope: State<'_, PathScope>,
    default_path: Option<String>,
    filter_name: Option<String>,
    extensions: Option<Vec<String>>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    // The blocking dialog waits on the main thread, so it runs on a blocking
    // worker rather than tying up an async-runtime thread.
    let chosen = run_blocking(move || {
        let mut builder = app.dialog().file();
        if let Some(default) = default_path.filter(|p| !p.trim().is_empty()) {
            let path = PathBuf::from(default);
            if let Some(parent) = path.parent().filter(|p| !p.as_os_str().is_empty()) {
                builder = builder.set_directory(parent);
            }
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                builder = builder.set_file_name(name);
            }
        }
        if let Some(exts) = extensions.filter(|e| !e.is_empty()) {
            let refs: Vec<&str> = exts.iter().map(|s| s.as_str()).collect();
            builder = builder.add_filter(filter_name.unwrap_or_else(|| "File".into()), &refs);
        }
        match builder.blocking_save_file() {
            Some(file) => file.into_path().map(Some).map_err(|e| fail(e.to_string())),
            None => Ok(None),
        }
    })
    .await?;
    let Some(path) = chosen else {
        return Ok(None);
    };
    // Grant the folder so a later reveal or overwrite of a sibling also works.
    scope.grant(path.parent().unwrap_or(&path));
    Ok(Some(path.to_string_lossy().into_owned()))
}

/// Reveal in Explorer, scoped the same way as reads and writes so the webview
/// cannot use it to probe arbitrary locations.
#[tauri::command]
fn reveal_path(app: AppHandle, scope: State<PathScope>, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;

    let target = ensure_allowed(&scope, &path)?;
    app.opener()
        .reveal_item_in_dir(&target)
        .map_err(|e| fail(e.to_string()))
}

#[tauri::command]
async fn pick_directory(
    app: AppHandle,
    scope: State<'_, PathScope>,
    default_path: Option<String>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let chosen = run_blocking(move || {
        let mut builder = app.dialog().file();
        if let Some(default) = default_path.filter(|p| !p.trim().is_empty()) {
            builder = builder.set_directory(PathBuf::from(default));
        }
        match builder.blocking_pick_folder() {
            Some(folder) => folder
                .into_path()
                .map(Some)
                .map_err(|e| fail(e.to_string())),
            None => Ok(None),
        }
    })
    .await?;
    let Some(path) = chosen else {
        return Ok(None);
    };
    scope.grant(&path);
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[tauri::command]
fn log_error(message: String, detail: Option<String>) -> Result<(), String> {
    match detail {
        Some(detail) if !detail.is_empty() => {
            append_error_log(&format!("{message}\n{detail}"));
        }
        _ => append_error_log(&message),
    }
    Ok(())
}

#[tauri::command]
fn error_log_path() -> Result<String, String> {
    Ok(error_log_file().to_string_lossy().into_owned())
}

/// Records the "Generated sounds folder" setting so reads and writes under it
/// pass [`ensure_allowed`]. Pass an empty string to fall back to the default
/// library under Local AppData.
#[tauri::command]
fn set_library_dir(scope: State<PathScope>, dir: Option<String>) -> Result<String, String> {
    scope.set_library(dir.as_deref());
    let resolved = dir
        .as_deref()
        .map(str::trim)
        .filter(|d| !d.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(library_dir);
    if let Err(err) = std::fs::create_dir_all(&resolved) {
        return Err(fail(format!(
            "Could not use the generated sounds folder {}: {err}",
            resolved.display()
        )));
    }
    Ok(resolved.to_string_lossy().into_owned())
}

#[tauri::command]
fn library_path() -> Result<String, String> {
    let path = library_dir();
    if let Err(err) = std::fs::create_dir_all(&path) {
        return Err(fail(err.to_string()));
    }
    Ok(path.to_string_lossy().into_owned())
}

fn tail_log(text: String, max_bytes: usize) -> String {
    if text.len() <= max_bytes {
        return text;
    }
    let mut start = text.len() - max_bytes;
    while start < text.len() && !text.is_char_boundary(start) {
        start += 1;
    }
    format!("… (earlier entries truncated)\n{}", &text[start..])
}

#[tauri::command]
fn read_error_log() -> Result<String, String> {
    let path = error_log_file();
    match std::fs::read_to_string(&path) {
        Ok(text) => Ok(tail_log(text, 400_000)),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(err) => Err(fail(err.to_string())),
    }
}

fn format_utc_iso(time: SystemTime) -> String {
    let secs = time
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let days = (secs / 86400) as i64;
    let day_secs = (secs % 86400) as u32;
    let hour = day_secs / 3600;
    let min = (day_secs % 3600) / 60;
    let sec = day_secs % 60;

    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };

    format!("{y:04}-{m:02}-{d:02}T{hour:02}:{min:02}:{sec:02}Z")
}

fn is_uuid_or_hex_stem(stem: &str) -> bool {
    let cleaned = stem.trim();
    if cleaned.is_empty() {
        return true;
    }
    // Standard 8-4-4-4-12 UUID
    if cleaned.len() == 36 && cleaned.chars().filter(|&c| c == '-').count() == 4 {
        return cleaned.chars().all(|c| c.is_ascii_hexdigit() || c == '-');
    }
    // 32-char hex string
    if cleaned.len() == 32 && cleaned.chars().all(|c| c.is_ascii_hexdigit()) {
        return true;
    }
    // 8+ hex chars without dashes/spaces
    if cleaned.len() >= 8 && cleaned.chars().all(|c| c.is_ascii_hexdigit()) {
        return true;
    }
    // Hex with dashes or underscores
    if cleaned.len() >= 8
        && cleaned
            .chars()
            .all(|c| c.is_ascii_hexdigit() || c == '-' || c == '_')
        && !cleaned.contains(|c: char| c.is_alphabetic() && !c.is_ascii_hexdigit())
    {
        return true;
    }
    // Pure symbols / digits
    if cleaned
        .chars()
        .all(|c| c.is_ascii_digit() || c == '-' || c == '_')
    {
        return true;
    }
    false
}

fn slug_to_proper_name(stem: &str) -> String {
    let mut cleaned = stem.trim();
    // Strip trailing unique hex suffix e.g. -a1b2c3d4 or _a1b2c3d4 (6 to 12 hex chars)
    if let Some(idx) = cleaned.rfind(['-', '_']) {
        let suffix = &cleaned[idx + 1..];
        if suffix.len() >= 6 && suffix.len() <= 12 && suffix.chars().all(|c| c.is_ascii_hexdigit())
        {
            cleaned = &cleaned[..idx];
        }
    }
    // Strip trailing duration suffix e.g. -8s, _8s, -8.5s, _1.5s, -0.4s
    if let Some(idx) = cleaned.rfind(['-', '_']) {
        let suffix = &cleaned[idx + 1..];
        if suffix.ends_with('s') && suffix[..suffix.len() - 1].parse::<f32>().is_ok() {
            cleaned = &cleaned[..idx];
        }
    }
    // Strip secondary trailing hex suffix if duration came after hex
    if let Some(idx) = cleaned.rfind(['-', '_']) {
        let suffix = &cleaned[idx + 1..];
        if suffix.len() >= 6 && suffix.len() <= 12 && suffix.chars().all(|c| c.is_ascii_hexdigit())
        {
            cleaned = &cleaned[..idx];
        }
    }

    let words: Vec<&str> = cleaned
        .split(['-', '_', ' '])
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();

    if words.is_empty() {
        return "Sound Effect".to_string();
    }

    let titled: Vec<String> = words
        .iter()
        .map(|w| {
            let mut chars = w.chars();
            match chars.next() {
                None => String::new(),
                Some(first) => {
                    first.to_uppercase().collect::<String>()
                        + chars.as_str().to_ascii_lowercase().as_str()
                }
            }
        })
        .collect();

    titled.join(" ")
}

/// Older music clips stored `Category:` / `Instruments:` in ICMT instead of the
/// generate prompt. Those comments must not become `clip.prompt` on a rescan.
fn is_legacy_info_comment(text: &str) -> bool {
    let lower = text.trim().to_ascii_lowercase();
    lower.starts_with("category:")
        || lower.starts_with("intensity:")
        || lower.starts_with("instruments:")
}

/// ICMT holds the full generate prompt; INAM is only a short Explorer title.
/// Prefer the comment unless it is a leftover music-metadata string.
fn prompt_from_info_fields(inam: &str, icmt: &str) -> String {
    let title = inam.trim();
    let comment = icmt.trim();
    if !comment.is_empty() && !is_legacy_info_comment(comment) {
        return comment.to_string();
    }
    if !title.is_empty() {
        return title.to_string();
    }
    comment.to_string()
}

fn parse_wav_file_metadata(path: &Path) -> (f32, String, String, Option<Vec<String>>) {
    let mut duration = 0.0f32;
    let mut inam = String::new();
    let mut icmt = String::new();
    let mut mode = "sfx".to_string();
    let mut instruments: Option<Vec<String>> = None;

    if let Ok(reader) = hound::WavReader::open(path) {
        let spec = reader.spec();
        let samples = reader.duration();
        if spec.sample_rate > 0 {
            duration = (samples as f32) / (spec.sample_rate as f32);
        }
    }

    if let Ok(mut file) = std::fs::File::open(path) {
        use std::io::{Read, Seek, SeekFrom};
        let mut magic = [0u8; 12];
        if file.read_exact(&mut magic).is_ok()
            && &magic[0..4] == b"RIFF"
            && &magic[8..12] == b"WAVE"
        {
            let total_file_size = file.metadata().map(|m| m.len()).unwrap_or(u64::MAX);
            let mut curr_pos = 12u64;
            while curr_pos + 8 <= total_file_size {
                if file.seek(SeekFrom::Start(curr_pos)).is_err() {
                    break;
                }
                let mut chunk_header = [0u8; 8];
                if file.read_exact(&mut chunk_header).is_err() {
                    break;
                }
                let chunk_id = &chunk_header[0..4];
                let chunk_size =
                    u32::from_le_bytes(chunk_header[4..8].try_into().unwrap_or_default()) as u64;
                let chunk_data_pos = curr_pos + 8;
                let next_chunk_pos = chunk_data_pos
                    .saturating_add(chunk_size)
                    .saturating_add(chunk_size % 2);

                if chunk_id == b"LIST" && (4..=2_000_000).contains(&chunk_size) {
                    let mut list_body = vec![0u8; chunk_size as usize];
                    if file.read_exact(&mut list_body).is_ok()
                        && list_body.len() >= 4
                        && &list_body[0..4] == b"INFO"
                    {
                        let mut sub_offset = 4;
                        while sub_offset + 8 <= list_body.len() {
                            let sub_id = &list_body[sub_offset..sub_offset + 4];
                            let sub_size = u32::from_le_bytes(
                                list_body[sub_offset + 4..sub_offset + 8]
                                    .try_into()
                                    .unwrap_or_default(),
                            ) as usize;
                            let sub_data_start = sub_offset + 8;
                            let sub_data_end = (sub_data_start + sub_size).min(list_body.len());

                            if sub_data_start <= sub_data_end {
                                if let Ok(text) =
                                    std::str::from_utf8(&list_body[sub_data_start..sub_data_end])
                                {
                                    let trimmed = text.trim_matches('\0').trim();
                                    if sub_id == b"INAM" && !trimmed.is_empty() {
                                        inam = trimmed.to_string();
                                    } else if sub_id == b"ICMT" && !trimmed.is_empty() {
                                        icmt = trimmed.to_string();
                                    } else if sub_id == b"IKEY" && !trimmed.is_empty() {
                                        let list: Vec<String> = trimmed
                                            .split(';')
                                            .map(|s| s.trim().to_string())
                                            .filter(|s| !s.is_empty())
                                            .collect();
                                        if !list.is_empty() {
                                            instruments = Some(list);
                                        }
                                    } else if sub_id == b"IGNR"
                                        && trimmed.eq_ignore_ascii_case("Instrumental")
                                    {
                                        mode = "music".to_string();
                                    } else if sub_id == b"IGNR"
                                        && trimmed.eq_ignore_ascii_case("Ambience")
                                    {
                                        mode = "ambience".to_string();
                                    }
                                }
                            }
                            sub_offset = sub_data_start
                                .saturating_add(sub_size)
                                .saturating_add(sub_size % 2);
                        }
                    }
                }
                curr_pos = next_chunk_pos;
            }
        }
    }

    let mut prompt = prompt_from_info_fields(&inam, &icmt);
    if prompt.is_empty() || is_uuid_or_hex_stem(&prompt) {
        let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
        if !stem.is_empty() && !is_uuid_or_hex_stem(stem) {
            prompt = slug_to_proper_name(stem);
        }
    }
    if prompt.to_lowercase().contains("tracktype: music") {
        mode = "music".to_string();
    }

    (duration, prompt, mode, instruments)
}

/// Dot-directories are skipped by both walkers below. `.trash` holds deleted
/// clips as real WAVs, and without this they would be rescanned straight back
/// into the library they were just removed from.
fn is_hidden_dir(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.starts_with('.'))
}

fn collect_wav_files_recursive(dir: &Path, files: &mut Vec<PathBuf>) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if is_hidden_dir(&path) {
                    continue;
                }
                collect_wav_files_recursive(&path, files);
            } else if path
                .extension()
                .and_then(|s| s.to_str())
                .map(|s| s.eq_ignore_ascii_case("wav"))
                == Some(true)
            {
                files.push(path);
            }
        }
    }
}

fn count_wav_files_recursive(dir: &Path) -> usize {
    let mut count = 0;
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if is_hidden_dir(&path) {
                    continue;
                }
                count += count_wav_files_recursive(&path);
            } else if path
                .extension()
                .and_then(|s| s.to_str())
                .map(|s| s.eq_ignore_ascii_case("wav"))
                == Some(true)
            {
                count += 1;
            }
        }
    }
    count
}

fn infer_metadata_from_path(
    root: &Path,
    file_path: &Path,
) -> (
    Option<String>,
    Option<String>,
    Option<String>,
    Option<String>,
) {
    let mut mode = None;
    let mut category = None;
    let mut subcategory = None;
    let mut intensity = None;

    let components: Vec<String> = if let Ok(rel) = file_path.strip_prefix(root) {
        rel.parent()
            .map(|p| {
                p.components()
                    .filter_map(|c| c.as_os_str().to_str().map(|s| s.to_string()))
                    .collect()
            })
            .unwrap_or_default()
    } else {
        let mut ancestors = Vec::new();
        let mut curr = file_path.parent();
        while let Some(p) = curr {
            if let Some(name) = p.file_name().and_then(|s| s.to_str()) {
                if name.is_empty() {
                    break;
                }
                ancestors.push(name.to_string());
            }
            curr = p.parent();
        }
        let mode_idx = ancestors.iter().position(|a| {
            let lower = a.to_ascii_lowercase();
            lower == "sfx" || lower == "fx" || lower == "music" || lower == "ambience"
        });
        if let Some(idx) = mode_idx {
            ancestors[..=idx].iter().rev().cloned().collect()
        } else if ancestors.len() >= 2 {
            vec![ancestors[1].clone(), ancestors[0].clone()]
        } else if !ancestors.is_empty() {
            vec![ancestors[0].clone()]
        } else {
            Vec::new()
        }
    };

    if components.is_empty() {
        return (mode, category, subcategory, intensity);
    }

    let first_lower = components[0].to_ascii_lowercase();
    let (has_mode_prefix, detected_mode) = if first_lower == "sfx" || first_lower == "fx" {
        (true, Some("sfx".to_string()))
    } else if first_lower == "music" {
        (true, Some("music".to_string()))
    } else if first_lower == "ambience" {
        (true, Some("ambience".to_string()))
    } else {
        (false, None)
    };

    if let Some(m) = detected_mode {
        mode = Some(m);
    }

    let remaining = if has_mode_prefix {
        &components[1..]
    } else {
        &components[..]
    };

    if remaining.len() >= 2 {
        category = Some(remaining[0].clone());
        let sub = remaining[1].clone();
        if mode.as_deref() == Some("music") {
            intensity = Some(sub.clone());
        }
        subcategory = Some(sub);
    } else if remaining.len() == 1 {
        let name = &remaining[0];
        category = Some(name.clone());
    }

    (mode, category, subcategory, intensity)
}

fn clip_json_from_path(root: &Path, path: &Path) -> Option<serde_json::Value> {
    let file_stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();
    if file_stem.is_empty() {
        return None;
    }
    let meta = path.metadata().ok()?;
    let created_at = meta
        .modified()
        .or_else(|_| meta.created())
        .map(format_utc_iso)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string());

    let (duration, mut prompt, parsed_mode, instruments) = parse_wav_file_metadata(path);
    let (path_mode, path_cat, path_subcat, path_intensity) = infer_metadata_from_path(root, path);

    let final_mode = path_mode.unwrap_or(parsed_mode);

    if prompt.is_empty() || is_uuid_or_hex_stem(&prompt) {
        if let Some(ref sub) = path_subcat {
            if !sub.eq_ignore_ascii_case("general") && !sub.eq_ignore_ascii_case("level i") {
                prompt = format!("{sub} Sound");
            }
        }
        if prompt.is_empty() || is_uuid_or_hex_stem(&prompt) {
            if let Some(ref cat) = path_cat {
                if !cat.eq_ignore_ascii_case("custom") && !cat.eq_ignore_ascii_case("general") {
                    prompt = format!("{cat} Sound");
                }
            }
        }
        if prompt.is_empty() || is_uuid_or_hex_stem(&prompt) {
            prompt = if final_mode == "music" {
                "Instrumental".to_string()
            } else if final_mode == "ambience" {
                "Ambience".to_string()
            } else {
                "Sound Effect".to_string()
            };
        }
    }

    Some(serde_json::json!({
        "id": file_stem,
        "path": path.to_string_lossy(),
        "prompt": prompt,
        "duration": duration,
        "createdAt": created_at,
        "mode": final_mode,
        "category": path_cat,
        "subcategory": path_subcat,
        "intensity": path_intensity,
        "instruments": instruments
    }))
}

fn ensure_scan_root(scope: &PathScope, dir: Option<String>) -> Result<PathBuf, String> {
    let root = dir
        .filter(|d| !d.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(library_dir);
    ensure_allowed(scope, &root.to_string_lossy())
}

fn scan_library_categories_inner(
    root: PathBuf,
    mode: Option<String>,
) -> Result<Vec<serde_json::Value>, String> {
    if !root.exists() {
        return Ok(Vec::new());
    }

    let filter_mode = mode
        .map(|m| m.trim().to_ascii_lowercase())
        .filter(|m| !m.is_empty());
    let mut categories = Vec::new();

    let mode_dirs = match &filter_mode {
        Some(m) if m == "music" => vec![("music", root.join("music"))],
        Some(m) if m == "ambience" => vec![("ambience", root.join("ambience"))],
        Some(m) if m == "sfx" || m == "fx" => {
            vec![("sfx", root.join("sfx")), ("sfx", root.join("fx"))]
        }
        _ => vec![
            ("sfx", root.join("sfx")),
            ("sfx", root.join("fx")),
            ("ambience", root.join("ambience")),
            ("music", root.join("music")),
        ],
    };

    let mut found_mode_dir = false;
    for (m_name, m_path) in &mode_dirs {
        if m_path.is_dir() {
            found_mode_dir = true;
            if let Ok(cat_entries) = std::fs::read_dir(m_path) {
                for cat_entry in cat_entries.flatten() {
                    let cat_path = cat_entry.path();
                    if !cat_path.is_dir() {
                        continue;
                    }
                    let cat_name = cat_path
                        .file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or("")
                        .to_string();
                    if cat_name.is_empty() {
                        continue;
                    }

                    let mut subcategories = Vec::new();
                    let mut cat_count = 0;

                    if let Ok(sub_entries) = std::fs::read_dir(&cat_path) {
                        for sub_entry in sub_entries.flatten() {
                            let sub_path = sub_entry.path();
                            if sub_path.is_dir() {
                                let sub_name = sub_path
                                    .file_name()
                                    .and_then(|s| s.to_str())
                                    .unwrap_or("")
                                    .to_string();
                                if !sub_name.is_empty() {
                                    let sub_count = count_wav_files_recursive(&sub_path);
                                    cat_count += sub_count;
                                    subcategories.push(serde_json::json!({
                                        "name": sub_name,
                                        "path": sub_path.to_string_lossy(),
                                        "count": sub_count,
                                    }));
                                }
                            } else if sub_path
                                .extension()
                                .and_then(|s| s.to_str())
                                .map(|s| s.eq_ignore_ascii_case("wav"))
                                == Some(true)
                            {
                                cat_count += 1;
                            }
                        }
                    }

                    subcategories.sort_by(|a, b| {
                        let a_name = a["name"].as_str().unwrap_or("");
                        let b_name = b["name"].as_str().unwrap_or("");
                        if a_name == "General" {
                            std::cmp::Ordering::Greater
                        } else if b_name == "General" {
                            std::cmp::Ordering::Less
                        } else {
                            a_name.cmp(b_name)
                        }
                    });

                    categories.push(serde_json::json!({
                        "name": cat_name,
                        "mode": m_name,
                        "path": cat_path.to_string_lossy(),
                        "count": cat_count,
                        "subcategories": subcategories,
                    }));
                }
            }
        }
    }

    if !found_mode_dir {
        if let Ok(entries) = std::fs::read_dir(&root) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let name = path
                        .file_name()
                        .and_then(|s| s.to_str())
                        .unwrap_or("")
                        .to_string();
                    if name.is_empty() || name.eq_ignore_ascii_case("logs") {
                        continue;
                    }
                    let mut subcategories = Vec::new();
                    let mut cat_count = 0;
                    if let Ok(sub_entries) = std::fs::read_dir(&path) {
                        for sub_entry in sub_entries.flatten() {
                            let sub_path = sub_entry.path();
                            if sub_path.is_dir() {
                                let sub_name = sub_path
                                    .file_name()
                                    .and_then(|s| s.to_str())
                                    .unwrap_or("")
                                    .to_string();
                                if !sub_name.is_empty() {
                                    let sub_count = count_wav_files_recursive(&sub_path);
                                    cat_count += sub_count;
                                    subcategories.push(serde_json::json!({
                                        "name": sub_name,
                                        "path": sub_path.to_string_lossy(),
                                        "count": sub_count,
                                    }));
                                }
                            } else if sub_path
                                .extension()
                                .and_then(|s| s.to_str())
                                .map(|s| s.eq_ignore_ascii_case("wav"))
                                == Some(true)
                            {
                                cat_count += 1;
                            }
                        }
                    }
                    categories.push(serde_json::json!({
                        "name": name,
                        "mode": filter_mode.as_deref().unwrap_or("sfx"),
                        "path": path.to_string_lossy(),
                        "count": cat_count,
                        "subcategories": subcategories,
                    }));
                }
            }
        }
    }

    categories.sort_by(|a, b| {
        let a_name = a["name"].as_str().unwrap_or("");
        let b_name = b["name"].as_str().unwrap_or("");
        if a_name == "Custom" {
            std::cmp::Ordering::Greater
        } else if b_name == "Custom" {
            std::cmp::Ordering::Less
        } else {
            a_name.cmp(b_name)
        }
    });

    Ok(categories)
}

#[tauri::command]
async fn scan_library_categories(
    scope: State<'_, PathScope>,
    dir: Option<String>,
    mode: Option<String>,
) -> Result<Vec<serde_json::Value>, String> {
    let root = ensure_scan_root(&scope, dir)?;
    run_blocking(move || scan_library_categories_inner(root, mode)).await
}

fn scan_folder_tracks_inner(path: PathBuf) -> Result<Vec<serde_json::Value>, String> {
    if !path.exists() {
        return Ok(Vec::new());
    }

    let mut wav_paths = Vec::new();
    collect_wav_files_recursive(&path, &mut wav_paths);

    let root = library_dir();
    let mut clips = Vec::new();

    for wav_path in wav_paths {
        if let Some(clip_json) = clip_json_from_path(&root, &wav_path) {
            clips.push(clip_json);
        }
    }

    clips.sort_by(|a, b| {
        let a_time = a["createdAt"].as_str().unwrap_or("");
        let b_time = b["createdAt"].as_str().unwrap_or("");
        b_time.cmp(a_time)
    });

    Ok(clips)
}

#[tauri::command]
async fn scan_folder_tracks(
    scope: State<'_, PathScope>,
    folder_path: String,
) -> Result<Vec<serde_json::Value>, String> {
    let path = ensure_allowed(&scope, &folder_path)?;
    run_blocking(move || scan_folder_tracks_inner(path)).await
}

fn scan_library_dir_inner(target: PathBuf) -> Result<Vec<serde_json::Value>, String> {
    if !target.exists() {
        return Ok(Vec::new());
    }

    let mut wav_paths = Vec::new();
    collect_wav_files_recursive(&target, &mut wav_paths);

    let mut clips = Vec::new();
    for path in wav_paths {
        if let Some(clip_json) = clip_json_from_path(&target, &path) {
            clips.push(clip_json);
        }
    }

    clips.sort_by(|a, b| {
        let a_time = a["createdAt"].as_str().unwrap_or("");
        let b_time = b["createdAt"].as_str().unwrap_or("");
        b_time.cmp(a_time)
    });

    Ok(clips)
}

#[tauri::command]
async fn scan_library_dir(
    scope: State<'_, PathScope>,
    dir: Option<String>,
) -> Result<Vec<serde_json::Value>, String> {
    let target = ensure_scan_root(&scope, dir)?;
    run_blocking(move || scan_library_dir_inner(target)).await
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        // The plugin deserializes `plugins.updater` during setup and aborts the
        // whole app if that key is absent (`pubkey` has no serde default), so
        // tauri.conf.json carries an empty block. `check()` then reports no
        // endpoints — this build has no update channel — instead of the app
        // dying before its window opens. Release builds fill the block in
        // through src-tauri/tauri.updater.conf.json.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(Engine {
            proc: Mutex::new(None),
        })
        .manage(PathScope::load())
        .invoke_handler(tauri::generate_handler![
            engine_status,
            engine_probe,
            engine_generate,
            engine_cancel,
            engine_encode_audio,
            engine_warmup,
            engine_unload,
            write_file,
            write_file_atomic,
            read_file,
            copy_file,
            move_file,
            delete_file,
            zip_files,
            temp_dir,
            pick_save_path,
            pick_directory,
            reveal_path,
            log_error,
            error_log_path,
            library_path,
            set_library_dir,
            read_error_log,
            scan_library_dir,
            scan_library_categories,
            scan_folder_tracks
        ])
        .run(tauri::generate_context!())
        .expect("error while running Thunder FX");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env::temp_dir as std_temp;
    use std::sync::Mutex;

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    /// Sets an env var for the duration of a test and restores the previous
    /// value on drop, so one test's override cannot leak into the next.
    struct EnvGuard {
        key: &'static str,
        previous: Option<String>,
    }

    impl EnvGuard {
        fn set(key: &'static str, value: &Path) -> Self {
            Self::set_str(key, &value.to_string_lossy())
        }

        fn set_str(key: &'static str, value: &str) -> Self {
            let previous = std::env::var(key).ok();
            unsafe {
                std::env::set_var(key, value);
            }
            EnvGuard { key, previous }
        }
    }

    impl Drop for EnvGuard {
        fn drop(&mut self) {
            unsafe {
                match &self.previous {
                    Some(value) => std::env::set_var(self.key, value),
                    None => std::env::remove_var(self.key),
                }
            }
        }
    }

    #[test]
    fn append_error_log_writes_file() {
        let _lock = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let dir = std_temp().join(format!("thunder-fx-log-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let _guard = EnvGuard::set("THUNDER_FX_LOG_DIR", &dir);
        append_error_log("omen test");
        let text = std::fs::read_to_string(dir.join("error.log")).unwrap();
        assert!(text.contains("omen test"));
        assert!(text.contains("ERROR"));
    }

    #[test]
    fn pytorch_alloc_conf_defaults_when_unset() {
        let _lock = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let previous = std::env::var("PYTORCH_CUDA_ALLOC_CONF").ok();
        unsafe {
            std::env::remove_var("PYTORCH_CUDA_ALLOC_CONF");
        }
        assert_eq!(
            default_pytorch_cuda_alloc_conf(),
            Some("expandable_segments:True")
        );
        let _guard = EnvGuard::set_str("PYTORCH_CUDA_ALLOC_CONF", "max_split_size_mb:128");
        assert_eq!(default_pytorch_cuda_alloc_conf(), None);
        drop(_guard);
        unsafe {
            match previous {
                Some(value) => std::env::set_var("PYTORCH_CUDA_ALLOC_CONF", value),
                None => std::env::remove_var("PYTORCH_CUDA_ALLOC_CONF"),
            }
        }
    }

    #[test]
    fn read_error_log_returns_appended_text() {
        let _lock = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let dir = std_temp().join(format!("thunder-fx-read-log-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let _guard = EnvGuard::set("THUNDER_FX_LOG_DIR", &dir);
        append_error_log("omen from sidecar");
        let text = read_error_log().unwrap();
        assert!(text.contains("omen from sidecar"));
    }

    #[test]
    fn generate_timeout_scales_with_work_and_stays_bounded() {
        // Short clips still get a floor generous enough for a cold pipeline.
        assert_eq!(generate_timeout_secs(0.5, 20), 600);
        // A long, high-step run gets far more than the old fixed 600s.
        assert!(generate_timeout_secs(380.0, 100) > 600);
        // And never unbounded.
        assert_eq!(generate_timeout_secs(380.0, 100), 7200);
        assert!(generate_timeout_secs(30.0, 20) >= generate_timeout_secs(30.0, 8));
    }

    #[test]
    fn scope_allows_library_and_temp_but_rejects_elsewhere() {
        let _lock = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let lib = std_temp().join(format!("thunder-fx-scope-{}", std::process::id()));
        std::fs::create_dir_all(&lib).unwrap();
        let _guard = EnvGuard::set("THUNDER_FX_LIBRARY_DIR", &lib);
        let scope = PathScope {
            granted: Mutex::new(Vec::new()),
            library: Mutex::new(None),
        };

        // Inside the library root, including a file that does not exist yet.
        let inside = lib.join("sfx").join("Combat").join("new.wav");
        assert!(ensure_allowed(&scope, &inside.to_string_lossy()).is_ok());

        // Traversal out of an allowed root is rejected.
        let escape = lib.join("..").join("..").join("secrets.txt");
        assert!(ensure_allowed(&scope, &escape.to_string_lossy()).is_err());

        // An unrelated absolute path is rejected until it is granted.
        let outside = std_temp()
            .parent()
            .unwrap_or(Path::new("/"))
            .join("thunder-fx-not-granted.txt");
        assert!(ensure_allowed(&scope, &outside.to_string_lossy()).is_err());
        scope
            .granted
            .lock()
            .unwrap()
            .push(normalize_path(outside.parent().unwrap_or(Path::new("/"))));
        assert!(ensure_allowed(&scope, &outside.to_string_lossy()).is_ok());

        let _ = std::fs::remove_dir_all(&lib);
    }

    #[test]
    fn scope_follows_the_configured_library_folder() {
        let _lock = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        // Deliberately outside the temp dir, which is an allowed root already.
        let base = std_temp().parent().unwrap_or(Path::new("/")).to_path_buf();
        let default_lib = base.join(format!("thunder-fx-default-{}", std::process::id()));
        let _guard = EnvGuard::set("THUNDER_FX_LIBRARY_DIR", &default_lib);
        // `set_library` persists, so keep it off the real config file.
        let scope_file = std_temp().join(format!("thunder-fx-scope-{}.json", std::process::id()));
        let _scope_guard = EnvGuard::set("THUNDER_FX_SCOPE_FILE", &scope_file);
        let scope = PathScope {
            granted: Mutex::new(Vec::new()),
            library: Mutex::new(None),
        };

        // A library folder the user typed rather than picked in a dialog: the
        // engine writes there, so reading it back has to be allowed.
        let custom = base.join(format!("thunder-fx-custom-{}", std::process::id()));
        let clip = custom.join("music").join("Learning").join("clip.wav");
        assert!(ensure_allowed(&scope, &clip.to_string_lossy()).is_err());
        scope.set_library(Some(custom.to_string_lossy().as_ref()));
        assert!(ensure_allowed(&scope, &clip.to_string_lossy()).is_ok());

        // Pointing it elsewhere replaces the root instead of accumulating one.
        let other = base.join(format!("thunder-fx-other-{}", std::process::id()));
        scope.set_library(Some(other.to_string_lossy().as_ref()));
        assert!(ensure_allowed(&scope, &clip.to_string_lossy()).is_err());

        // Clearing it falls back to the default library root.
        scope.set_library(None);
        assert!(ensure_allowed(&scope, &other.join("clip.wav").to_string_lossy()).is_err());
        assert!(ensure_allowed(&scope, &default_lib.join("clip.wav").to_string_lossy()).is_ok());

        let _ = std::fs::remove_file(&scope_file);
    }

    #[test]
    fn zip_archive_includes_renamed_entry() {
        let dir = std::env::temp_dir().join(format!("thunder-fx-zip-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let src = dir.join("source.wav");
        std::fs::write(&src, b"RIFFTEST").unwrap();
        let dest = dir.join("pack.zip");
        write_zip_archive(
            vec![ZipEntry {
                src: src.to_string_lossy().into_owned(),
                dest: "SFX_Combat_Sword_01.wav".into(),
            }],
            &dest,
            Some("{\"app\":\"Thunder FX\"}".into()),
        )
        .unwrap();
        assert!(dest.metadata().unwrap().len() > 20);
        let archive_file = File::open(&dest).unwrap();
        let mut archive = zip::ZipArchive::new(archive_file).unwrap();
        {
            let wav = archive.by_name("SFX_Combat_Sword_01.wav").unwrap();
            assert_eq!(wav.compression(), zip::CompressionMethod::Stored);
        }
        {
            let manifest = archive.by_name("manifest.json").unwrap();
            assert_eq!(manifest.compression(), zip::CompressionMethod::Deflated);
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn wav_scan_skips_dot_directories() {
        // `.trash` holds deleted clips as real WAVs. If the walker descended
        // into it, every delete would come straight back on the next scan.
        let dir = std::env::temp_dir().join(format!("thunder-fx-scan-{}", uuid::Uuid::new_v4()));
        let kept = dir.join("sfx").join("combat");
        let trashed = dir.join(".trash");
        std::fs::create_dir_all(&kept).unwrap();
        std::fs::create_dir_all(&trashed).unwrap();
        std::fs::write(kept.join("sword.wav"), b"RIFFTEST").unwrap();
        std::fs::write(trashed.join("door--1.wav"), b"RIFFTEST").unwrap();

        let mut found = Vec::new();
        collect_wav_files_recursive(&dir, &mut found);

        assert_eq!(found.len(), 1, "only the live clip should be collected");
        assert!(found[0].ends_with("sword.wav"));
        assert_eq!(count_wav_files_recursive(&dir), 1);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn hidden_dir_detection_matches_only_dot_prefixes() {
        assert!(is_hidden_dir(Path::new(r"C:\library\.trash")));
        assert!(is_hidden_dir(Path::new("/library/.git")));
        assert!(!is_hidden_dir(Path::new(r"C:\library\sfx")));
        assert!(!is_hidden_dir(Path::new("/library/ambience")));
    }

    #[test]
    fn library_path_uses_override_dir() {
        let _lock = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let dir = std_temp().join(format!("thunder-fx-lib-{}", std::process::id()));
        let _guard = EnvGuard::set("THUNDER_FX_LIBRARY_DIR", &dir);
        let path = library_path().unwrap();
        assert!(path.contains("thunder-fx-lib-"));
        assert!(dir.is_dir());
    }

    fn write_dummy_venv_python(root: &Path) -> PathBuf {
        let scripts = root.join("Scripts");
        std::fs::create_dir_all(&scripts).unwrap();
        let python = scripts.join("python.exe");
        std::fs::write(&python, []).unwrap();
        python
    }

    #[test]
    fn venv_python_uses_venv_beside_worker() {
        let root = std_temp().join(format!("thunder-fx-venv-dev-{}", std::process::id()));
        let python = write_dummy_venv_python(&root.join(".venv"));
        let worker = root.join("worker.py");
        std::fs::write(&worker, []).unwrap();
        assert_eq!(venv_python(&worker).as_deref(), Some(python.as_path()));
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn venv_python_uses_parent_venv_when_worker_is_nested_in_engine() {
        let dest = std_temp().join(format!("thunder-fx-venv-portable-{}", std::process::id()));
        let python = write_dummy_venv_python(&dest.join(".venv"));
        let engine = dest.join("engine");
        std::fs::create_dir_all(&engine).unwrap();
        let worker = engine.join("worker.py");
        std::fs::write(&worker, []).unwrap();
        assert_eq!(venv_python(&worker).as_deref(), Some(python.as_path()));
        let _ = std::fs::remove_dir_all(&dest);
    }

    #[test]
    fn scan_library_categories_and_tracks_discovers_nested_folders() {
        // Taken outside the async block: a std guard must not span an await.
        let _lock = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        tauri::async_runtime::block_on(async {
            let dir = std_temp().join(format!("thunder-fx-cat-test-{}", std::process::id()));
            let sword_dir = dir.join("sfx").join("Combat").join("Sword");
            std::fs::create_dir_all(&sword_dir).unwrap();

            let spec = hound::WavSpec {
                channels: 2,
                sample_rate: 44100,
                bits_per_sample: 16,
                sample_format: hound::SampleFormat::Int,
            };
            let wav_path = sword_dir.join("test-sword.wav");
            {
                let mut w = hound::WavWriter::create(&wav_path, spec).unwrap();
                w.write_sample(0i16).unwrap();
                w.write_sample(0i16).unwrap();
            }

            let cats = scan_library_categories_inner(dir.clone(), Some("sfx".into())).unwrap();
            assert_eq!(cats.len(), 1);
            assert_eq!(cats[0]["name"], "Combat");
            assert_eq!(cats[0]["count"], 1);
            let subcats = cats[0]["subcategories"].as_array().unwrap();
            assert_eq!(subcats.len(), 1);
            assert_eq!(subcats[0]["name"], "Sword");
            assert_eq!(subcats[0]["count"], 1);

            let tracks = scan_folder_tracks_inner(sword_dir.clone()).unwrap();
            assert_eq!(tracks.len(), 1);
            assert_eq!(tracks[0]["id"], "test-sword");
            assert_eq!(tracks[0]["category"], "Combat");
            assert_eq!(tracks[0]["subcategory"], "Sword");
            assert_eq!(tracks[0]["mode"], "sfx");

            let all_clips = scan_library_dir_inner(dir.clone()).unwrap();
            assert_eq!(all_clips.len(), 1);
            assert_eq!(all_clips[0]["id"], "test-sword");

            let _ = std::fs::remove_dir_all(&dir);
        });
    }

    #[test]
    fn uuid_detection_and_slug_conversion() {
        assert!(is_uuid_or_hex_stem("67de8afe-9708-4034-8f23-8c4391694f47"));
        assert!(is_uuid_or_hex_stem("67de8afe970840348f238c4391694f47"));
        assert!(!is_uuid_or_hex_stem("steel-shortsword-clash-8s-a1b2c3"));
        assert!(!is_uuid_or_hex_stem("laser-blast"));

        assert_eq!(
            slug_to_proper_name("steel-shortsword-clash-8s-a1b2c3d4"),
            "Steel Shortsword Clash"
        );
        assert_eq!(slug_to_proper_name("laser-blast-0.4s"), "Laser Blast");
        assert_eq!(
            slug_to_proper_name("tavern_door_heavy"),
            "Tavern Door Heavy"
        );
    }

    #[test]
    fn path_metadata_inference_does_not_use_root_folder_as_category() {
        let root = Path::new("C:\\music-and-fx-generated-library");
        let file_in_root = root.join("sound-1.wav");
        let (mode, cat, sub, _) = infer_metadata_from_path(root, &file_in_root);
        assert_eq!(mode, None);
        assert_eq!(cat, None);
        assert_eq!(sub, None);

        let file_in_gen = root.join("General").join("sound-1.wav");
        let (_, cat, sub, _) = infer_metadata_from_path(root, &file_in_gen);
        assert_eq!(cat.as_deref(), Some("General"));
        assert_eq!(sub, None);

        let file_in_nested = root
            .join("sfx")
            .join("Combat")
            .join("Swords")
            .join("sound-1.wav");
        let (mode, cat, sub, _) = infer_metadata_from_path(root, &file_in_nested);
        assert_eq!(mode.as_deref(), Some("sfx"));
        assert_eq!(cat.as_deref(), Some("Combat"));
        assert_eq!(sub.as_deref(), Some("Swords"));

        let file_in_ambience = root
            .join("ambience")
            .join("Weather")
            .join("Rain")
            .join("rain-1.wav");
        let (mode, cat, sub, _) = infer_metadata_from_path(root, &file_in_ambience);
        assert_eq!(mode.as_deref(), Some("ambience"));
        assert_eq!(cat.as_deref(), Some("Weather"));
        assert_eq!(sub.as_deref(), Some("Rain"));
    }

    #[test]
    fn prompt_from_info_prefers_full_icmt_over_short_title() {
        let full = "TrackType: SFX, polished steel shortsword drawn from a worn oiled leather scabbard, bright metallic ring, crisp attack, close mic, dry studio, fast decay. Length: 2 seconds";
        let title =
            "polished steel shortsword drawn from a worn oiled leather scabbard, bright metallic";
        assert_eq!(prompt_from_info_fields(title, full), full);
    }

    #[test]
    fn prompt_from_info_keeps_legacy_music_comment_off_the_clip() {
        assert_eq!(
            prompt_from_info_fields(
                "lute tavern theme, warm strings",
                "Category: Ancient Discovery · Intensity: I · Instruments: duduk, harp"
            ),
            "lute tavern theme, warm strings"
        );
        assert_eq!(
            prompt_from_info_fields("lute and cello", "Instruments: lute, cello"),
            "lute and cello"
        );
        assert!(is_legacy_info_comment("Instruments: lute"));
        assert!(!is_legacy_info_comment(
            "TrackType: SFX, heavy oak door slamming shut, close mic"
        ));
    }

    const REGISTERED_COMMANDS: &[&str] = &[
        "engine_status",
        "engine_probe",
        "engine_generate",
        "engine_cancel",
        "engine_encode_audio",
        "engine_warmup",
        "engine_unload",
        "write_file",
        "write_file_atomic",
        "read_file",
        "copy_file",
        "move_file",
        "delete_file",
        "zip_files",
        "temp_dir",
        "pick_save_path",
        "pick_directory",
        "reveal_path",
        "log_error",
        "error_log_path",
        "library_path",
        "set_library_dir",
        "read_error_log",
        "scan_library_dir",
        "scan_library_categories",
        "scan_folder_tracks",
    ];

    #[test]
    fn engine_acl_covers_every_registered_command() {
        let toml = include_str!("../permissions/engine.toml");
        for cmd in REGISTERED_COMMANDS {
            assert!(
                toml.contains(&format!("\"{cmd}\"")),
                "{cmd} is registered in generate_handler! but missing from permissions/engine.toml"
            );
        }
    }

    #[test]
    fn scan_commands_refuse_paths_outside_the_scope() {
        let _lock = ENV_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        let lib = std_temp().join(format!("thunder-fx-scan-scope-{}", std::process::id()));
        std::fs::create_dir_all(&lib).unwrap();
        let _guard = EnvGuard::set("THUNDER_FX_LIBRARY_DIR", &lib);
        let scope = PathScope {
            granted: Mutex::new(Vec::new()),
            library: Mutex::new(None),
        };
        let outside = std_temp()
            .parent()
            .unwrap_or(Path::new("/"))
            .join(format!("thunder-fx-scan-escape-{}", std::process::id()));
        std::fs::create_dir_all(&outside).unwrap();

        assert!(ensure_scan_root(&scope, Some(outside.to_string_lossy().into())).is_err());
        assert!(ensure_allowed(&scope, &outside.to_string_lossy()).is_err());
        assert!(ensure_scan_root(&scope, Some(lib.to_string_lossy().into())).is_ok());

        let _ = std::fs::remove_dir_all(&lib);
        let _ = std::fs::remove_dir_all(&outside);
    }

    #[test]
    fn write_bytes_atomic_leaves_a_bak_and_a_complete_file() {
        let dir = std_temp().join(format!("thunder-fx-atomic-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("thunder-fx-meta.json");
        write_bytes_atomic(&path, b"{\"version\":1}\n").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "{\"version\":1}\n");
        write_bytes_atomic(&path, b"{\"version\":2}\n").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "{\"version\":2}\n");
        let bak = scope_sidecar_bak(&path);
        assert_eq!(std::fs::read_to_string(&bak).unwrap(), "{\"version\":1}\n");
        let _ = std::fs::remove_dir_all(&dir);
    }
}
