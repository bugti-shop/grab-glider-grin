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
  Receipt,
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

export type ScannerMode = 'note' | 'image' | 'receipt' | 'gallery';

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
  onCapture: (dataUrl: string) => void;
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
   * Called when Receipt mode captures a frame. Should parse the receipt
   * (via the ai-extract-receipt edge function) and return the structured
   * result. The scanner will hand it off to `onConfirmReceipt` for final
   * insertion.
   */
  onReceipt?: (dataUrl: string) => Promise<{
    merchant: string; total: number; currency: string; date: string;
    category?: string; paymentMethod?: string; tax?: number;
    items?: Array<{ name: string; qty?: number; unitPrice?: number; lineTotal?: number }>;
    html: string; title: string;
  }>;
  /** Called when the user confirms the parsed receipt. Receives edited fields. */
  onConfirmReceipt?: (dataUrl: string, result: {
    merchant: string; total: number; currency: string; date: string;
    category?: string; paymentMethod?: string; tax?: number;
    items?: Array<{ name: string; qty?: number; unitPrice?: number; lineTotal?: number }>;
    html: string; title: string;
  }) => void;
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
   * Pro-gating. When `hasPro` is false, premium chips/toggles (Receipt, Burst,
   * Batch) show a lock and, when tapped, present a clear upsell overlay with a
   * Subscribe CTA that calls `onRequestUpgrade`. Defaults to `true`.
   */
  hasPro?: boolean;
  onRequestUpgrade?: () => void;
}


const MODES: Array<{ id: ScannerMode; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'note', label: 'Scan Note', icon: ScanLine },
  { id: 'receipt', label: 'Receipt', icon: Receipt },
  { id: 'image', label: 'Image', icon: ImagePlus },
  { id: 'gallery', label: 'Gallery', icon: ImageIcon },
];

const BARCODE_FORMATS = [
  BarcodeFormat.QR_CODE,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.CODE_93,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.ITF,
  BarcodeFormat.PDF_417,
  BarcodeFormat.AZTEC,
  BarcodeFormat.DATA_MATRIX,
];

const createZxingReader = () => {
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, BARCODE_FORMATS);
  hints.set(DecodeHintType.TRY_HARDER, true);
  return new BrowserMultiFormatReader(hints, {
    delayBetweenScanAttempts: 180,
    delayBetweenScanSuccess: 500,
  });
};

