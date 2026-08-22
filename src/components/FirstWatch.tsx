import { useState } from 'react'
import { Hint } from '@/components/Hint'
import { HfTokenGuideDialog } from '@/components/HfTokenGuideDialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { probeEngine, reportError, scribeWeights } from '@/lib/engine'
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
  const [tokenGuideOpen, setTokenGuideOpen] = useState(false)

  const oathsReady = community && gemma

  async function runAugury() {
    setProbing(true)
    setProbe(null)
    try {
      setProbe(await probeEngine())
    } catch (err) {
      const message = reportError(err, 'Probe failed')
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
      const message = reportError(err, 'Scribing failed')
      setScribeError(message)
    }
    setScribing(false)
  }

  return (
    <main className="keep-vignette flex h-full flex-col items-center justify-center px-6">
      <Hint label="First Watch: licenses, hardware probe, then download Medium weights before the studio opens.">
        <p className="font-display text-xs tracking-[0.35em] text-gold">FIRST WATCH</p>
      </Hint>
      <Hint label="Setup rite. You cannot Cast until oaths, augury, and scribing succeed.">
        <h1 className="mt-3 max-w-xl text-center font-display text-4xl text-cream md:text-5xl">
          Light the brazier
        </h1>
      </Hint>
      <Hint label="Flavor is the skin of the keep. Engine errors stay technical underneath.">
        <p className="mt-3 max-w-lg text-center text-muted">
          A three-beat rite before the Medium weave. Flavor is the skin; the guts stay technical.
        </p>
      </Hint>
      <ol className="mt-6 flex gap-4 font-display text-sm text-muted" aria-label="First Watch steps">
        <li className={step === 'oaths' ? 'text-cream' : ''}>
          <Hint label="Accept the Stability Community License and Gemma Terms. Continue stays closed until both are checked.">
            <span>Oaths</span>
          </Hint>
        </li>
        <li className={step === 'augury' ? 'text-cream' : ''}>
          <Hint label="Probe CUDA, Flash Attention, and stable-audio-3. Flavor line plus technical details.">
            <span>Augury</span>
          </Hint>
        </li>
        <li className={step === 'scribing' ? 'text-cream' : ''}>
          <Hint label="Paste a Hugging Face token and download Medium plus T5Gemma into the local HF cache.">
            <span>Scribing</span>
          </Hint>
        </li>
      </ol>
      <div className="mt-8 w-full max-w-xl rounded-book border border-[color-mix(in_srgb,var(--color-gold)_40%,transparent)] bg-leather p-6">
        {step === 'oaths' ? (
          <div className="space-y-4">
            <Hint label="You must accept both licenses on this screen and again on Hugging Face before weights download.">
              <h2 className="font-display text-xl">Oaths</h2>
            </Hint>
            <Hint label="App code is Apache-2.0. Medium and Gemma weights stay on Hugging Face until you accept their licenses.">
              <p className="text-sm text-muted">
                Thunder FX is Apache-2.0. Model weights are not shipped. You must accept Stability’s
                Community License and Gemma’s Terms before download.
              </p>
            </Hint>
            <Hint
              className="w-full items-start gap-3"
              label="Required to download Stable Audio 3 Medium. Also click Agree on the Hugging Face model page."
            >
              <Checkbox
                id="community"
                checked={community}
                onCheckedChange={(v) => setCommunity(v === true)}
              />
              <Label htmlFor="community" className="text-cream leading-5">
                I accept the Stability AI Community License for Stable Audio 3 weights.
              </Label>
            </Hint>
            <Hint
              className="w-full items-start gap-3"
              label="Required for the T5Gemma text encoder (google/t5gemma-b-b-ul2). Agree on that Hugging Face page too."
            >
              <Checkbox id="gemma" checked={gemma} onCheckedChange={(v) => setGemma(v === true)} />
              <Label htmlFor="gemma" className="text-cream leading-5">
                I accept the Gemma Terms of Use for the text encoder.
              </Label>
            </Hint>
            <Hint className="w-full" label={oathsReady ? 'Continue to Augury: probe CUDA and Flash Attention.' : 'Check both oaths before Continue unlocks.'}>
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
            </Hint>
          </div>
        ) : null}
        {step === 'augury' ? (
          <div className="space-y-4">
            <Hint label="Hardware probe. CUDA, Flash Attention 2, and stable-audio-3 must import for Medium.">
              <h2 className="font-display text-xl">Augury</h2>
            </Hint>
            {probing ? (
              <Hint label="The sidecar is importing torch and related packages. This can take a few seconds.">
                <p role="status">Reading the signs…</p>
              </Hint>
            ) : probe ? (
              <div>
                <Hint label="In-world status. Open Technical details for the raw CUDA / import result.">
                  <p>{probe.flavor}</p>
                </Hint>
                <Hint className="mt-3" label="Raw probe output: CUDA device name, flash_attn, and stable_audio_3 import status.">
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted">Technical details</summary>
                    <pre className="mt-2 overflow-auto font-mono text-xs text-cream whitespace-pre-wrap">
                      {probe.technical}
                      {'\n'}
                      Device: {probe.device}
                    </pre>
                  </details>
                </Hint>
              </div>
            ) : (
              <Hint label="The probe has not returned. Use Probe again if this persists.">
                <p className="text-muted">No omen yet.</p>
              </Hint>
            )}
            <div className="flex gap-2">
              <Hint label="Run the CUDA and Flash Attention probe again after installing drivers or the engine venv.">
                <Button type="button" variant="outline" onClick={() => void runAugury()}>
                  Probe again
                </Button>
              </Hint>
              <Hint label={probe?.ok ? 'Continue to Scribing to download Medium weights.' : 'Probe must succeed before Scribing unlocks.'}>
                <Button
                  type="button"
                  variant="cast"
                  disabled={!probe?.ok}
                  onClick={() => setStep('scribing')}
                >
                  Continue
                </Button>
              </Hint>
            </div>
          </div>
        ) : null}
        {step === 'scribing' ? (
          <div className="space-y-4">
            <Hint label="Download Medium and T5Gemma into the local Hugging Face cache. Needs a gated-repo token.">
              <h2 className="font-display text-xl">Scribing</h2>
            </Hint>
            <Hint label="401 means the token is missing, wrong account, or the two licenses were not accepted yet.">
              <p className="text-sm text-muted">
                Medium and T5Gemma are gated Hugging Face repos. A token is required; without one the
                scribe returns 401. Weights land in the local HF cache after this account has accepted
                both licenses.
              </p>
            </Hint>
            <div>
              <Hint className="w-full flex-col" label="Access token from huggingface.co/settings/tokens. Starts with hf_. Stored only on this machine.">
                <div className="w-full">
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
              </Hint>
              <Hint className="mt-2" label="Open step-by-step instructions: account, licenses, Read token, then paste.">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setTokenGuideOpen(true)}
                >
                  Show full token instructions
                </Button>
              </Hint>
            </div>
            <Hint className="w-full flex-col" label="Weight download and GPU load. The bar may sit at 0% until Hugging Face finishes; the keep stays blocked until then.">
              <div className="w-full">
                <Progress value={download * 100} aria-label="Download progress" />
                <p className="font-mono text-xs text-muted">{Math.round(download * 100)}%</p>
              </div>
            </Hint>
            {scribeError ? (
              <Hint className="w-full" label="Scribing failed. Open Settings after the studio loads, or fix the token/licenses and try again.">
                <pre className="w-full overflow-auto font-mono text-xs text-cream whitespace-pre-wrap">
                  {scribeError}
                </pre>
              </Hint>
            ) : null}
            <Hint className="w-full" label={scribing ? 'Downloading and loading Medium. This window stays on First Watch until it finishes.' : 'Save the token and download Medium. The studio opens when weights are ready.'}>
              <Button type="button" variant="cast" className="w-full" disabled={scribing} onClick={() => void runScribing()}>
                {scribing ? 'Scribing…' : 'Finish the watch'}
              </Button>
            </Hint>
          </div>
        ) : null}
      </div>
      <HfTokenGuideDialog open={tokenGuideOpen} onOpenChange={setTokenGuideOpen} />
    </main>
  )
}
