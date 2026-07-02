/**
 * CameraScannerScreen — Full-screen Cal AI-style camera scanner.
 *
 * - Live camera preview (getUserMedia) with animated corner brackets and a
 *   sweeping scan-line for visual scanning feedback.
 * - Frosted-glass bottom bar: Scan Note / Barcode / Image / Gallery mode chips
 *   plus a large shutter button, flash toggle, and gallery shortcut.
 * - On capture, grabs the current video frame and returns a compressed JPEG
 *   data URL via `onCapture`. Falls back to the OS gallery picker when the
 *   camera is unavailable (denied permission, no device, etc).
 *
 * Consumers pipe the returned data URL into the existing AI vision extractors
 * (ai-extract-tasks-from-image / ai-extract-note-from-image).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Zap,
  ZapOff,
  Image as ImageIcon,
  ScanLine,
  Barcode,
  ImagePlus,
  Loader2,
  Boxes,
  Layers,
  Files,
  Undo2,
  Check,
  Lock,
  Sparkles,
  Plus,
  Trash2,
  GripVertical,
  RotateCcw,
  AlertCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { captureImageForAI } from '@/utils/imageCaptureForAI';
import { compressImage } from '@/utils/imageCompression';

export type ScannerMode = 'note' | 'image' | 'gallery';

export interface ObjectDetection {
  label: string;
  /** [ymin, xmin, ymax, xmax] normalized 0-1000 (Gemini standard). */
  box: [number, number, number, number] | number[];
}

export interface ObjectCountResult {
  totalCount: number;
  summary: string;
  objectCounts: Array<{ label: string; count: number; confidence?: string }>;
  detections: ObjectDetection[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Called with a JPEG data URL when the user captures a frame. */
  onCapture: (dataUrl: string, opts?: { handwriting?: boolean }) => void;
  /**
   * Called when Object Counting mode captures a frame. Should invoke the AI
   * and RESOLVE with the counted result. The scanner will then show a review
   * overlay (bboxes + counts + Confirm/Retake) on top of the frozen frame.
   * If it rejects, the scanner returns to the live camera view.
   */
  onObjectCount?: (dataUrl: string) => Promise<ObjectCountResult>;
  /** Called when the user confirms an object-count result. Parent creates the note/task and should close. */
  onConfirmObjectCount?: (dataUrl: string, result: ObjectCountResult) => void;
  /**
   * Called when the user finishes a multi-page batch scan in Note mode.
   * Receives every captured page in order. Parent should OCR each page
   * and combine them into a single note with page separators.
   */
  onBatchNote?: (dataUrls: string[]) => Promise<void> | void;
  /**
   * Called when a barcode is decoded in `barcode` mode. If omitted, decoded
   * barcodes are surfaced as a toast and the raw frame is still sent via
   * onCapture so the caller can decide how to handle it.
   */
  onBarcode?: (value: string, format: string) => void;
  /** Screen title shown at the top. Defaults to "Scan". */
  title?: string;
  /** Which mode chip should be highlighted first. */
  initialMode?: ScannerMode;
  /**
   * Parent-controlled status overlay. Renders a full-screen blocking layer
   * with a spinner + label. Use to show "Uploading…" / "Processing…" while
   * the camera view is still mounted so the user always sees progress.
   */
  status?: { label: string; sublabel?: string } | null;
  /**
   * Pro-gating. When `hasPro` is false, premium toggles (Burst, Batch) show a
   * Batch) show a lock and, when tapped, present a clear upsell overlay with a
   * Subscribe CTA that calls `onRequestUpgrade`. Defaults to `true`.
   */
  hasPro?: boolean;
  onRequestUpgrade?: () => void;
}


const MODES: Array<{ id: ScannerMode; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'note', label: 'Scan Note', icon: ScanLine },
  
  { id: 'image', label: 'Image', icon: ImagePlus },
  { id: 'gallery', label: 'Gallery', icon: ImageIcon },
];

// Barcode mode removed; keep no-op stubs so any residual references stay type-safe.
const BARCODE_FORMATS: any[] = [];
type BrowserMultiFormatReader = any;
const createZxingReader = (): BrowserMultiFormatReader | null => null;


