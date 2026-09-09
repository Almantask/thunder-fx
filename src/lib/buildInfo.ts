declare const __BUILD_ID__: string | undefined
declare const __APP_VERSION__: string | undefined

/**
 * The release version, from package.json at build time. `npm run version:check`
 * keeps that in step with tauri.conf.json and Cargo.toml, so this is the same
 * number the installer and the updater use.
 */
export const APP_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__ ? __APP_VERSION__ : '0.0.0'

/**
 * Changes on every build, unlike {@link APP_VERSION}. Local generation-time
 * estimates are keyed on it so a new build starts from the shipped benchmarks
 * instead of timings measured against different code.
 */
export const BUILD_ID: string =
  typeof __BUILD_ID__ !== 'undefined' && __BUILD_ID__ ? __BUILD_ID__ : `dev-${APP_VERSION}`

export function getAppBuildId(): string {
  return BUILD_ID
}

export function getAppVersion(): string {
  return APP_VERSION
}
