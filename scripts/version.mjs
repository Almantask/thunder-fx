#!/usr/bin/env node
/**
 * One version, three files.
 *
 * `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` each
 * carry their own copy, and nothing used to compare them — so the installer
 * and the exe shipped as 0.2.0 while the changelog was on 0.4.0. `--check`
 * runs in CI; `--set` is the only sanctioned way to bump.
 *
 *   node scripts/version.mjs --check
 *   node scripts/version.mjs --set 0.5.0
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const PACKAGE_JSON = join(root, 'package.json')
const TAURI_CONF = join(root, 'src-tauri', 'tauri.conf.json')
const CARGO_TOML = join(root, 'src-tauri', 'Cargo.toml')
const CHANGELOG = join(root, 'CHANGELOG.md')

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

/** Cargo.toml has several `version = ` keys; only the first, in [package], is ours. */
const CARGO_VERSION = /^version\s*=\s*"([^"]+)"/m

function readJsonVersion(file) {
  const parsed = JSON.parse(readFileSync(file, 'utf8'))
  return parsed.version
}

function setJsonVersion(file, version) {
  const text = readFileSync(file, 'utf8')
  const current = JSON.parse(text).version
  // Rewritten as text rather than re-serialized so key order, indentation and
  // the trailing newline survive untouched.
  const next = text.replace(`"version": ${JSON.stringify(current)}`, `"version": ${JSON.stringify(version)}`)
  if (next === text) throw new Error(`Could not rewrite the version field in ${file}`)
  writeFileSync(file, next)
}

function readCargoVersion() {
  const match = CARGO_VERSION.exec(readFileSync(CARGO_TOML, 'utf8'))
  if (!match) throw new Error('No [package] version in src-tauri/Cargo.toml')
  return match[1]
}

function setCargoVersion(version) {
  const text = readFileSync(CARGO_TOML, 'utf8')
  writeFileSync(CARGO_TOML, text.replace(CARGO_VERSION, `version = "${version}"`))
}

/** Newest released heading in CHANGELOG.md, skipping `## Unreleased`. */
function latestChangelogVersion() {
  const text = readFileSync(CHANGELOG, 'utf8')
  const match = /^##\s+(\d+\.\d+\.\d+)/m.exec(text)
  return match ? match[1] : undefined
}

function versions() {
  return {
    'package.json': readJsonVersion(PACKAGE_JSON),
    'src-tauri/tauri.conf.json': readJsonVersion(TAURI_CONF),
    'src-tauri/Cargo.toml': readCargoVersion(),
  }
}

function check() {
  const found = versions()
  const distinct = [...new Set(Object.values(found))]
  if (distinct.length !== 1) {
    console.error('Version mismatch across the manifests:')
    for (const [file, version] of Object.entries(found)) console.error(`  ${version}\t${file}`)
    console.error('\nFix with: node scripts/version.mjs --set <version>')
    process.exit(1)
  }
  const version = distinct[0]
  const changelog = latestChangelogVersion()
  if (changelog && changelog !== version) {
    console.error(`Manifests are on ${version} but the newest CHANGELOG.md release is ${changelog}.`)
    console.error('Release the changelog entry or bump the manifests to match.')
    process.exit(1)
  }
  console.log(`Version ${version} is consistent across all three manifests${changelog ? ' and CHANGELOG.md' : ''}.`)
}

function set(version) {
  if (!SEMVER.test(version)) {
    console.error(`Not a semver version: ${version}`)
    process.exit(1)
  }
  setJsonVersion(PACKAGE_JSON, version)
  setJsonVersion(TAURI_CONF, version)
  setCargoVersion(version)
  console.log(`Set ${version} in package.json, tauri.conf.json and Cargo.toml.`)
  console.log('Remember to run `npm install` so package-lock.json follows.')
}

const [flag, value] = process.argv.slice(2)
if (flag === '--check') check()
else if (flag === '--set' && value) set(value)
else {
  console.error('Usage: node scripts/version.mjs --check | --set <version>')
  process.exit(1)
}