export const CameraScannerScreen = ({
  isOpen,
  onClose,
  onCapture,
  onObjectCount,
  onConfirmObjectCount,
  onBatchNote,
  onBarcode,
  title = 'Scan',
  initialMode = 'note',
  status = null,
  hasPro = true,
  onRequestUpgrade,
}: Props) => {
  // Pro-gate upsell overlay state.
  const [upsell, setUpsell] = useState<null | { feature: 'burst' | 'batch' }>(null);
  const requirePro = useCallback((feature: 'burst' | 'batch') => {
    if (hasPro) return true;
    setUpsell({ feature });
    return false;
  }, [hasPro]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const barcodeLoopRef = useRef<number | null>(null);
  const barcodeHandledRef = useRef(false);
  const zxingReaderRef = useRef<BrowserMultiFormatReader | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [mode, setMode] = useState<ScannerMode>(initialMode);
  const [capturing, setCapturing] = useState(false);
  const [barcodeSupported, setBarcodeSupported] = useState(true);
  const [lastBarcode, setLastBarcode] = useState<string | null>(null);
  // Burst mode: capture 3 frames and auto-pick the sharpest.
  const [burstOn, setBurstOn] = useState(false);
  // Multi-page batch scan (Note mode): capture N pages, save as one combined note.
  const [batchOn, setBatchOn] = useState(false);
  const [batchPages, setBatchPages] = useState<string[]>([]);
  const [batchProcessing, setBatchProcessing] = useState(false);
  // Object-count review state.
  const [objReviewFrame, setObjReviewFrame] = useState<string | null>(null);
  const [objReviewLoading, setObjReviewLoading] = useState(false);
  const [objReviewResult, setObjReviewResult] = useState<ObjectCountResult | null>(null);
  const [objReviewError, setObjReviewError] = useState<string | null>(null);
  const modeRef = useRef<ScannerMode>(initialMode);
  // On-screen tap trace (visible over the camera) — helps verify chip taps
  // are actually reaching the handlers on real devices.
  const [tapTrace, setTapTrace] = useState<string>('');


  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      modeRef.current = initialMode;
      setObjReviewFrame(null);
      setObjReviewResult(null);
      setObjReviewLoading(false);
      setObjReviewError(null);
    }
  }, [initialMode, isOpen]);


  const stopStream = useCallback(() => {
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((t) => {
        try { t.stop(); } catch { /* ignore */ }
      });
    }
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setReady(false);
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  // Start / stop camera with open state.
  useEffect(() => {
    if (!isOpen) {
      stopStream();
      return;
    }
    // Pause camera stream while reviewing an object-count result.
    if (objReviewFrame) return;
    let cancelled = false;
    setError(null);
    setReady(false);
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera API not available');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.muted = true;
          (videoRef.current as any).playsInline = true;
          await videoRef.current.play().catch(() => { /* ignore autoplay errors */ });
        }
        try {
          const track = stream.getVideoTracks()[0];
          const caps = (track.getCapabilities?.() as any) || {};
          if (caps.torch) setTorchSupported(true);
        } catch { /* ignore */ }
        setReady(true);
      } catch (e: any) {
        console.warn('[CameraScannerScreen] camera unavailable', e);
        setError(e?.message || 'Camera unavailable');
      }
    })();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [isOpen, stopStream, objReviewFrame]);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next } as any] });
      setTorchOn(next);
    } catch (e) {
      console.warn('[CameraScannerScreen] torch toggle failed', e);
      toast.error('Flash not available on this device');
    }
  }, [torchOn]);

  // Reset barcode-handled guard whenever mode toggles or scanner reopens.
  useEffect(() => {
    barcodeHandledRef.current = false;
    setLastBarcode(null);
  }, [mode, isOpen]);




  const handleShutter = useCallback(async () => {
    console.log('[Scanner] shutter fired', { mode, ready, capturing, burstOn });
    if (capturing) {
      console.log('[Scanner] shutter ignored — already capturing');
      return;
    }
    setCapturing(true);
    try {
      if (!ready) {
        toast.error('Camera not ready yet');
        return;
      }
      const video = videoRef.current;
      if (!video || video.videoWidth === 0) {
        toast.error('Camera not ready yet');
        return;
      }

      const modeLabel =
        mode === 'image' ? 'Image' : 'Scan Note';
      toast(
        burstOn ? `📸 Burst · ${modeLabel} — picking sharpest…` : `📸 Captured · ${modeLabel} mode`,
        { duration: 1200 },
      );

      // Burst mode: grab 3 frames ~180ms apart and pick the sharpest.
      // Otherwise: single frame.
      const canvas = burstOn
        ? await captureSharpestBurst(video, 3, 180)
        : captureSingleFrame(video);
      if (!canvas) {
        toast.error('Could not capture frame');
        return;
      }
      const raw = canvas.toDataURL('image/jpeg', 0.92);
      const compressed = await compressImage(raw, {
        maxWidth: 1400,
        maxHeight: 1400,
        quality: 0.82,
        mimeType: 'image/jpeg',
      }).catch(() => raw);
      console.log('[Scanner] frame captured', { mode, bytes: compressed.length, burst: burstOn });



      // Batch mode (Note only): accumulate the page and stay on the camera view.
      if (mode === 'note' && batchOn && onBatchNote) {
        setBatchPages((prev) => {
          const next = [...prev, compressed];
          toast.success(`📄 Page ${next.length} added · tap Done to combine`, { duration: 1200 });
          return next;
        });
        return;
      }

      onCapture(compressed);
      onClose();
    } catch (e) {
      console.error('[Scanner] shutter error', e);
      toast.error('Could not capture image');
    } finally {
      setCapturing(false);
    }
  }, [batchOn, burstOn, capturing, mode, onBarcode, onBatchNote, onCapture, onClose, onObjectCount, ready]);

  // Reset batch when the scanner closes.
  useEffect(() => {
    if (!isOpen) {
      setBatchPages([]);
      setBatchOn(false);
      setBatchProcessing(false);
    }
  }, [isOpen]);

  const finishBatch = useCallback(async () => {
    if (!onBatchNote || batchPages.length === 0 || batchProcessing) return;
    setBatchProcessing(true);
    try {
      await onBatchNote(batchPages);
      setBatchPages([]);
      // Parent typically closes the scanner after saving; if not, we stay open.
    } catch (e: any) {
      console.error('[Scanner] batch finish error', e);
      toast.error(e?.message || 'Could not combine pages');
    } finally {
      setBatchProcessing(false);
    }
  }, [batchPages, batchProcessing, onBatchNote]);

  const undoLastBatchPage = useCallback(() => {
    setBatchPages((prev) => {
      if (prev.length === 0) return prev;
      toast(`Removed page ${prev.length}`, { duration: 900 });
      return prev.slice(0, -1);
    });
  }, []);

  const openGallery = useCallback(async () => {
    console.log('[Scanner] gallery opened via explicit gallery button');
    setCapturing(true);
    try {
      const dataUrl = await captureImageForAI('gallery');
      if (dataUrl) {
        toast('🖼️ Photo picked from gallery', { duration: 1000 });
        onCapture(dataUrl);
        onClose();
      }
    } finally {
      setCapturing(false);
    }
  }, [onCapture, onClose]);


  const activeModeLabel = useMemo(
    () => MODES.find((m) => m.id === mode)?.label ?? '',
    [mode],
  );

  const selectScannerMode = useCallback((id: ScannerMode, label: string, locked: boolean) => {
    const ts = new Date().toLocaleTimeString();
    console.log('[Scanner] mode selected →', id, { label, locked, ts });
    setTapTrace(`${ts} · tap → ${label}${locked ? ' (locked)' : ''}`);

    if (locked) {
      toast.info(`${label} is a Pro feature`, { duration: 1200 });
      requirePro('burst');
      return;
    }
    if (modeRef.current === id) {
      toast(`Already in ${label}`, { duration: 700 });
      return;
    }
    modeRef.current = id;
    setMode(id);
    toast.success(`Mode: ${label}`, { duration: 900 });
  }, [requirePro]);


  // NOTE: Previously we called e.stopPropagation() during the CAPTURE phase on
  // the overlay. That silently killed every child button's onPointerDown /
  // onPointerUp handler (including the Barcode/Objects chips), because React
  // stops synthetic-event dispatch to descendants once stopPropagation runs in
  // capture. Now we ONLY stop propagation in the bubble phase, so the buttons'
  // handlers run first and the outer Radix Sheet still doesn't see the event.

  if (!isOpen) return null;

  const stopBubble = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  const overlay = (
    <div
      className="fixed inset-0 z-[300] bg-black text-white flex flex-col select-none"
      style={{ isolation: 'isolate', pointerEvents: 'auto' }}
      // Bubble phase only — after child buttons handle their own pointer events.
      onPointerDown={stopBubble}
      onPointerUp={stopBubble}
      onMouseDown={stopBubble}
      onTouchStart={stopBubble}
    >
      {/* Live camera feed (hidden while reviewing a frozen result) */}
      {!objReviewFrame && (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={cn(
            'absolute inset-0 w-full h-full object-cover',
            !ready && 'opacity-0',
          )}
        />
      )}
      {/* Frozen object-count review frame + bounding boxes overlay */}
      {objReviewFrame && (
        <ObjectCountReviewOverlay
          frame={objReviewFrame}
          result={objReviewResult}
          loading={objReviewLoading}
          error={objReviewError}
          onRetake={() => {
            setObjReviewFrame(null);
            setObjReviewResult(null);
            setObjReviewError(null);
          }}
          onConfirm={() => {
            if (!objReviewResult || !objReviewFrame) return;
            onConfirmObjectCount?.(objReviewFrame, objReviewResult);
            onClose();
          }}
        />
      )}
      {/* Vignette / darken outside the frame */}
      {!objReviewFrame && (
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/70 pointer-events-none" />
      )}

      {/* Top bar */}
      <div
        className="relative z-10 flex items-center justify-between px-4 pt-3 pb-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
      >
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-xl border border-white/15 flex items-center justify-center active:scale-95 transition"
          aria-label="Close scanner"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="text-sm font-semibold tracking-wide bg-white/10 backdrop-blur-xl border border-white/15 rounded-full px-4 py-1.5">
          {title}
        </div>
        <div className="flex items-center gap-2">
          {mode === 'note' && onBatchNote && (
            <button
              onClick={() => {
                if (!requirePro('batch')) return;
                setBatchOn((v) => {
                  const next = !v;
                  toast(next
                    ? 'Batch scan on · capture pages, tap Done to combine'
                    : 'Batch scan off', { duration: 1200 });
                  if (!next) setBatchPages([]);
                  return next;
                });
              }}
              className={cn(
                'h-10 px-3 rounded-full backdrop-blur-xl border flex items-center gap-1.5 text-xs font-semibold active:scale-95 transition',
                batchOn
                  ? 'bg-primary text-primary-foreground border-primary shadow-[0_6px_18px_hsl(var(--primary)/0.35)]'
                  : 'bg-white/10 border-white/15 text-white',
              )}
              aria-label="Toggle batch scan"
            >
              <Files className="h-4 w-4" />
              Batch{batchPages.length > 0 ? ` · ${batchPages.length}` : ''}
              {!hasPro && <Lock className="h-3 w-3 ml-0.5 opacity-80" />}
            </button>
          )}
          <button
            onClick={() => {
              if (!requirePro('burst')) return;
              setBurstOn((v) => !v);
              toast(burstOn ? 'Burst mode off' : 'Burst mode on · 3 shots, sharpest wins', { duration: 1100 });
            }}
            className={cn(
              'h-10 px-3 rounded-full backdrop-blur-xl border flex items-center gap-1.5 text-xs font-semibold active:scale-95 transition',
              burstOn
                ? 'bg-white text-black border-white shadow-[0_6px_18px_rgba(255,255,255,0.35)]'
                : 'bg-white/10 border-white/15 text-white',
            )}
            aria-label="Toggle burst mode"
          >
            <Layers className="h-4 w-4" />
            Burst
            {!hasPro && <Lock className="h-3 w-3 ml-0.5 opacity-80" />}
          </button>
          <button
            onClick={toggleTorch}
            disabled={!torchSupported}
            className={cn(
              'w-10 h-10 rounded-full backdrop-blur-xl border border-white/15 flex items-center justify-center active:scale-95 transition',
              torchOn ? 'bg-amber-400/90 text-black border-amber-200' : 'bg-white/10',
              !torchSupported && 'opacity-40',
            )}
            aria-label="Toggle flash"
          >
            {torchOn ? <Zap className="h-5 w-5" /> : <ZapOff className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Scanner frame */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-8">
        <div className="relative aspect-square w-full max-w-[min(80vw,420px)]">
          {/* Corner brackets */}
          <CornerBracket className="top-0 left-0" corner="tl" />
          <CornerBracket className="top-0 right-0" corner="tr" />
          <CornerBracket className="bottom-0 left-0" corner="bl" />
          <CornerBracket className="bottom-0 right-0" corner="br" />

          {/* Sweeping scan line */}
          {ready && (
            <div className="absolute inset-x-4 top-0 bottom-0 overflow-hidden pointer-events-none">
              <div
                className="absolute left-0 right-0 h-[2px] rounded-full"
                style={{
                  background:
                    'linear-gradient(90deg, transparent, hsl(var(--primary) / 0.9), transparent)',
                  boxShadow: '0 0 24px 4px hsl(var(--primary) / 0.6)',
                  animation: 'scanner-sweep 2.4s ease-in-out infinite',
                }}
              />
            </div>
          )}

          {/* Hint / status */}
          <div className="absolute -bottom-10 left-0 right-0 text-center text-xs text-white/80">
            {error ? (
              <span className="text-white/90">{error} — use Gallery below</span>
            ) : !ready ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Starting camera…
              </span>
            ) : (

              <span>Point at a sticky note or handwritten page · {activeModeLabel}</span>
            )}
          </div>

        </div>
      </div>

      {/* Batch scan tray — appears above the bottom bar as pages accumulate */}
      {batchOn && batchPages.length > 0 && !objReviewFrame && (
        <div className="relative z-20 px-4 pb-2">
          <div className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-xl p-3 shadow-[0_10px_40px_rgba(0,0,0,0.4)]">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold tracking-wide text-white/90">
                {batchPages.length} page{batchPages.length === 1 ? '' : 's'} captured
              </div>
              <div className="text-[10px] text-white/60 uppercase tracking-wider">
                One combined note
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
              {batchPages.map((src, i) => (
                <div
                  key={i}
                  className="relative shrink-0 w-14 h-14 rounded-lg overflow-hidden border border-white/20 bg-black/40"
                >
                  <img src={src} alt={`Page ${i + 1}`} className="w-full h-full object-cover" />
                  <span className="absolute bottom-0 right-0 text-[10px] px-1 rounded-tl bg-black/70 text-white font-bold">
                    {i + 1}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onPointerDownCapture={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); undoLastBatchPage(); }}
                disabled={batchProcessing}
                className="flex-1 h-10 rounded-xl bg-white/10 border border-white/15 text-xs font-semibold text-white active:scale-95 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <Undo2 className="h-4 w-4" />
                Undo last
              </button>
              <button
                type="button"
                onPointerDownCapture={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); finishBatch(); }}
                disabled={batchProcessing}
                className="flex-[1.4] h-10 rounded-xl bg-primary text-primary-foreground text-xs font-bold active:scale-95 transition disabled:opacity-60 flex items-center justify-center gap-1.5 shadow-[0_6px_18px_hsl(var(--primary)/0.4)]"
              >
                {batchProcessing ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Combining {batchPages.length} pages…</>
                ) : (
                  <><Check className="h-4 w-4" /> Done · Save {batchPages.length} pages</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom frosted control bar — hidden during any review overlay */}
      {!objReviewFrame && (
      <div
        className="relative z-10 px-4 pt-3 bg-gradient-to-t from-black/90 via-black/60 to-transparent"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
      >
        {/* Mode chips — Gallery moved out so it can't compete with the shutter */}
        {tapTrace && (
          <div className="mb-1 px-2 py-1 rounded-md bg-black/60 border border-white/10 text-[10px] font-mono text-white/80 self-start max-w-full truncate">
            {tapTrace}
          </div>
        )}
        <ChipStrip>

          {MODES.filter((m) => m.id !== 'gallery').map(({ id, label, icon: Icon }) => {
            const active = mode === id;
            const locked = false;
            return (
              <ChipButton
                key={id}
                active={active}
                onSelect={() => {
                  selectScannerMode(id, label, locked);
                }}
                data-scanner-mode={id}
                data-scanner-label={label}
                data-scanner-locked={locked ? 'true' : 'false'}
              >
                <Icon className="h-4 w-4" />
                {label}
                {locked && <Lock className="h-3 w-3 ml-0.5 opacity-80" />}
              </ChipButton>
            );
          })}
        </ChipStrip>

        {/* Shutter row — CamScanner-style: big centered shutter, tucked gallery, mode badge */}
        <div className="relative flex items-center justify-center h-[96px]">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              openGallery();
            }}
            disabled={capturing}
            className="absolute left-0 bottom-1 w-11 h-11 rounded-xl bg-white/10 backdrop-blur-xl border border-white/15 flex items-center justify-center active:scale-95 transition disabled:opacity-50"
            aria-label="Pick from gallery"
          >
            <ImageIcon className="h-5 w-5" />
          </button>

          <button
            type="button"
            onPointerDownCapture={(e) => e.stopPropagation()}
            onClickCapture={(e) => {
              e.stopPropagation();
              e.preventDefault();
              handleShutter();
            }}
            disabled={capturing || !ready}
            style={{ zIndex: 50, isolation: 'isolate', touchAction: 'manipulation' }}
            className="relative w-[86px] h-[86px] rounded-full flex items-center justify-center active:scale-95 transition disabled:opacity-60 pointer-events-auto"
            aria-label={`Capture (${activeModeLabel})`}
            data-testid="scanner-shutter"
            data-mode={mode}
          >
            <span className="absolute inset-0 rounded-full border-[3px] border-white shadow-[0_0_0_5px_rgba(0,0,0,0.35),0_10px_30px_rgba(0,0,0,0.45)] pointer-events-none" />
            <span
              className={cn(
                'w-[66px] h-[66px] rounded-full bg-white transition-transform pointer-events-none',
                capturing && 'scale-90 opacity-80',
              )}
            />
            {capturing && (
              <Loader2 className="absolute h-7 w-7 text-black animate-spin pointer-events-none" />
            )}
          </button>

          <div className="absolute right-0 bottom-1 h-11 px-3 rounded-xl bg-white/10 backdrop-blur-xl border border-white/15 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/90">
            {activeModeLabel}
          </div>
        </div>
      </div>
      )}

      {/* Local keyframes */}
      <style>{`
        @keyframes scanner-sweep {
          0% { transform: translateY(0%); opacity: 0; }
          10% { opacity: 1; }
          50% { transform: translateY(calc(min(80vw, 420px) - 4px)); opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(0%); opacity: 0; }
        }
        @keyframes scanner-corner-pulse {
          0%, 100% { opacity: 0.9; filter: drop-shadow(0 0 4px hsl(var(--primary) / 0.7)); }
          50% { opacity: 1; filter: drop-shadow(0 0 14px hsl(var(--primary) / 0.95)); }
        }
      `}</style>

      {/* Parent-controlled status overlay (uploading / processing) */}
      {status && (
        <div className="absolute inset-0 z-20 bg-black/70 backdrop-blur-sm flex items-center justify-center px-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <Loader2 className="h-8 w-8 text-white animate-spin" />
            <div className="text-base font-semibold">{status.label}</div>
            {status.sublabel && (
              <div className="text-xs text-white/70 max-w-xs">{status.sublabel}</div>
            )}
          </div>
        </div>
      )}

      {/* Pro-gated upsell overlay */}
      {upsell && (
        <ProUpsellOverlay
          feature={upsell.feature}
          onClose={() => setUpsell(null)}
          onSubscribe={() => {
            setUpsell(null);
            onRequestUpgrade?.();
          }}
        />
      )}
    </div>

  );

  return createPortal(overlay, document.body);
};

