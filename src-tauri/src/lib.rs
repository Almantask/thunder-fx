use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use std::fs::OpenOptions;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};

struct Engine {
    proc: Mutex<Option<Arc<EngineProc>>>,
}

struct EngineProc {
    stdin: Mutex<ChildStdin>,
    stdout: Mutex<BufReader<ChildStdout>>,
    child: Mutex<Child>,
}

impl Drop for EngineProc {
    fn drop(&mut self) {
        if let Ok(mut child) = self.child.lock() {
            let _ = child.kill();
        }
    }
}

#[derive(Serialize, Clone)]
struct WeaveProgressPayload {
    step: u32,
    total: u32,
    #[serde(rename = "elapsedMs")]
    elapsed_ms: u64,
}

#[derive(Serialize)]
struct TrimResult {
    path: String,
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

fn venv_python(script: &Path) -> Option<PathBuf> {
    let engine_dir = script.parent()?;
    let windows = engine_dir.join(".venv").join("Scripts").join("python.exe");
    if windows.exists() {
        return Some(windows);
    }
    let unix = engine_dir.join(".venv").join("bin").join("python");
    if unix.exists() {
        return Some(unix);
    }
    None
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

fn spawn_python(script: &Path) -> Result<Child, String> {
    let mock = std::env::var("THUNDER_FX_MOCK_ENGINE").ok();
    let mut last_err = "no Python interpreter attempted".to_string();
    for mut cmd in python_commands(script) {
        cmd.stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .env("PYTHONUNBUFFERED", "1");
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
    Ok(EngineProc {
        stdin: Mutex::new(stdin),
        stdout: Mutex::new(BufReader::new(stdout)),
        child: Mutex::new(child),
    })
}

fn ensure_engine(app: &AppHandle, state: &State<Engine>) -> Result<Arc<EngineProc>, String> {
    let mut guard = state.proc.lock().map_err(|e| fail(e.to_string()))?;
    if guard.is_none() {
        *guard = Some(Arc::new(spawn_engine(app)?));
    }
    Ok(Arc::clone(guard.as_ref().unwrap()))
}

fn send_line(proc: &EngineProc, payload: &serde_json::Value) -> Result<(), String> {
    let mut stdin = proc.stdin.lock().map_err(|e| fail(e.to_string()))?;
    writeln!(stdin, "{payload}").map_err(|e| fail(e.to_string()))?;
    stdin.flush().map_err(|e| fail(e.to_string()))
}

fn read_until_terminal(
    proc: &EngineProc,
    id: &serde_json::Value,
    app: Option<&AppHandle>,
    progress_event: Option<&str>,
) -> Result<serde_json::Value, String> {
    let mut stdout = proc.stdout.lock().map_err(|e| fail(e.to_string()))?;
    let mut line = String::new();
    loop {
        line.clear();
        let n = stdout.read_line(&mut line).map_err(|e| fail(e.to_string()))?;
        if n == 0 {
            return Err(fail("engine closed"));
        }
        let parsed: serde_json::Value =
            serde_json::from_str(line.trim()).map_err(|e| fail(e.to_string()))?;
        if parsed.get("id") != Some(id) {
            continue;
        }
        match parsed.get("event").and_then(|v| v.as_str()).unwrap_or("") {
            "progress" => {
                if let (Some(app), Some(name)) = (app, progress_event) {
                    let payload = WeaveProgressPayload {
                        step: parsed.get("step").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                        total: parsed.get("total").and_then(|v| v.as_u64()).unwrap_or(8) as u32,
                        elapsed_ms: parsed
                            .get("elapsedMs")
                            .and_then(|v| v.as_u64())
                            .unwrap_or(0),
                    };
                    let _ = app.emit(name, payload);
                }
            }
            _ => return Ok(parsed),
        }
    }
}

#[tauri::command]
fn engine_status(app: AppHandle, state: State<Engine>) -> Result<serde_json::Value, String> {
    let proc = ensure_engine(&app, &state)?;
    let payload = serde_json::json!({"id":"status","cmd":"status"});
    send_line(&proc, &payload)?;
    read_until_terminal(&proc, &payload["id"], None, None)
}

#[tauri::command]
fn engine_probe(
    app: AppHandle,
    state: State<Engine>,
    hf_token: Option<String>,
) -> Result<serde_json::Value, String> {
    let proc = ensure_engine(&app, &state)?;
    let payload = serde_json::json!({"id":"probe","cmd":"probe", "hf_token": hf_token});
    send_line(&proc, &payload)?;
    read_until_terminal(&proc, &payload["id"], None, None)
}

#[tauri::command]
fn engine_generate(
    app: AppHandle,
    state: State<Engine>,
    prompt: String,
    seconds: f32,
    seed: i64,
    cfg: f32,
    negative: String,
    hf_token: Option<String>,
    library_dir: Option<String>,
) -> Result<serde_json::Value, String> {
    let proc = ensure_engine(&app, &state)?;
    let payload = serde_json::json!({
        "id": uuid::Uuid::new_v4().to_string(),
        "cmd": "generate",
        "prompt": prompt,
        "seconds": seconds,
        "seed": seed,
        "cfg": cfg,
        "negative": negative,
        "hf_token": hf_token,
        "library_dir": library_dir
    });
    send_line(&proc, &payload)?;
    read_until_terminal(&proc, &payload["id"], Some(&app), Some("weave-progress"))
}

#[tauri::command]
fn engine_cancel(app: AppHandle, state: State<Engine>) -> Result<serde_json::Value, String> {
    let proc = ensure_engine(&app, &state)?;
    let payload = serde_json::json!({"id":"cancel","cmd":"cancel"});
    send_line(&proc, &payload)?;
    Ok(payload)
}

#[tauri::command]
fn engine_encode_ogg(
    app: AppHandle,
    state: State<Engine>,
    wav_path: String,
    ogg_path: String,
) -> Result<serde_json::Value, String> {
    let proc = ensure_engine(&app, &state)?;
    let payload = serde_json::json!({
        "id": uuid::Uuid::new_v4().to_string(),
        "cmd": "encode_ogg",
        "wav_path": wav_path,
        "ogg_path": ogg_path
    });
    send_line(&proc, &payload)?;
    read_until_terminal(&proc, &payload["id"], None, None)
}

#[tauri::command]
fn engine_warmup(
    app: AppHandle,
    state: State<Engine>,
    hf_token: Option<String>,
) -> Result<serde_json::Value, String> {
    let proc = ensure_engine(&app, &state)?;
    let payload = serde_json::json!({"id":"warmup","cmd":"warmup", "hf_token": hf_token});
    send_line(&proc, &payload)?;
    read_until_terminal(&proc, &payload["id"], Some(&app), Some("scribe-progress"))
}

#[tauri::command]
fn trim_wav(src: String, dest: String, start: f32, end: f32) -> Result<TrimResult, String> {
    let mut reader = hound::WavReader::open(&src).map_err(|e| fail(e.to_string()))?;
    let spec = reader.spec();
    let sr = spec.sample_rate as f32;
    let ch = spec.channels as usize;
    let samples: Vec<i16> = reader.samples::<i16>().filter_map(|s| s.ok()).collect();
    let frames = samples.len() / ch.max(1);
    let start_f = ((start * sr) as usize).min(frames.saturating_sub(1));
    let end_f = ((end * sr) as usize).clamp(start_f + 1, frames);
    let slice = &samples[start_f * ch..end_f * ch];
    let dest_path = Path::new(&dest);
    if let Some(parent) = dest_path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| fail(e.to_string()))?;
    }
    let mut writer = hound::WavWriter::create(dest_path, spec).map_err(|e| fail(e.to_string()))?;
    for s in slice {
        writer.write_sample(*s).map_err(|e| fail(e.to_string()))?;
    }
    writer.finalize().map_err(|e| fail(e.to_string()))?;
    Ok(TrimResult { path: dest })
}

#[tauri::command]
fn write_file_b64(path: String, data: String) -> Result<(), String> {
    let bytes = STANDARD.decode(data).map_err(|e| fail(e.to_string()))?;
    if let Some(parent) = Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| fail(e.to_string()))?;
    }
    std::fs::write(path, bytes).map_err(|e| fail(e.to_string()))
}

