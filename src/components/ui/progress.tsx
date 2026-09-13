import * as ProgressPrimitive from '@radix-ui/react-progress'
import type { ComponentProps } from 'react'
import type { GenerateMode } from '@/lib/types'
import { cn } from '@/lib/utils'

function Progress({
  className,
  value,
  indeterminate = false,
  mode = 'sfx',
  indicatorRef,
  ...props
}: ComponentProps<typeof ProgressPrimitive.Root> & {
  indeterminate?: boolean
  mode?: GenerateMode
  indicatorRef?: React.RefObject<HTMLDivElement | null>
}) {
  const isMusic = mode === 'music'
  return (
    <ProgressPrimitive.Root
      className={cn(
        'relative h-2.5 w-full overflow-hidden rounded-full border border-[color-mix(in_srgb,var(--color-gold)_30%,transparent)] bg-leather-2 shadow-inner',
        className,
      )}
      value={indeterminate ? undefined : value}
      {...props}
    >
      <ProgressPrimitive.Indicator
        ref={indicatorRef}
        className={cn(
          'relative h-full transition-all duration-300 ease-out',
          isMusic ? 'progress-bar-music' : 'progress-bar-fx',
          indeterminate ? 'progress-indeterminate' : 'magic-shimmer',
        )}
        style={
          indeterminate || indicatorRef
            ? undefined
            : { transform: `translateX(-${100 - (value ?? 0)}%)` }
        }
      >
        {/* Leading edge spark flare */}
        <div
          className={cn(
            'absolute right-0 top-0 h-full w-3 rounded-full blur-[2px]',
            isMusic ? 'bg-cyan-300' : 'bg-amber-200',
          )}
        />
      </ProgressPrimitive.Indicator>
    </ProgressPrimitive.Root>
  )
}

export { Progress }

