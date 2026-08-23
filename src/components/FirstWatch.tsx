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
        flavor: 'Hardware check failed.',
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
      const message = reportError(err, 'Download failed')
      setScribeError(message)
    }
    setScribing(false)
  }

  return (
    <main className="keep-vignette flex h-full flex-col items-center justify-center px-6">
      <Hint label="Setup: accept licenses, check hardware, then download Medium weights before the studio opens.">
        <p className="font-display text-xs tracking-[0.35em] text-gold">SETUP</p>
      </Hint>
      <Hint label="You cannot generate until licenses, hardware check, and model download succeed.">
        <h1 className="mt-3 max-w-xl text-center font-display text-4xl text-cream md:text-5xl">
          Set up Thunder FX
        </h1>
      </Hint>
      <Hint label="Status messages stay short. Open Technical details for the raw engine error.">
        <p className="mt-3 max-w-lg text-center text-muted">
          Three steps before you can generate: licenses, hardware, then download the model. Errors
          stay technical when something fails.
        </p>
      </Hint>
      <ol className="mt-6 flex gap-4 font-display text-sm text-muted" aria-label="Setup steps">
        <li className={step === 'oaths' ? 'text-cream' : ''}>
          <Hint label="Accept the Stability Community License and Gemma Terms. Continue stays disabled until both are checked.">
            <span>Licenses</span>
          </Hint>
        </li>
        <li className={step === 'augury' ? 'text-cream' : ''}>
          <Hint label="Check CUDA, Flash Attention, and stable-audio-3. Status line plus technical details.">
            <span>Hardware</span>
          </Hint>
        </li>
        <li className={step === 'scribing' ? 'text-cream' : ''}>
          <Hint label="Paste a Hugging Face token and download Medium plus T5Gemma into the local cache.">
            <span>Download</span>
          </Hint>
        </li>
      </ol>
      <div className="mt-8 w-full max-w-xl rounded-book border border-[color-mix(in_srgb,var(--color-gold)_40%,transparent)] bg-leather p-6">
        {step === 'oaths' ? (
          <div className="space-y-4">
            <Hint label="You must accept both licenses on this screen and again on Hugging Face before weights download.">
              <h2 className="font-display text-xl">Licenses</h2>
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
            <Hint className="w-full" label={oathsReady ? 'Continue to the hardware check: CUDA and Flash Attention.' : 'Check both licenses before Continue unlocks.'}>
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
            <Hint label="Hardware check. CUDA, Flash Attention 2, and stable-audio-3 must import for Medium.">
              <h2 className="font-display text-xl">Hardware</h2>
            </Hint>
            {probing ? (
              <Hint label="The engine is importing torch and related packages. This can take a few seconds.">
                <p role="status">Checking hardware…</p>
              </Hint>
            ) : probe ? (
              <div>
                <Hint label="Short status. Open Technical details for the raw CUDA / import result.">
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
              <Hint label="The check has not returned. Use Check again if this persists.">
                <p className="text-muted">No result yet.</p>
              </Hint>
            )}
            <div className="flex gap-2">
              <Hint label="Run the CUDA and Flash Attention check again after installing drivers or the engine venv.">
                <Button type="button" variant="outline" onClick={() => void runAugury()}>
                  Check again
                </Button>
              </Hint>
              <Hint label={probe?.ok ? 'Continue to download Medium weights.' : 'Hardware check must succeed before download unlocks.'}>
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
              <h2 className="font-display text-xl">Download</h2>
            </Hint>
            <Hint label="401 means the token is missing, wrong account, or the two licenses were not accepted yet.">
              <p className="text-sm text-muted">
                Medium and T5Gemma are gated Hugging Face repos. A token is required; without one the
                download returns 401. Weights land in the local HF cache after this account has
                accepted both licenses.
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
            <Hint className="w-full flex-col" label="Weight download and GPU load. The bar stays in motion while Hugging Face or VRAM load runs; the app stays responsive.">
              <div className="w-full">
                <Progress
                  value={download * 100}
                  indeterminate={scribing && download <= 0}
                  aria-label="Download progress"
                />
                <p className="font-mono text-xs text-muted">
                  {scribing && download <= 0 ? 'Working…' : `${Math.round(download * 100)}%`}
                </p>
              </div>
            </Hint>
            {scribeError ? (
              <Hint className="w-full" label="Download failed. Open Settings after the studio loads, or fix the token/licenses and try again.">
                <pre className="w-full overflow-auto font-mono text-xs text-cream whitespace-pre-wrap">
                  {scribeError}
                </pre>
              </Hint>
            ) : null}
            <Hint className="w-full" label={scribing ? 'Downloading and loading Medium. This window stays on setup until it finishes.' : 'Save the token and download Medium. The studio opens when the model is ready.'}>
              <Button type="button" variant="cast" className="w-full" disabled={scribing} onClick={() => void runScribing()}>
                {scribing ? 'Downloading…' : 'Download and continue'}
              </Button>
            </Hint>
          </div>
        ) : null}
      </div>
      <HfTokenGuideDialog open={tokenGuideOpen} onOpenChange={setTokenGuideOpen} />
    </main>
  )
}
