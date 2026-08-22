import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import type { KeepSettings } from '@/lib/types'

type KeepSheetProps = {
  open: boolean
  settings: KeepSettings
  onOpenChange: (open: boolean) => void
  onChange: (settings: KeepSettings) => void
}

export function KeepSheet({ open, settings, onOpenChange, onChange }: KeepSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetTitle>Keep</SheetTitle>
        <SheetDescription>Local settings. No fidelity-reducing engine toggles.</SheetDescription>
        <div className="mt-6 space-y-4">
          <div>
            <Label htmlFor="hf-token">Hugging Face token (optional)</Label>
            <Input
              id="hf-token"
              className="mt-1"
              type="password"
              value={settings.hfToken}
              onChange={(e) => onChange({ ...settings, hfToken: e.target.value })}
              autoComplete="off"
            />
          </div>
          <div>
            <Label htmlFor="default-duration">Default duration (seconds)</Label>
            <Input
              id="default-duration"
              className="mt-1"
              type="number"
              min={0.5}
              max={30}
              step={0.5}
              value={settings.defaultDuration}
              onChange={(e) =>
                onChange({ ...settings, defaultDuration: Number(e.target.value) || 8 })
              }
            />
          </div>
          <div>
            <Label htmlFor="export-dir">Default export folder</Label>
            <Input
              id="export-dir"
              className="mt-1"
              value={settings.defaultExportDir}
              onChange={(e) => onChange({ ...settings, defaultExportDir: e.target.value })}
              placeholder="Downloads (browser) or native dialog"
            />
          </div>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
