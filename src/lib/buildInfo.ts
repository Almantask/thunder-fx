declare const __BUILD_ID__: string | undefined

export const APP_VERSION = '0.2.0'

export const BUILD_ID: string =
  typeof __BUILD_ID__ !== 'undefined' && __BUILD_ID__
    ? __BUILD_ID__
    : 'dev-0.2.0'

export function getAppBuildId(): string {
  return BUILD_ID
}