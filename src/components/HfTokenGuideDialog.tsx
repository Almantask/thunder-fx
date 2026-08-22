import type { ReactNode } from 'react'
import { Hint } from '@/components/Hint'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'

export const HF_TOKEN_URLS = {
  join: 'https://huggingface.co/join',
  login: 'https://huggingface.co/login',
  tokens: 'https://huggingface.co/settings/tokens',
  medium: 'https://huggingface.co/stabilityai/stable-audio-3-medium',
  gemma: 'https://huggingface.co/google/t5gemma-b-b-ul2',
} as const

function GuideLink({
  href,
  children,
  hint,
}: {
  href: string
  children: ReactNode
  hint: string
}) {
  return (
    <Hint label={hint}>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="break-all text-gold underline underline-offset-2"
      >
        {children}
      </a>
    </Hint>
  )
}

type HfTokenGuideDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function HfTokenGuideDialog({ open, onOpenChange }: HfTokenGuideDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
        <Hint label="Step-by-step: account, two licenses, Read token, then paste it into Scribing.">
          <DialogTitle>How to get a Hugging Face token</DialogTitle>
        </Hint>
        <Hint label="401 Unauthorized until both gates are cleared on the same account that created the token.">
          <DialogDescription>
            Stable Audio 3 Medium and the T5Gemma encoder are gated. Hugging Face returns 401 until
            this account has accepted both licenses and you paste a token that starts with hf_.
          </DialogDescription>
        </Hint>
        <ScrollArea className="mt-4 h-[50vh] pr-3">
          <ol className="list-decimal space-y-4 pl-5 text-sm text-cream">
            <li>
              <Hint label="A free Hugging Face account is enough. Stay signed in for the license pages.">
                <p className="font-medium">Create or sign in to Hugging Face</p>
              </Hint>
              <p className="mt-1 text-muted">
                Open{' '}
                <GuideLink
                  href={HF_TOKEN_URLS.join}
                  hint="Opens huggingface.co/join in the browser to create a free account."
                >
                  huggingface.co/join
                </GuideLink>{' '}
                for a free account, or{' '}
                <GuideLink
                  href={HF_TOKEN_URLS.login}
                  hint="Opens huggingface.co/login if you already have an account."
                >
                  huggingface.co/login
                </GuideLink>{' '}
                if you already have one. Stay signed in for the next steps.
              </p>
            </li>
            <li>
              <Hint label="Agree on the Stability model page or Medium weights will not download.">
                <p className="font-medium">Accept the Stability AI Community License</p>
              </Hint>
              <p className="mt-1 text-muted">
                Open{' '}
                <GuideLink
                  href={HF_TOKEN_URLS.medium}
                  hint="Opens the gated Stable Audio 3 Medium repo. Click Agree and access repository."
                >
                  huggingface.co/stabilityai/stable-audio-3-medium
                </GuideLink>
                . Read the Community License, then click Agree and access repository. The Medium
                weights will not download until this gate is cleared on your account.
              </p>
            </li>
            <li>
              <Hint label="Thunder FX uses T5Gemma as the text encoder. Agree on that page too.">
                <p className="font-medium">Accept the Gemma Terms of Use</p>
              </Hint>
              <p className="mt-1 text-muted">
                Open{' '}
                <GuideLink
                  href={HF_TOKEN_URLS.gemma}
                  hint="Opens the gated T5Gemma encoder repo. Agree to Gemma’s terms."
                >
                  huggingface.co/google/t5gemma-b-b-ul2
                </GuideLink>
                . Agree to Gemma’s terms. Thunder FX uses this checkpoint as the text encoder.
              </p>
            </li>
            <li>
              <Hint label="Classic Read is enough. Fine-grained tokens also need gated-repo read.">
                <p className="font-medium">Create an access token</p>
              </Hint>
              <p className="mt-1 text-muted">
                Open{' '}
                <GuideLink
                  href={HF_TOKEN_URLS.tokens}
                  hint="Opens Hugging Face token settings. Create a Read token and copy it once."
                >
                  huggingface.co/settings/tokens
                </GuideLink>
                . Click Create new token. Give it a name such as Thunder FX. Set the permission to
                Read (a classic Read token is enough). If you use a fine-grained token, also enable
                read access to public gated repos your account can access. Create the token and copy
                it immediately — Hugging Face shows the secret only once.
              </p>
            </li>
            <li>
              <Hint label="Paste into Hugging Face token on Scribing, then Finish the watch.">
                <p className="font-medium">Paste it into First Watch</p>
              </Hint>
              <Hint label="Paste the hf_ token into Scribing. If you still get 401, the licenses and token must be the same account.">
                <p className="mt-1 text-muted">
                  Return here and paste the token into Hugging Face token. It should start with hf_.
                  The keep stores it only on this machine. Then choose Finish the watch. If scribing
                  still returns 401, the licenses were not accepted on the same account that created
                  the token.
                </p>
              </Hint>
            </li>
          </ol>
        </ScrollArea>
        <div className="mt-4">
          <Hint label="Return to Scribing and paste the token. The guide stays until you close it.">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </Hint>
        </div>
      </DialogContent>
    </Dialog>
  )
}
