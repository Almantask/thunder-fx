import { useState } from 'react'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { FirstWatch } from '@/components/FirstWatch'
import { Studio } from '@/components/Studio'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { completeFirstWatch, isFirstWatchComplete } from '@/lib/setup'

export default function App() {
  const [ready, setReady] = useState(isFirstWatchComplete)

  return (
    <TooltipProvider>
      <div className="keep-vignette h-full min-h-0 overflow-hidden">
        <ErrorBoundary>
          {ready ? (
            <Studio />
          ) : (
            <FirstWatch
              onComplete={() => {
                completeFirstWatch()
                setReady(true)
              }}
            />
          )}
        </ErrorBoundary>
      </div>
      <Toaster />
    </TooltipProvider>
  )
}
