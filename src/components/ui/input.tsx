import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      className={cn(
        'flex h-9 w-full rounded-book border border-[color-mix(in_srgb,var(--color-gold)_40%,transparent)] bg-leather px-3 py-1 text-sm text-cream placeholder:text-muted outline-none',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
