$ErrorActionPreference = "Stop"

function Find-RepoRoot {
    $dir = Get-Item -LiteralPath $PSScriptRoot
    while ($null -ne $dir) {
        $probe = Join-Path $dir.FullName "src-tauri\tauri.conf.json"
        if (Test-Path -LiteralPath $probe) {
            return $dir.FullName
        }
        $dir = $dir.Parent
    }
    throw "Could not find the thunder-fx repo root (missing src-tauri/tauri.conf.json)."
}

function Stop-LockingProcess {
    param([Parameter(Mandatory = $true)][string]$ExePath)
    if (-not (Test-Path -LiteralPath $ExePath)) {
        return
    }
    $resolved = (Resolve-Path -LiteralPath $ExePath).Path
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object { $_.ExecutablePath -and ($_.ExecutablePath -ieq $resolved) } |
        ForEach-Object {
            Write-Host "Stopping PID $($_.ProcessId) locking $resolved"
            Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
}

$RepoRoot = Find-RepoRoot
$DestDir = "E:\thunder-fx-engine"
$CargoTarget = Join-Path $DestDir "cargo-target"
$DirtyStamp = Join-Path $RepoRoot ".cursor\hooks\state\exe-dirty.txt"

if ($env:OS -notmatch "Windows") {
    throw "Desktop exe rebuild is Windows-only."
}
if (-not (Test-Path -LiteralPath "E:\")) {
    throw "Drive E: is not available. CARGO_TARGET_DIR and the exe destination live on E:\thunder-fx-engine."
}

New-Item -ItemType Directory -Force -Path $DestDir | Out-Null
New-Item -ItemType Directory -Force -Path $CargoTarget | Out-Null

$confPath = Join-Path $RepoRoot "src-tauri\tauri.conf.json"
$conf = Get-Content -LiteralPath $confPath -Raw | ConvertFrom-Json
$version = [string]$conf.version
if ([string]::IsNullOrWhiteSpace($version)) {
    throw "Could not read version from src-tauri/tauri.conf.json."
}

$builtExe = Join-Path $CargoTarget "release\thunder-fx.exe"
$setupName = "Thunder FX_${version}_x64-setup.exe"
$builtSetup = Join-Path $CargoTarget "release\bundle\nsis\$setupName"
$destExe = Join-Path $DestDir "thunder-fx.exe"
$destSetup = Join-Path $DestDir $setupName
$workerSrc = Join-Path $RepoRoot "engine\worker.py"

Stop-LockingProcess -ExePath $destExe
Stop-LockingProcess -ExePath $builtExe
Start-Sleep -Seconds 1

$env:CARGO_TARGET_DIR = $CargoTarget
Set-Location -LiteralPath $RepoRoot
Write-Host "Building Thunder FX $version with CARGO_TARGET_DIR=$CargoTarget"
npm run tauri:build
if ($LASTEXITCODE -ne 0) {
    throw "npm run tauri:build failed with exit code $LASTEXITCODE."
}

if (-not (Test-Path -LiteralPath $builtExe)) {
    throw "Missing built exe: $builtExe"
}
if (-not (Test-Path -LiteralPath $builtSetup)) {
    throw "Missing NSIS installer: $builtSetup"
}

Stop-LockingProcess -ExePath $destExe
Start-Sleep -Milliseconds 200
Copy-Item -LiteralPath $builtExe -Destination $destExe -Force
Copy-Item -LiteralPath $builtSetup -Destination $destSetup -Force

if (Test-Path -LiteralPath $workerSrc) {
    Copy-Item -LiteralPath $workerSrc -Destination (Join-Path $DestDir "worker.py") -Force
    $engineDest = Join-Path $DestDir "engine"
    New-Item -ItemType Directory -Force -Path $engineDest | Out-Null
    Copy-Item -LiteralPath $workerSrc -Destination (Join-Path $engineDest "worker.py") -Force

    $searchRoots = @(
        (Join-Path $CargoTarget "release"),
        (Join-Path $CargoTarget "release\bundle")
    )
    foreach ($root in $searchRoots) {
        if (Test-Path -LiteralPath $root) {
            Get-ChildItem -LiteralPath $root -Recurse -Filter "worker.py" -ErrorAction SilentlyContinue |
                ForEach-Object { Copy-Item -LiteralPath $workerSrc -Destination $_.FullName -Force }
        }
    }
}

if (Test-Path -LiteralPath $DirtyStamp) {
    Remove-Item -LiteralPath $DirtyStamp -Force
}

Write-Host "Updated $destExe"
Write-Host "Updated $destSetup"
Get-Item -LiteralPath $destExe, $destSetup | Format-Table Name, Length, LastWriteTime -AutoSize