export const CameraScannerScreen = ({
  isOpen,
  onClose,
  onCapture,
  onObjectCount,
  onConfirmObjectCount,
  onReceipt,
  onConfirmReceipt,
  onBatchNote,
  onBarcode,
  title = 'Scan',
  initialMode = 'note',
  status = null,
  hasPro = true,
  onRequestUpgrade,
}: Props) => {
  // Pro-gate upsell overlay state.
  const [upsell, setUpsell] = useState<null | { feature: 'receipt' | 'burst' | 'batch' }>(null);
  const requirePro = useCallback((feature: 'receipt' | 'burst' | 'batch') => {
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
  // Receipt review state.
  const [receiptReviewFrame, setReceiptReviewFrame] = useState<string | null>(null);
  const [receiptReviewLoading, setReceiptReviewLoading] = useState(false);
  const [receiptReviewResult, setReceiptReviewResult] = useState<any>(null);
  const [receiptReviewError, setReceiptReviewError] = useState<string | null>(null);
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
      setReceiptReviewFrame(null);
      setReceiptReviewResult(null);
      setReceiptReviewLoading(false);
      setReceiptReviewError(null);
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
    // Pause camera stream while reviewing an object-count or receipt result.
    if (objReviewFrame || receiptReviewFrame) return;
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
  }, [isOpen, stopStream, objReviewFrame, receiptReviewFrame]);

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
        mode === 'receipt' ? 'Receipt' :
        mode === 'image'   ? 'Image'   : 'Scan Note';
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


      if (mode === 'receipt' && onReceipt) {
        setReceiptReviewFrame(compressed);
        setReceiptReviewResult(null);
        setReceiptReviewError(null);
        setReceiptReviewLoading(true);
        try {
          const result = await onReceipt(compressed);
          setReceiptReviewResult(result);
        } catch (err: any) {
          setReceiptReviewError(err?.message || 'Could not read receipt');
        } finally {
          setReceiptReviewLoading(false);
        }
        return;
      }

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
  }, [batchOn, burstOn, capturing, mode, onBarcode, onBatchNote, onCapture, onClose, onObjectCount, onReceipt, ready]);

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
      requirePro('receipt');
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
      {!objReviewFrame && !receiptReviewFrame && (
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
      {/* Receipt review overlay */}
      {receiptReviewFrame && (
        <ReceiptReviewOverlay
          frame={receiptReviewFrame}
          result={receiptReviewResult}
          loading={receiptReviewLoading}
          error={receiptReviewError}
          onRetake={() => {
            setReceiptReviewFrame(null);
            setReceiptReviewResult(null);
            setReceiptReviewError(null);
          }}
          onConfirm={(edited) => {
            if (!edited || !receiptReviewFrame) return;
            onConfirmReceipt?.(receiptReviewFrame, edited);
            onClose();
          }}
        />
      )}
      {/* Vignette / darken outside the frame */}
      {!objReviewFrame && !receiptReviewFrame && (
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
      {batchOn && batchPages.length > 0 && !objReviewFrame && !receiptReviewFrame && (
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
      {!objReviewFrame && !receiptReviewFrame && (
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
            const locked = !hasPro && id === 'receipt';
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
    ? String((BarcodeFormat as any)[barcodeFormat] || barcodeFormat).toLowerCase()
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
 * Receipt review overlay — shows the frozen frame, parsed fields, and
 * Retake / Confirm actions. Confirm hands off to the parent which creates
 * the expense note.
 */
const ReceiptReviewOverlay = ({
  frame,
  result,
  loading,
  error,
  onRetake,
  onConfirm,
}: {
  frame: string;
  result: any | null;
  loading: boolean;
  error: string | null;
  onRetake: () => void;
  onConfirm: (edited: {
    merchant: string; total: number; currency: string; date: string;
    category?: string; paymentMethod?: string; tax?: number;
    items?: Array<{ name: string; qty?: number; unitPrice?: number; lineTotal?: number; taxable?: boolean }>;
    html: string; title: string;
  }) => void;
}) => {
  type Item = {
    name: string;
    qty?: number;
    unitPrice?: number;
    lineTotal?: number;   // when set, this overrides qty*unitPrice
    taxable?: boolean;    // default true
  };
  const [merchant, setMerchant] = useState('');
  const [total, setTotal] = useState('');
  const [totalTouched, setTotalTouched] = useState(false);
  const [currency, setCurrency] = useState('USD');
  const [date, setDate] = useState('');
  const [category, setCategory] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [tax, setTax] = useState('');
  const [items, setItems] = useState<Item[]>([]);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  // Hydrate from AI result once it arrives.
  useEffect(() => {
    if (!result) return;
    setMerchant(String(result.merchant || ''));
    setTotal(result.total ? String(result.total) : '');
    setCurrency(String(result.currency || 'USD').toUpperCase());
    setDate(String(result.date || ''));
    setCategory(String(result.category || ''));
    setPaymentMethod(String(result.paymentMethod || ''));
    setTax(result.tax ? String(result.tax) : '');
    const seeded = Array.isArray(result.items) ? result.items : [];
    setItems(
      seeded.map((it: any) => ({
        name: String(it?.name || ''),
        qty: it?.qty != null ? Number(it.qty) : 1,
        unitPrice: it?.unitPrice != null ? Number(it.unitPrice) : 0,
        lineTotal: it?.lineTotal != null ? Number(it.lineTotal) : undefined,
        taxable: it?.taxable !== false, // default true
      })),
    );
  }, [result]);

  // Line total: explicit override wins, otherwise qty*unitPrice.
  const lineOf = (it: Item) => {
    if (it.lineTotal != null && Number.isFinite(it.lineTotal)) return Number(it.lineTotal);
    return (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
  };

  // Currency formatter with graceful fallback if the code isn't a valid ISO 4217 value.
  const fmt = useMemo(() => {
    const code = (currency || '').trim().toUpperCase();
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: code || 'USD',
        currencyDisplay: 'narrowSymbol',
      });
    } catch {
      return {
        format: (n: number) => `${code ? code + ' ' : ''}${(Number(n) || 0).toFixed(2)}`,
      } as Intl.NumberFormat;
    }
  }, [currency]);
  const money = (n: number) => fmt.format(Number(n) || 0);

  const subtotal = items.reduce((s, it) => s + lineOf(it), 0);
  const taxableSubtotal = items.filter((it) => it.taxable !== false).reduce((s, it) => s + lineOf(it), 0);
  const taxNum = Number(tax) || 0;
  const computedTotal = subtotal + taxNum;
  const totalNum = totalTouched && total !== '' ? (Number(total) || 0) : computedTotal;
  const taxRate = taxableSubtotal > 0 ? (taxNum / taxableSubtotal) * 100 : 0;
  const totalMismatch =
    totalTouched && total !== '' && Math.abs(totalNum - computedTotal) > 0.01 && subtotal > 0;

  // ---- Validation ----
  const currencyValid = /^[A-Z]{3}$/.test((currency || '').trim());
  const dateValid = !date || /^\d{4}-\d{2}-\d{2}$/.test(date);
  const totalValid = totalNum >= 0 && Number.isFinite(totalNum);
  const taxValid = taxNum >= 0 && Number.isFinite(taxNum);
  const itemsValid = items.every(
    (it) => !((it.qty ?? 0) > 0 || (it.unitPrice ?? 0) > 0 || (it.lineTotal ?? 0) > 0) || (it.name || '').trim().length > 0,
  );
  const merchantValid = merchant.trim().length > 0;
  const errors: string[] = [];
  if (!merchantValid) errors.push('Merchant is required.');
  if (!currencyValid) errors.push('Currency must be a 3-letter code (e.g. USD, EUR, PKR).');
  if (!dateValid) errors.push('Date must be a valid YYYY-MM-DD.');
  if (!totalValid) errors.push('Total must be a non-negative number.');
  if (!taxValid) errors.push('Tax must be a non-negative number.');
  if (!itemsValid) errors.push('Every line with a quantity or price needs a name.');

  const updateItem = (i: number, patch: Partial<Item>) => {
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  };
  const addItem = () =>
    setItems((arr) => [...arr, { name: '', qty: 1, unitPrice: 0, taxable: true }]);
  const removeItem = (i: number) => setItems((arr) => arr.filter((_, idx) => idx !== i));
  const clearLineOverride = (i: number) =>
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, lineTotal: undefined } : it)));

  // Drag reorder
  const reorder = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    setItems((arr) => {
      const next = arr.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };
  const onDragStart = (i: number) => (e: React.DragEvent) => {
    setDragFrom(i);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', String(i)); } catch {}
  };
  const onDragOverItem = (i: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOver !== i) setDragOver(i);
  };
  const onDropItem = (i: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragFrom != null) reorder(dragFrom, i);
    setDragFrom(null);
    setDragOver(null);
  };
  const onDragEnd = () => { setDragFrom(null); setDragOver(null); };

  const escapeHtml = (s: string) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

  const buildHtml = () => {
    const rows = items
      .filter((it) => (it.name || '').trim())
      .map((it) => {
        const qty = Number(it.qty || 0);
        const unit = Number(it.unitPrice || 0);
        const line = lineOf(it);
        const taxMark = it.taxable === false ? ' <span title="Non-taxable" style="opacity:.6">(NT)</span>' : '';
        return `<tr><td>${escapeHtml(it.name || '')}${taxMark}</td><td style="text-align:right">${qty || ''}</td><td style="text-align:right">${unit ? money(unit) : ''}</td><td style="text-align:right"><strong>${money(line)}</strong></td></tr>`;
      })
      .join('');
    const itemsTable = rows
      ? `<table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left">Item</th><th style="text-align:right">Qty</th><th style="text-align:right">Unit</th><th style="text-align:right">Line</th></tr></thead><tbody>${rows}</tbody></table>`
      : '';
    const summary =
      `<p>` +
      `<strong>Subtotal:</strong> ${money(subtotal)}` +
      (taxNum ? ` · <strong>Tax:</strong> ${money(taxNum)}${taxRate ? ` (${taxRate.toFixed(2)}%)` : ''}` : '') +
      ` · <strong>Total:</strong> ${money(totalNum)}` +
      `</p>`;
    return (
      `<h2>${escapeHtml(merchant || 'Receipt')}</h2>` +
      `<p>` +
      (date ? `<strong>Date:</strong> ${escapeHtml(date)}` : '') +
      (category ? `${date ? ' · ' : ''}<strong>Category:</strong> ${escapeHtml(category)}` : '') +
      (paymentMethod ? `${date || category ? ' · ' : ''}<strong>Paid:</strong> ${escapeHtml(paymentMethod)}` : '') +
      `</p>` +
      summary +
      itemsTable
    );
  };

  const handleConfirm = () => {
    if (errors.length) return;
    onConfirm({
      merchant: merchant.trim(),
      total: totalNum,
      currency: currency.trim().toUpperCase(),
      date: date.trim(),
      category: category.trim() || undefined,
      paymentMethod: paymentMethod.trim() || undefined,
      tax: taxNum || undefined,
      items: items.filter((it) => (it.name || '').trim()),
      html: buildHtml(),
      title: merchant.trim() ? `Receipt · ${merchant.trim()}` : 'Receipt',
    });
  };

  const canSave = !loading && !error && errors.length === 0 && (merchantValid || totalNum > 0);

  const fieldCls =
    'w-full h-9 px-2.5 rounded-lg bg-white/10 border border-white/15 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-white/40';
  const invalidCls = 'border-red-400/60 focus:border-red-400';

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-black text-white">
      <div className="relative h-40 overflow-hidden shrink-0">
        <img src={frame} alt="Receipt" className="absolute inset-0 w-full h-full object-cover opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-black/80" />
        {loading && (
          <div className="absolute inset-0 backdrop-blur-sm flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-7 w-7 animate-spin" />
              <div className="text-sm font-medium">Reading receipt…</div>
            </div>
          </div>
        )}
        {!loading && (
          <div className="absolute bottom-3 left-4 right-4 flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            <div className="text-base font-semibold truncate">
              {merchant || 'Receipt'} · {money(totalNum)}
            </div>
          </div>
        )}
      </div>

      <div
        className="flex-1 overflow-y-auto px-4 pt-3 space-y-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 5rem)' }}
      >
        {error ? (
          <div className="rounded-xl bg-red-500/15 border border-red-400/30 p-3 text-sm text-red-200">
            {error}
          </div>
        ) : null}

        <div className="text-[10px] uppercase tracking-wider text-white/50">Edit before saving</div>

        <label className="block">
          <span className="text-[11px] text-white/60">Merchant</span>
          <input
            className={cn(fieldCls, !merchantValid && merchant.length > 0 ? invalidCls : '')}
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            placeholder="Store name"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[11px] text-white/60">Total</span>
            <input
              className={cn(fieldCls, !totalValid ? invalidCls : '')}
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              value={total}
              onFocus={() => setTotalTouched(true)}
              onChange={(e) => { setTotalTouched(true); setTotal(e.target.value); }}
              placeholder={computedTotal ? computedTotal.toFixed(2) : '0.00'}
            />
          </label>
          <label className="block">
            <span className="text-[11px] text-white/60">Currency</span>
            <input
              className={cn(fieldCls, !currencyValid ? invalidCls : '')}
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3))}
              placeholder="USD"
              maxLength={3}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[11px] text-white/60">Date</span>
            <input
              className={cn(fieldCls, !dateValid ? invalidCls : '')}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-[11px] text-white/60">
              Tax {taxRate > 0 ? <span className="text-white/40">· {taxRate.toFixed(2)}%</span> : null}
            </span>
            <input
              className={cn(fieldCls, !taxValid ? invalidCls : '')}
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              value={tax}
              onChange={(e) => setTax(e.target.value)}
              placeholder="0.00"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[11px] text-white/60">Category</span>
            <input className={fieldCls} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Food, Travel…" />
          </label>
          <label className="block">
            <span className="text-[11px] text-white/60">Payment</span>
            <input className={fieldCls} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} placeholder="Card, Cash…" />
          </label>
        </div>

        {/* Live summary */}
        <div className="rounded-xl bg-white/[0.06] border border-white/10 p-3 text-[12px] space-y-1">
          <div className="flex justify-between"><span className="text-white/60">Subtotal</span><span className="tabular-nums">{money(subtotal)}</span></div>
          <div className="flex justify-between">
            <span className="text-white/60">Tax {taxRate > 0 ? `(${taxRate.toFixed(2)}%)` : ''}</span>
            <span className="tabular-nums">{money(taxNum)}</span>
          </div>
          <div className="flex justify-between font-semibold text-white pt-1 border-t border-white/10 mt-1">
            <span>Total</span>
            <span className="tabular-nums">{money(totalNum)}</span>
          </div>
          {totalMismatch && (
            <div className="flex items-start gap-1.5 pt-1.5 text-[11px] text-amber-300">
              <AlertCircle className="h-3.5 w-3.5 mt-[1px] shrink-0" />
              <span>
                Entered total differs from subtotal + tax ({money(computedTotal)}).{' '}
                <button
                  type="button"
                  className="underline decoration-dotted"
                  onClick={() => { setTotal(computedTotal.toFixed(2)); }}
                >
                  Use calculated
                </button>
              </span>
            </div>
          )}
        </div>

        {errors.length > 0 && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-400/30 p-2.5 text-[11px] text-amber-200 space-y-0.5">
            {errors.map((e, i) => (
              <div key={i} className="flex items-start gap-1.5"><AlertCircle className="h-3.5 w-3.5 mt-[1px] shrink-0" /><span>{e}</span></div>
            ))}
          </div>
        )}

        <div className="pt-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] uppercase tracking-wider text-white/60">Items ({items.length}) · drag to reorder</span>
            <button
              type="button"
              onClick={addItem}
              className="h-7 px-2 rounded-md bg-white/10 border border-white/15 text-[11px] font-semibold flex items-center gap-1 active:scale-95"
            >
              <Plus className="h-3 w-3" /> Add
            </button>
          </div>
          <div className="space-y-1.5">
            {items.map((it, i) => {
              const line = lineOf(it);
              const overridden = it.lineTotal != null;
              const nameMissing = ((it.qty ?? 0) > 0 || (it.unitPrice ?? 0) > 0 || (it.lineTotal ?? 0) > 0) && !(it.name || '').trim();
              const isDropTarget = dragOver === i && dragFrom != null && dragFrom !== i;
              return (
                <div
                  key={i}
                  draggable
                  onDragStart={onDragStart(i)}
                  onDragOver={onDragOverItem(i)}
                  onDrop={onDropItem(i)}
                  onDragEnd={onDragEnd}
                  className={cn(
                    'rounded-xl bg-white/5 border border-white/10 p-2 space-y-1.5 transition',
                    dragFrom === i && 'opacity-50',
                    isDropTarget && 'border-primary/70 ring-1 ring-primary/60',
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-7 h-9 flex items-center justify-center text-white/40 cursor-grab active:cursor-grabbing touch-none"
                      title="Drag to reorder"
                    >
                      <GripVertical className="h-4 w-4" />
                    </span>
                    <input
                      className={cn(fieldCls, 'flex-1', nameMissing && invalidCls)}
                      value={it.name || ''}
                      onChange={(e) => updateItem(i, { name: e.target.value })}
                      placeholder="Item name"
                    />
                    <button
                      type="button"
                      onClick={() => updateItem(i, { taxable: it.taxable === false })}
                      className={cn(
                        'h-9 px-2 rounded-md border text-[10px] font-bold uppercase tracking-wide active:scale-95',
                        it.taxable === false
                          ? 'bg-white/5 border-white/15 text-white/50'
                          : 'bg-primary/20 border-primary/40 text-primary',
                      )}
                      title={it.taxable === false ? 'Non-taxable — tap to mark taxable' : 'Taxable — tap to mark non-taxable'}
                    >
                      Tax
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(i)}
                      className="w-8 h-9 rounded-md bg-white/10 border border-white/15 flex items-center justify-center active:scale-95"
                      aria-label="Remove item"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-[1fr_1fr_1.1fr] gap-1.5">
                    <input
                      className={fieldCls}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      value={it.qty ?? ''}
                      onChange={(e) => updateItem(i, { qty: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })}
                      placeholder="Qty"
                    />
                    <input
                      className={fieldCls}
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min={0}
                      value={it.unitPrice ?? ''}
                      onChange={(e) => updateItem(i, { unitPrice: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })}
                      placeholder="Unit"
                    />
                    <div className="relative">
                      <input
                        className={cn(fieldCls, 'pr-7 text-right font-semibold', overridden && 'border-primary/50 text-primary')}
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min={0}
                        value={overridden ? String(it.lineTotal) : line.toFixed(2)}
                        onChange={(e) =>
                          updateItem(i, { lineTotal: e.target.value === '' ? undefined : Math.max(0, Number(e.target.value) || 0) })
                        }
                        title={overridden ? 'Line total override (tap ↻ to recompute from qty × unit)' : 'Auto-calculated · edit to override'}
                      />
                      {overridden && (
                        <button
                          type="button"
                          onClick={() => clearLineOverride(i)}
                          className="absolute inset-y-0 right-1 my-auto h-6 w-6 rounded-md text-white/60 hover:text-white flex items-center justify-center"
                          title="Reset to qty × unit"
                        >
                          <RotateCcw className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {items.length === 0 && (
              <div className="text-[11px] text-white/40 italic py-2 text-center">
                No line items yet — tap Add to include one.
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className="absolute inset-x-0 bottom-0 px-4 pt-3 bg-gradient-to-t from-black via-black/90 to-transparent"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
      >
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
            onClick={handleConfirm}
            disabled={!canSave}
            className="flex-[1.4] h-12 rounded-2xl bg-white text-black text-sm font-semibold active:scale-[0.98] transition disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <Check className="h-4 w-4" />
            Save expense note
          </button>
        </div>
      </div>
    </div>
  );
};


/**
 * Pro upsell overlay — shown when a non-Pro user taps a Pro-gated toggle
 * (Receipt, Burst, Batch) inside the scanner. Explains the benefit and
 * fires `onSubscribe` for the parent to route into the paywall.
 */
const ProUpsellOverlay = ({
  feature,
  onClose,
  onSubscribe,
}: {
  feature: 'receipt' | 'burst' | 'batch';
  onClose: () => void;
  onSubscribe: () => void;
}) => {
  const copy = {
    receipt: {
      title: 'Receipt scanning is a Pro feature',
      body: 'Automatically parse merchant, total, date, tax, and every line item into a formatted expense note — no typing.',
    },
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
          <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5" /> Full camera scanner suite (Note, Barcode, Objects)</li>
          <li className="flex items-start gap-2"><Check className="h-4 w-4 text-primary mt-0.5" /> Receipt, Burst, and Multi-page batch capture</li>
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


