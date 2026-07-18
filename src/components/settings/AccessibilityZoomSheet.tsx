import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { ZoomIn } from 'lucide-react';
import {
  APP_ZOOM_STORAGE_KEY,
  APP_ZOOM_EVENT,
  MIN_APP_ZOOM,
  MAX_APP_ZOOM,
  applyAppZoom,
  readStoredAppZoom,
} from '@/utils/appZoom';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const AccessibilityZoomSheet = ({ isOpen, onClose }: Props) => {
  const [zoom, setZoom] = useState<number>(100);

  useEffect(() => {
    if (isOpen) setZoom(readStoredAppZoom());
  }, [isOpen]);

  const commit = (value: number) => {
    const clamped = Math.min(MAX_APP_ZOOM, Math.max(MIN_APP_ZOOM, Math.round(value)));
    setZoom(clamped);
    try {
      localStorage.setItem(APP_ZOOM_STORAGE_KEY, String(clamped));
    } catch {
      /* ignore quota */
    }
    applyAppZoom(clamped);
    // Notify other tabs / listeners in the same tab.
    window.dispatchEvent(new CustomEvent(APP_ZOOM_EVENT, { detail: clamped }));
  };

  const reset = () => commit(100);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl p-0 max-h-[85vh] overflow-y-auto">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <SheetTitle className="flex items-center gap-2 text-left">
            <ZoomIn className="h-5 w-5 text-primary" />
            Accessibility · App Zoom
          </SheetTitle>
          <p className="text-xs text-muted-foreground text-left">
            Scale every screen — fonts, buttons, spacing, icons — up or down.
            Applies across the whole app instantly.
          </p>
        </SheetHeader>

        <div className="px-5 py-5 space-y-6">
          <div className="rounded-2xl border border-border bg-muted/30 p-4">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-sm font-medium">Zoom level</span>
              <span className="text-2xl font-semibold tabular-nums">{zoom}%</span>
            </div>
            <Slider
              min={MIN_APP_ZOOM}
              max={MAX_APP_ZOOM}
              step={5}
              value={[zoom]}
              onValueChange={(v) => setZoom(v[0])}
              onValueCommit={(v) => commit(v[0])}
              aria-label="App zoom level"
            />
            <div className="flex justify-between text-[11px] text-muted-foreground mt-2">
              <span>{MIN_APP_ZOOM}%</span>
              <span>100%</span>
              <span>{MAX_APP_ZOOM}%</span>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {[85, 100, 125, 150].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => commit(preset)}
                className={`h-11 rounded-xl border text-sm font-medium transition-colors ${
                  zoom === preset
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background hover:bg-muted'
                }`}
              >
                {preset}%
              </button>
            ))}
          </div>

          <div
            className="rounded-2xl border border-border bg-background p-4"
            style={{ fontSize: `${zoom}%` }}
          >
            <p className="font-semibold mb-1">Preview</p>
            <p className="text-sm text-muted-foreground">
              Sample task and note text render at this size across the app.
            </p>
          </div>
        </div>

        <div
          className="px-5 pb-5 pt-2 flex gap-2 border-t border-border bg-background/70 backdrop-blur"
          style={{ paddingBottom: 'calc(var(--safe-bottom, 0px) + 16px)' }}
        >
          <Button type="button" variant="outline" className="flex-1" onClick={reset}>
            Reset to 100%
          </Button>
          <Button type="button" className="flex-1" onClick={onClose}>
            Done
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};