const CornerBracket = ({
  className,
  corner,
}: {
  className?: string;
  corner: 'tl' | 'tr' | 'bl' | 'br';
}) => {
  const base = 'absolute w-10 h-10 border-primary';
  const sides: Record<typeof corner, string> = {
    tl: 'border-t-[3px] border-l-[3px] rounded-tl-2xl',
    tr: 'border-t-[3px] border-r-[3px] rounded-tr-2xl',
    bl: 'border-b-[3px] border-l-[3px] rounded-bl-2xl',
    br: 'border-b-[3px] border-r-[3px] rounded-br-2xl',
  };
  return (
    <div
      className={cn(base, sides[corner], className)}
      style={{ animation: 'scanner-corner-pulse 2s ease-in-out infinite' }}
    />
  );
};

/** Grab a single frame from the live video into a canvas. */
function captureSingleFrame(video: HTMLVideoElement): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/**
 * Burst-capture: grab N frames spaced by `spacingMs` and return the sharpest
 * one. Sharpness = mean squared Laplacian on a downscaled grayscale copy —
 * cheap, deterministic, and correlates well with motion blur / defocus.
 */
async function captureSharpestBurst(
  video: HTMLVideoElement,
  count: number,
  spacingMs: number,
): Promise<HTMLCanvasElement | null> {
  const frames: HTMLCanvasElement[] = [];
  for (let i = 0; i < count; i++) {
    const c = captureSingleFrame(video);
    if (c) frames.push(c);
    if (i < count - 1) await new Promise((r) => setTimeout(r, spacingMs));
  }
  if (!frames.length) return null;
  let best = frames[0];
  let bestScore = -1;
  for (const f of frames) {
    const s = sharpnessScore(f);
    if (s > bestScore) { bestScore = s; best = f; }
  }
  console.log('[Scanner] burst scores', frames.map(sharpnessScore), 'chose', bestScore);
  return best;
}