#[tauri::command]
fn read_file_b64(path: String) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| fail(e.to_string()))?;
    Ok(STANDARD.encode(bytes))
}

#[tauri::command]
fn temp_dir() -> Result<String, String> {
    Ok(std::env::temp_dir().to_string_lossy().into_owned())
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::env::temp_dir as std_temp;
    use std::sync::Mutex;

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    #[test]
    fn trim_shortens_file() {
        let path = std_temp().join("thunder-fx-test.wav");
        let spec = hound::WavSpec {
            channels: 2,
            sample_rate: 44100,
            bits_per_sample: 16,
            sample_format: hound::SampleFormat::Int,
        };
        {
            let mut w = hound::WavWriter::create(&path, spec).unwrap();
            for _ in 0..(44100 * 2) {
                w.write_sample(0i16).unwrap();
                w.write_sample(0i16).unwrap();
            }
        }
        let dest = std_temp().join("thunder-fx-trim.wav");
        trim_wav(
            path.to_string_lossy().into(),
            dest.to_string_lossy().into(),
            0.5,
            1.5,
        )
        .unwrap();
        let r = hound::WavReader::open(&dest).unwrap();
        let frames = r.duration();
        assert!((frames as i32 - 44100).abs() < 10);
    }

    #[test]
    fn append_error_log_writes_file() {
        let _guard = ENV_LOCK.lock().unwrap();
        let dir = std_temp().join(format!("thunder-fx-log-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        unsafe {
            std::env::set_var("THUNDER_FX_LOG_DIR", &dir);
        }
        append_error_log("omen test");
        let text = std::fs::read_to_string(dir.join("error.log")).unwrap();
        assert!(text.contains("omen test"));
        assert!(text.contains("ERROR"));
    }

    #[test]
    fn read_error_log_returns_appended_text() {
        let _guard = ENV_LOCK.lock().unwrap();
        let dir = std_temp().join(format!("thunder-fx-read-log-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        unsafe {
            std::env::set_var("THUNDER_FX_LOG_DIR", &dir);
        }
        append_error_log("omen from sidecar");
        let text = read_error_log().unwrap();
        assert!(text.contains("omen from sidecar"));
    }

    #[test]
    fn library_path_uses_override_dir() {
        let _guard = ENV_LOCK.lock().unwrap();
        let dir = std_temp().join(format!("thunder-fx-lib-{}", std::process::id()));
        unsafe {
            std::env::set_var("THUNDER_FX_LIBRARY_DIR", &dir);
        }
        let path = library_path().unwrap();
        assert!(path.contains("thunder-fx-lib-"));
        assert!(dir.is_dir());
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(Engine {
            proc: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            engine_status,
            engine_probe,
            engine_generate,
            engine_cancel,
            engine_encode_ogg,
            engine_warmup,
            trim_wav,
            write_file_b64,
            read_file_b64,
            temp_dir,
            log_error,
            error_log_path,
            library_path,
            read_error_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running Thunder FX");
}
