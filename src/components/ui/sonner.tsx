import { Toaster as Sonner, type ToasterProps } from 'sonner'

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      toastOptions={{
        classNames: {
          toast:
            'border border-[color-mix(in_srgb,var(--color-gold)_40%,transparent)] bg-leather text-cream',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