/** Cheap sharpness estimate via variance of a 3x3 Laplacian on grayscale. */
function sharpnessScore(canvas: HTMLCanvasElement): number {
  const w = 200;
  const h = Math.max(1, Math.round((canvas.height / canvas.width) * w));
  const small = document.createElement('canvas');
  small.width = w; small.height = h;
  const sctx = small.getContext('2d');
  if (!sctx) return 0;
  sctx.drawImage(canvas, 0, 0, w, h);
  const data = sctx.getImageData(0, 0, w, h).data;
  // Grayscale
  const gray = new Float32Array(w * h);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }
  let sum = 0, sumSq = 0, n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap =
        -gray[i - w - 1] - gray[i - w] - gray[i - w + 1]
        - gray[i - 1] + 8 * gray[i] - gray[i + 1]
        - gray[i + w - 1] - gray[i + w] - gray[i + w + 1];
      sum += lap; sumSq += lap * lap; n++;
    }
  }
  if (!n) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}



async function decodeBarcodeFromCanvas(
  canvas: HTMLCanvasElement,
): Promise<{ rawValue: string; format: string } | null> {
  const AnyBarcodeDetector = (window as any).BarcodeDetector;
  if (!AnyBarcodeDetector) return null;
  try {
    const detector = new AnyBarcodeDetector();
    const results = await detector.detect(canvas);
    if (results && results.length > 0) {
      return {
        rawValue: String(results[0].rawValue ?? ''),
        format: String(results[0].format ?? 'unknown'),
      };
    }
  } catch { /* ignore */ }
  return null;
}

