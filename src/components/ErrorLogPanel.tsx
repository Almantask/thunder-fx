import { useEffect, useState } from 'react'
import { Hint } from '@/components/Hint'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { readErrorLog, revealErrorLog } from '@/lib/engine'
import { logEntries } from '@/lib/errorLog'
import { isTauri } from '@/lib/utils'

export function ErrorLogPanel() {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)

  function reload() {
    setLoading(true)
    return readErrorLog()
      .then(setText)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void readErrorLog()
      .then((next) => {
        if (!cancelled) setText(next)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const entries = logEntries(text)

  return (
    <section className="flex min-h-0 flex-col" aria-label="Error log">
      <Hint label="Failures from generate, setup download, and the engine, newest first.">
        <h2 className="font-display text-xl text-cream">Error log</h2>
      </Hint>
      <Hint label="Each block is one failure. Refresh after a new error. Reveal file opens Explorer.">
        <p className="mt-1 text-sm text-muted">Errors recorded when something fails. Newest first.</p>
      </Hint>
      <Hint
        className="mt-4 w-full"
        label="Newest first. Each block is one failure, including traceback when the engine logged one."
      >
        <ScrollArea className="h-[40vh] w-full">
          {loading ? (
            <p role="status">Loading the log…</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted">No errors yet. Failed generations are recorded here.</p>
          ) : (
            <div role="log" className="space-y-3 pr-3">
              {entries.map((entry, index) => (
                <pre
                  key={`${index}-${entry.slice(0, 24)}`}
                  className="overflow-x-auto rounded-book border border-[color-mix(in_srgb,var(--color-gold)_25%,transparent)] bg-leather-2 p-3 font-mono text-xs whitespace-pre-wrap text-cream"
                >
                  {entry}
                </pre>
              ))}
            </div>
          )}
        </ScrollArea>
      </Hint>
      <div className="mt-4 flex gap-2">
        <Hint label="Reload error.log from disk. New failures appear after Refresh.">
          <Button type="button" variant="outline" onClick={() => void reload()}>
            Refresh
          </Button>
        </Hint>
        {isTauri() ? (
          <Hint label="Reveal error.log in Explorer so you can copy or attach it.">
            <Button type="button" variant="outline" onClick={() => void revealErrorLog()}>
              Reveal file
            </Button>
          </Hint>
        ) : null}
      </div>
    </section>
  )
}
