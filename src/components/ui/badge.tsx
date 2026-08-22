import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

function Badge({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-[color-mix(in_srgb,var(--color-gold)_45%,transparent)] px-2 py-0.5 font-mono text-[11px] tracking-wide text-muted',
        className,
      )}
      {...props}
    />
  )
}

export { Badge }