async function decodeBarcodeWithZxing(
  source: HTMLVideoElement | HTMLCanvasElement,
  reader: BrowserMultiFormatReader | null,
): Promise<{ rawValue: string; format: string } | null> {
  if (!reader) return null;
  const result = source instanceof HTMLCanvasElement
    ? reader.decodeFromCanvas(source)
    : reader.decode(source);
  const rawValue = result?.getText?.()?.trim?.() || '';
  if (!rawValue) return null;
  const barcodeFormat = result.getBarcodeFormat?.();
  const format = typeof barcodeFormat === 'number'
    ? String(barcodeFormat).toLowerCase()
    : String(barcodeFormat || 'unknown');
  return { rawValue, format };
}

/**
 * Scroll-safe chip strip: taps that were actually horizontal scroll gestures
 * are suppressed so users can pan through the mode chips without accidentally
 * activating one (fixes "Barcode aage scroll nahi hota" / accidental Gallery).
 */
const ChipStrip = ({ children }: { children: React.ReactNode }) => (
  <div
    className="relative z-30 flex items-center justify-start gap-2 pb-3 overflow-x-auto overscroll-x-contain touch-pan-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    style={{ WebkitOverflowScrolling: 'touch', pointerEvents: 'auto' }}
  >
    {children}
  </div>
);

