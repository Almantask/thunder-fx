import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { logClientError, revealErrorLog } from '@/lib/engine'

type ErrorBoundaryProps = {
  children: ReactNode
  /** Compact recovery for a pane; omit for the full-window fallback. */
  name?: string
}

type ErrorBoundaryState = {
  message?: string
}

/**
 * The desktop window has no browser chrome, so an unhandled render error would
 * otherwise leave a blank frame with no way back. This keeps the traceback in
 * the error log and offers a reload.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {}

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { message: error instanceof Error ? error.message : 'Unexpected error' }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    void logClientError(error.message, `${error.stack ?? ''}\n${info.componentStack ?? ''}`, {
      source: this.props.name ? `ui:${this.props.name}` : 'ui',
    })
  }

  render(): ReactNode {
    if (!this.state.message) return this.props.children
    if (this.props.name) {
      return (
        <div
          role="alert"
          className="flex flex-col items-center justify-center gap-3 bg-leather/80 px-4 py-6 text-center"
        >
          <p className="text-sm text-cream">{this.props.name} hit an unexpected error.</p>
          <p className="max-w-md font-mono text-xs text-danger break-all">{this.state.message}</p>
          <Button type="button" variant="outline" onClick={() => this.setState({ message: undefined })}>
            Try again
          </Button>
        </div>
      )
    }
    return (
      <div
        role="alert"
        className="flex h-full flex-col items-center justify-center gap-4 bg-leather px-6 text-center"
      >
        <h1 className="font-display text-xl text-cream">Thunder FX hit an unexpected error</h1>
        <p className="max-w-lg text-sm text-muted">
          Generated clips already saved to the library are safe on disk. The details were written to
          the error log.
        </p>
        <p className="max-w-lg font-mono text-xs text-danger break-all">{this.state.message}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" onClick={() => window.location.reload()}>
            Reload Thunder FX
          </Button>
          <Button type="button" variant="outline" onClick={() => void revealErrorLog()}>
            Open error log
          </Button>
        </div>
      </div>
    )
  }
}
