import type { ReactElement, ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type HintProps = {
  label: string
  children: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  className?: string
  asChild?: boolean
}

export function Hint({ label, children, side = 'top', className, asChild = false }: HintProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {asChild ? (
          (children as ReactElement)
        ) : (
          <span className={cn('inline-flex max-w-full', className)}>{children}</span>
        )}
      </TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  )
}