const ChipButton = ({
  active,
  onSelect,
  children,
  ...buttonProps
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  active: boolean;
  onSelect: () => void;
  children: React.ReactNode;
}) => {
  const startRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const cancelledRef = useRef(false);
  const firedRef = useRef(false);
  const label = (buttonProps as any)['data-scanner-label'] || 'chip';
  const fire = (source: string) => {
    if (cancelledRef.current || firedRef.current) {
      console.log(`[Scanner] chip "${label}" ${source} suppressed (cancelled=${cancelledRef.current}, fired=${firedRef.current})`);
      return;
    }
    firedRef.current = true;
    console.log(`[Scanner] chip "${label}" fired via ${source}`);
    onSelect();
    setTimeout(() => { firedRef.current = false; }, 250);
  };
  return (
    <button
      {...buttonProps}
      type="button"
      style={{ position: 'relative', zIndex: 40, touchAction: 'manipulation', pointerEvents: 'auto', ...(buttonProps.style || {}) }}
      onPointerDown={(e) => {
        buttonProps.onPointerDown?.(e);
        e.stopPropagation();
        console.log(`[Scanner] chip "${label}" pointerdown`, { x: e.clientX, y: e.clientY, type: e.pointerType });
        startRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
        cancelledRef.current = false;
        firedRef.current = false;
      }}
      onPointerMove={(e) => {
        buttonProps.onPointerMove?.(e);
        const s = startRef.current;
        if (!s) return;
        const dx = Math.abs(e.clientX - s.x);
        const dy = Math.abs(e.clientY - s.y);
        if (dx > 18 && dx > dy * 1.5) cancelledRef.current = true;
      }}
      onPointerUp={(e) => {
        buttonProps.onPointerUp?.(e);
        e.stopPropagation();
        const s = startRef.current;
        if (!s) {
          console.log(`[Scanner] chip "${label}" pointerup with no start`);
          return;
        }
        const dx = Math.abs(e.clientX - s.x);
        const dy = Math.abs(e.clientY - s.y);
        if (dx > 18 && dx > dy * 1.5) {
          console.log(`[Scanner] chip "${label}" pointerup treated as scroll`);
          return;
        }
        fire('pointerup');
      }}
      onClick={(e) => {
        buttonProps.onClick?.(e);
        e.stopPropagation();
        fire('click');
      }}
      className={cn(
        'flex-shrink-0 h-11 px-4 rounded-2xl border flex items-center gap-2 text-xs font-semibold backdrop-blur-xl transition active:scale-95 touch-manipulation',
        active
          ? 'bg-white text-black border-white shadow-[0_8px_30px_rgba(255,255,255,0.25)]'
          : 'bg-white/10 text-white border-white/15',
      )}
    >
      {children}
    </button>
  );
};


