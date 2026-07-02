import { useMemo, useState } from 'react';
import { Calculator, ChevronDown, ChevronUp } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { formatBytesShort } from '@/utils/htmlCompression';

/**
 * Rough Lovable Cloud cost model (USD). These are conservative estimates —
 * actual billing may vary slightly. Values chosen to reflect typical
 * function egress + storage + invocation pricing.
 */
const COST = {
  /** Function egress + fetch bandwidth, per GB transferred. */
  egressPerGB: 0.09,
  /** Persistent storage per GB per month for the saved clip. */
  storagePerGBMonth: 0.021,
  /** Flat per-invocation cost for the fetch-article edge function. */
  perInvocation: 0.000002,
} as const;

const fmtUsd = (v: number): string => {
  if (v < 0.01) return `< $0.01`;
  if (v < 1) return `$${v.toFixed(3)}`;
  return `$${v.toFixed(2)}`;
};

interface Props {
  /** Compressed snapshot size in bytes for the current clip, if known. */
  snapshotBytes?: number | null;
  /** Fallback: preview HTML string length (UTF-8 approx). */
  previewHtmlLength?: number;
}

export const ClipCostEstimator = ({ snapshotBytes, previewHtmlLength = 0 }: Props) => {
  const [open, setOpen] = useState(false);
  const [clipsPerMonth, setClipsPerMonth] = useState(30);

  // Prefer real snapshot bytes; fall back to preview HTML size; default 800 KB.
  const bytesPerClip = useMemo(() => {
    if (snapshotBytes && snapshotBytes > 0) return snapshotBytes;
    if (previewHtmlLength > 0) return Math.round(previewHtmlLength * 0.35); // gzip est.
    return 800 * 1024;
  }, [snapshotBytes, previewHtmlLength]);

  const perClipUsd = useMemo(() => {
    const egress = (bytesPerClip / 1e9) * COST.egressPerGB;
    return egress + COST.perInvocation;
  }, [bytesPerClip]);

  const monthlyUsd = useMemo(() => {
    const fetchCost = perClipUsd * clipsPerMonth;
    const storageCost = ((bytesPerClip * clipsPerMonth) / 1e9) * COST.storagePerGBMonth;
    return fetchCost + storageCost;
  }, [perClipUsd, clipsPerMonth, bytesPerClip]);

  return (
    <div className="rounded-lg border border-border bg-muted/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <Calculator className="h-3.5 w-3.5" />
        <span>Cost estimate</span>
        <span className="ml-auto tabular-nums text-foreground/80">
          {fmtUsd(perClipUsd)} / clip · {fmtUsd(monthlyUsd)} / mo
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-md bg-background/60 p-2">
              <div className="text-muted-foreground">Page size (this clip)</div>
              <div className="font-medium tabular-nums">{formatBytesShort(bytesPerClip)}</div>
            </div>
            <div className="rounded-md bg-background/60 p-2">
              <div className="text-muted-foreground">Per-clip cost</div>
              <div className="font-medium tabular-nums">{fmtUsd(perClipUsd)}</div>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Clips per month</span>
              <span className="font-medium tabular-nums">{clipsPerMonth}</span>
            </div>
            <Slider
              value={[clipsPerMonth]}
              min={1}
              max={500}
              step={1}
              onValueChange={(v) => setClipsPerMonth(v[0] ?? 30)}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>1</span>
              <span>250</span>
              <span>500</span>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md bg-primary/10 px-2 py-1.5 text-xs">
            <span className="text-muted-foreground">Estimated monthly cost</span>
            <span className="font-semibold tabular-nums text-foreground">{fmtUsd(monthlyUsd)}</span>
          </div>

          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Estimate only. Includes fetch bandwidth, edge function invocations, and
            compressed storage. Most workspaces have a free monthly Cloud allowance
            that covers typical clipping activity.
          </p>
        </div>
      )}
    </div>
  );
};

export default ClipCostEstimator;
