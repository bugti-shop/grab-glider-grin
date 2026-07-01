import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import {
  getUserOffset,
  setUserOffset,
  resetUserOffset,
  applySafeTop,
  getLastMeasuredInset,
  SAFE_TOP_OFFSET_MIN,
  SAFE_TOP_OFFSET_MAX,
  SAFE_TOP_OFFSET_DEFAULT,
} from '@/utils/safeTopCalibration';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const HeaderOffsetSheet = ({ isOpen, onClose }: Props) => {
  const [offset, setOffsetState] = useState<number>(SAFE_TOP_OFFSET_DEFAULT);
  const [measured, setMeasured] = useState<number>(0);
  const [finalPx, setFinalPx] = useState<number>(0);

  useEffect(() => {
    if (!isOpen) return;
    const info = applySafeTop();
    setOffsetState(getUserOffset());
    setMeasured(info.measured);
    setFinalPx(info.final);
  }, [isOpen]);

  const commit = (v: number) => {
    setOffsetState(v);
    setUserOffset(v);
    const info = applySafeTop();
    setFinalPx(info.final);
    setMeasured(info.measured);
  };

  const reset = () => {
    resetUserOffset();
    const info = applySafeTop();
    setOffsetState(SAFE_TOP_OFFSET_DEFAULT);
    setFinalPx(info.final);
    setMeasured(info.measured);
  };

  const recalibrate = () => {
    const info = applySafeTop();
    setMeasured(info.measured);
    setFinalPx(info.final);
  };

  return (
    <Sheet open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader className="pb-2">
          <SheetTitle>Header Offset</SheetTitle>
          <SheetDescription>
            Fine-tune how far the page headers sit below the status bar / notch.
            Auto-calibration measures your device's inset; use the slider to nudge it.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 pt-4 pb-6">
          <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-xs space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Measured inset</span><span className="font-mono">{measured.toFixed(1)}px</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Your offset</span><span className="font-mono">{offset >= 0 ? '+' : ''}{offset}px</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Applied --safe-top</span><span className="font-mono">{finalPx.toFixed(1)}px</span></div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span>Offset</span>
              <span className="font-mono">{offset >= 0 ? '+' : ''}{offset}px</span>
            </div>
            <Slider
              min={SAFE_TOP_OFFSET_MIN}
              max={SAFE_TOP_OFFSET_MAX}
              step={1}
              value={[offset]}
              onValueChange={(v) => commit(v[0] ?? 0)}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>{SAFE_TOP_OFFSET_MIN}px (higher)</span>
              <span>0</span>
              <span>+{SAFE_TOP_OFFSET_MAX}px (lower)</span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={recalibrate}>Auto-calibrate</Button>
            <Button variant="outline" className="flex-1" onClick={reset}>Reset to defaults</Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
