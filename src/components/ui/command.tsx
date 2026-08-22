import { Command as CommandPrimitive } from 'cmdk'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent } from '@/components/ui/dialog'

function Command({ className, ...props }: ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      className={cn('flex h-full w-full flex-col overflow-hidden rounded-book bg-leather text-cream', className)}
      {...props}
    />
  )
}

function CommandDialog({
  children,
  ...props
}: ComponentProps<typeof Dialog> & { children: ReactNode }) {
  return (
    <Dialog {...props}>
      <DialogContent className="overflow-hidden p-0">
        {children}
      </DialogContent>
    </Dialog>
  )
}

function CommandInput({ className, ...props }: ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <CommandPrimitive.Input
      className={cn(
        'flex h-11 w-full bg-transparent px-4 text-sm outline-none placeholder:text-muted',
        className,
      )}
      {...props}
    />
  )
}

function CommandList({ className, ...props }: ComponentProps<typeof CommandPrimitive.List>) {
  return <CommandPrimitive.List className={cn('max-h-72 overflow-y-auto p-2', className)} {...props} />
}

function CommandEmpty({ className, ...props }: ComponentProps<typeof CommandPrimitive.Empty>) {
  return <CommandPrimitive.Empty className={cn('py-6 text-center text-sm text-muted', className)} {...props} />
}

function CommandItem({ className, ...props }: ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      className={cn(
        'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-sm data-[selected=true]:bg-leather-2',
        className,
      )}
      {...props}
    />
  )
}

export { Command, CommandDialog, CommandInput, CommandList, CommandEmpty, CommandItem }
