import { Checkbox as CheckboxPrimitive, CheckboxIndicator } from '@radix-ui/react-checkbox'
import { Check } from 'lucide-react'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive>) {
  return (
    <CheckboxPrimitive
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-sm border border-gold bg-leather data-[state=checked]:bg-wax',
        className,
      )}
      {...props}
    >
      <CheckboxIndicator>
        <Check className="size-3.5 text-cream" />
      </CheckboxIndicator>
    </CheckboxPrimitive>
  )
}

export { Checkbox }
