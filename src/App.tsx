import { useState } from 'react'
import { FirstWatch } from '@/components/FirstWatch'
import { Studio } from '@/components/Studio'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { completeFirstWatch, isFirstWatchComplete } from '@/lib/setup'

export default function App() {
  const [ready, setReady] = useState(isFirstWatchComplete)

  return (
    <TooltipProvider delayDuration={200} skipDelayDuration={80}>
      <div className="keep-vignette h-full min-h-0">
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
      </div>
      <Toaster />
    </TooltipProvider>
  )
}
