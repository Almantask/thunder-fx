import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { probeEngine, scribeWeights } from '@/lib/engine'
import { loadSettings, saveSettings } from '@/lib/setup'
import type { SetupProbe } from '@/lib/types'

const STEPS = ['oaths', 'augury', 'scribing'] as const
type Step = (typeof STEPS)[number]

type FirstWatchProps = {
  onComplete: () => void
}

export function FirstWatch({ onComplete }: FirstWatchProps) {
  const [step, setStep] = useState<Step>('oaths')
  const [community, setCommunity] = useState(false)
  const [gemma, setGemma] = useState(false)
  const [probe, setProbe] = useState<SetupProbe | null>(null)
  const [probing, setProbing] = useState(false)
  const [download, setDownload] = useState(0)
  const [scribing, setScribing] = useState(false)
  const [scribeError, setScribeError] = useState<string | null>(null)
  const [hfToken, setHfToken] = useState(() => loadSettings().hfToken)

  const oathsReady = community && gemma

  async function runAugury() {
    setProbing(true)
    setProbe(null)
    try {
      setProbe(await probeEngine())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Probe failed'
      setProbe({
        ok: false,
        flavor: 'The signs fail.',
        technical: message,
        device: 'unknown',
      })
    }
    setProbing(false)
  }

  async function runScribing() {
    setScribing(true)
    setScribeError(null)
    setDownload(0)
    saveSettings({ ...loadSettings(), hfToken: hfToken.trim() })
    try {
      await scribeWeights((ratio) => setDownload(ratio))
      onComplete()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Scribing failed'
      setScribeError(message)
    }
    setScribing(false)
  }

  return (
    <main className="keep-vignette flex h-full flex-col items-center justify-center px-6">
      <p className="font-display text-xs tracking-[0.35em] text-gold">FIRST WATCH</p>
      <h1 className="mt-3 max-w-xl text-center font-display text-4xl text-cream md:text-5xl">
        Light the brazier
      </h1>
      <p className="mt-3 max-w-lg text-center text-muted">
        A three-beat rite before the Medium weave. Flavor is the skin; the guts stay technical.
      </p>
      <ol className="mt-6 flex gap-4 font-display text-sm text-muted" aria-label="First Watch steps">
        {STEPS.map((id) => (
          <li key={id} className={id === step ? 'text-cream' : ''}>
            {id === 'oaths' ? 'Oaths' : id === 'augury' ? 'Augury' : 'Scribing'}
          </li>
        ))}
      </ol>
      <div className="mt-8 w-full max-w-xl rounded-book border border-[color-mix(in_srgb,var(--color-gold)_40%,transparent)] bg-leather p-6">
        {step === 'oaths' ? (
          <div className="space-y-4">
            <h2 className="font-display text-xl">Oaths</h2>
            <p className="text-sm text-muted">
              Thunder FX is Apache-2.0. Model weights are not shipped. You must accept Stability’s
              Community License and Gemma’s Terms before download.
            </p>
            <div className="flex items-start gap-3">
              <Checkbox
                id="community"
                checked={community}
                onCheckedChange={(v) => setCommunity(v === true)}
              />
              <Label htmlFor="community" className="text-cream leading-5">
                I accept the Stability AI Community License for Stable Audio 3 weights.
              </Label>
            </div>
            <div className="flex items-start gap-3">
              <Checkbox id="gemma" checked={gemma} onCheckedChange={(v) => setGemma(v === true)} />
              <Label htmlFor="gemma" className="text-cream leading-5">
                I accept the Gemma Terms of Use for the text encoder.
              </Label>
            </div>
            <Button
              type="button"
              variant="cast"
              className="w-full"
              disabled={!oathsReady}
              onClick={() => {
                setStep('augury')
                void runAugury()
              }}
            >
              Continue
            </Button>
          </div>
        ) : null}
        {step === 'augury' ? (
          <div className="space-y-4">
            <h2 className="font-display text-xl">Augury</h2>
            {probing ? (
              <p role="status">Reading the signs…</p>
            ) : probe ? (
              <div>
                <p>{probe.flavor}</p>
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-muted">Technical details</summary>
                  <pre className="mt-2 overflow-auto font-mono text-xs text-cream whitespace-pre-wrap">
                    {probe.technical}
                    {'\n'}
                    Device: {probe.device}
                  </pre>
                </details>
              </div>
            ) : (
              <p className="text-muted">No omen yet.</p>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => void runAugury()}>
                Probe again
              </Button>
              <Button
                type="button"
                variant="cast"
                disabled={!probe?.ok}
                onClick={() => setStep('scribing')}
              >
                Continue
              </Button>
            </div>
          </div>
        ) : null}
        {step === 'scribing' ? (
          <div className="space-y-4">
            <h2 className="font-display text-xl">Scribing</h2>
            <p className="text-sm text-muted">
              Weights download into local app data (HF cache). Hugging Face must have accepted the
              Stability Community License and Gemma Terms. Paste a token if the repo is gated.
            </p>
            <div>
              <Label htmlFor="hf-token">Hugging Face token</Label>
              <Input
                id="hf-token"
                className="mt-1"
                type="password"
                value={hfToken}
                onChange={(e) => setHfToken(e.target.value)}
                autoComplete="off"
              />
            </div>
            <Progress value={download * 100} aria-label="Download progress" />
            <p className="font-mono text-xs text-muted">{Math.round(download * 100)}%</p>
            {scribeError ? (
              <pre className="overflow-auto font-mono text-xs text-cream whitespace-pre-wrap">
                {scribeError}
              </pre>
            ) : null}
            <Button type="button" variant="cast" disabled={scribing} onClick={() => void runScribing()}>
              {scribing ? 'Scribing…' : 'Finish the watch'}
            </Button>
          </div>
        ) : null}
      </div>
    </main>
  )
}
