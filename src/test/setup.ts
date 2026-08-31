import { afterEach } from 'vitest'

// Most lib specs are pure logic and run in the far cheaper `node` environment
// (see vite.config.ts). Everything below only applies where a DOM exists.
const hasDom = typeof globalThis.document !== 'undefined'

if (hasDom) {
  await import('@testing-library/jest-dom/vitest')

  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  globalThis.ResizeObserver = ResizeObserverStub

  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function scrollIntoView() {}
  }

  // jsdom ships no canvas implementation, so every ScrollCanvas render logged a
  // "getContext() not implemented" error. A no-op 2D context keeps the drawing
  // code on its real path and the test output readable.
  const canvasContextStub = new Proxy(
    {
      canvas: undefined as unknown,
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
      createPattern: () => null,
      getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
      measureText: () => ({ width: 0 }),
    } as Record<string, unknown>,
    {
      get(target, prop) {
        if (prop in target) return target[prop as string]
        // Any other canvas member is a drawing call we can safely ignore.
        return () => undefined
      },
      set(target, prop, value) {
        target[prop as string] = value
        return true
      },
    },
  )

  HTMLCanvasElement.prototype.getContext = function getContext(this: HTMLCanvasElement) {
    ;(canvasContextStub as { canvas: unknown }).canvas = this
    return canvasContextStub
  } as unknown as HTMLCanvasElement['getContext']
}

afterEach(async () => {
  if (!hasDom) return
  const { cleanup } = await import('@testing-library/react')
  cleanup()
  localStorage.clear()
})