/**
 * Full-screen review overlay shown after the object-count shutter fires.
 * Displays the frozen frame, per-instance bounding boxes returned by Gemini,
 * a total-count badge, grouped counts, and Retake / Confirm actions.
 */
const ObjectCountReviewOverlay = ({
  frame,
  result,
  loading,
  error,
  onRetake,
  onConfirm,
}: {
  frame: string;
  result: ObjectCountResult | null;
  loading: boolean;
  error: string | null;
  onRetake: () => void;
  onConfirm: () => void;
}) => {
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  // Compute the "contain" fit rectangle inside the container so bboxes align.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !imgSize) return;
    const compute = () => {
      const cw = el.clientWidth;
      const ch = el.clientHeight;
      const scale = Math.min(cw / imgSize.w, ch / imgSize.h);
      const width = imgSize.w * scale;
      const height = imgSize.h * scale;
      setBox({ left: (cw - width) / 2, top: (ch - height) / 2, width, height });
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [imgSize]);

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-black text-white">
      <div ref={containerRef} className="relative flex-1 overflow-hidden">
        <img
          src={frame}
          alt="Captured frame"
          className="absolute inset-0 w-full h-full object-contain"
          onLoad={(e) => {
            const t = e.currentTarget;
            setImgSize({ w: t.naturalWidth, h: t.naturalHeight });
          }}
        />
        {/* Bounding boxes */}
        {box && result?.detections?.map((d, i) => {
          const [ymin, xmin, ymax, xmax] = d.box as number[];
          if ([ymin, xmin, ymax, xmax].some((n) => typeof n !== 'number')) return null;
          const left = box.left + (xmin / 1000) * box.width;
          const top = box.top + (ymin / 1000) * box.height;
          const width = ((xmax - xmin) / 1000) * box.width;
          const height = ((ymax - ymin) / 1000) * box.height;
          return (
            <div
              key={i}
              className="absolute border-2 rounded-md pointer-events-none"
              style={{
                left,
                top,
                width,
                height,
                borderColor: 'hsl(var(--primary))',
                boxShadow: '0 0 0 1px rgba(0,0,0,0.5) inset, 0 0 12px hsl(var(--primary) / 0.6)',
              }}
            >
              <span
                className="absolute -top-6 left-0 px-2 py-0.5 text-[10px] font-semibold rounded-md whitespace-nowrap"
                style={{
                  background: 'hsl(var(--primary))',
                  color: 'hsl(var(--primary-foreground))',
                }}
              >
                {i + 1}. {d.label}
              </span>
            </div>
          );
        })}
        {/* Loading / error overlay */}
        {loading && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin" />
              <div className="text-sm font-medium">Counting objects…</div>
              <div className="text-xs text-white/70">Analyzing with Gemini vision</div>
            </div>
          </div>
        )}
        {/* Total-count badge */}
        {!loading && result && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl px-4 py-2 flex items-center gap-2">
            <Boxes className="h-4 w-4" />
            <span className="text-sm font-semibold">
              {result.totalCount} object{result.totalCount === 1 ? '' : 's'}
            </span>
          </div>
        )}
      </div>

      {/* Bottom summary + actions */}
      <div
        className="relative px-4 pt-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
      >
        {error ? (
          <div className="mb-3 text-sm text-red-300">{error}</div>
        ) : result ? (
          <div className="mb-3 max-h-32 overflow-y-auto rounded-2xl bg-white/5 border border-white/10 p-3 text-xs">
            <div className="font-medium mb-1">{result.summary}</div>
            {result.objectCounts?.length ? (
              <ul className="space-y-0.5 text-white/80">
                {result.objectCounts.map((oc, i) => (
                  <li key={i}>
                    • {oc.label}: <strong className="text-white">{oc.count}</strong>
                    {oc.confidence ? <span className="opacity-60"> ({oc.confidence})</span> : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onRetake}
            className="flex-1 h-12 rounded-2xl bg-white/10 border border-white/15 text-sm font-semibold active:scale-[0.98] transition"
          >
            Retake
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading || !result || !!error}
            className="flex-1 h-12 rounded-2xl bg-white text-black text-sm font-semibold active:scale-[0.98] transition disabled:opacity-50"
          >
            Confirm & Create
          </button>
        </div>
      </div>
    </div>
  );
};



/**
 * Pro upsell overlay — shown when a non-Pro user taps a Pro-gated toggle
 * (Burst, Batch) inside the scanner. Explains the benefit and
 * fires `onSubscribe` for the parent to route into the paywall.
 */
const ProUpsellOverlay = ({
  feature,
  onClose,
  onSubscribe,
}: {
  feature: 'burst' | 'batch';
  onClose: () => void;
  onSubscribe: () => void;
}) => {
  const copy = {
    burst: {
      title: 'Burst capture is a Pro feature',
      body: 'Every shot fires 3 frames and keeps the sharpest one — huge quality boost for handheld and low-light shots.',
    },
    batch: {
      title: 'Multi-page batch scan is a Pro feature',
      body: 'Capture as many pages as you need and stitch them into a single note with page headings and separators.',
    },
  }[feature];

  return (
    <div
      className="absolute inset-0 z-40 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center px-4 pb-6 sm:pb-0"
      onPointerDownCapture={(e) => e.stopPropagation()}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl border border-white/15 bg-neutral-900 text-white p-5 shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-primary/20 border border-primary/40 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <div className="text-xs font-semibold tracking-wider uppercase text-primary/90 flex items-center gap-1">
              <Lock className="h-3 w-3" />
              Pro feature
            </div>
            <div className="text-base font-bold leading-tight">{copy.title}</div>
          </div>
        </div>
        <p className="mt-3 text-sm text-white/70 leading-relaxed">{copy.body}</p>

        <ul className="mt-3 space-y-1.5 text-[13px] text-white/80">
          <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5" /> Full camera scanner suite</li>
          <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5" /> Burst and Multi-page batch capture</li>
          <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5" /> Unlimited AI-powered extractions</li>
        </ul>

        <div className="flex gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 rounded-xl bg-white/10 border border-white/15 text-sm font-semibold active:scale-[0.98]"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={onSubscribe}
            className="flex-[1.5] h-11 rounded-xl bg-primary text-primary-foreground text-sm font-bold active:scale-[0.98] shadow-[0_8px_24px_hsl(var(--primary)/0.4)] flex items-center justify-center gap-1.5"
          >
            <Sparkles className="h-4 w-4" />
            Unlock Pro
          </button>
        </div>
      </div>
    </div>
  );
};

export default CameraScannerScreen;


