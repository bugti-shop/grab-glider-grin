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
} from 'lucide-react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { captureImageForAI } from '@/utils/imageCaptureForAI';
import { compressImage } from '@/utils/imageCompression';

export type ScannerMode = 'note' | 'barcode' | 'object' | 'image' | 'gallery';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Called with a JPEG data URL when the user captures a frame. */
  onCapture: (dataUrl: string) => void;
  /** Called with a JPEG data URL when Object Counting mode captures a frame. */
  onObjectCount?: (dataUrl: string) => void;
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
}


const MODES: Array<{ id: ScannerMode; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'note', label: 'Scan Note', icon: ScanLine },
  { id: 'barcode', label: 'Barcode', icon: Barcode },
  { id: 'object', label: 'Objects', icon: Boxes },
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
  onBarcode,
  title = 'Scan',
  initialMode = 'note',
  status = null,
}: Props) => {
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

  useEffect(() => {
    if (isOpen) setMode(initialMode);
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
          // Autoplay on iOS WebView requires inline + muted.
          videoRef.current.muted = true;
          (videoRef.current as any).playsInline = true;
          await videoRef.current.play().catch(() => { /* ignore autoplay errors */ });
        }
        // Detect torch support.
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
  }, [isOpen, stopStream]);

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

  // Continuous barcode scanning loop when mode === 'barcode' + camera ready.
  useEffect(() => {
    if (!isOpen || mode !== 'barcode' || !ready) return;
    const AnyBarcodeDetector = (window as any).BarcodeDetector;
    let nativeDetector: any = null;
    let detector: any;
    if (AnyBarcodeDetector) {
      try {
        nativeDetector = new AnyBarcodeDetector({
          formats: [
            'qr_code', 'ean_13', 'ean_8', 'code_128', 'code_39', 'code_93',
            'upc_a', 'upc_e', 'itf', 'pdf417', 'aztec', 'data_matrix',
          ],
        });
      } catch (e) {
        console.warn('[CameraScannerScreen] BarcodeDetector init failed', e);
      }
    }
    if (!zxingReaderRef.current) zxingReaderRef.current = createZxingReader();
    detector = nativeDetector || zxingReaderRef.current;
    setBarcodeSupported(Boolean(detector));
    if (!detector) return;

    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2 && !barcodeHandledRef.current) {
        try {
          let decoded: { rawValue: string; format: string } | null = null;
          if (nativeDetector) {
            const results = await nativeDetector.detect(video);
            if (results && results.length > 0) {
              decoded = {
                rawValue: String(results[0].rawValue ?? '').trim(),
                format: String(results[0].format ?? 'unknown'),
              };
            }
          }
          if (!decoded) {
            decoded = await decodeBarcodeWithZxing(video, zxingReaderRef.current).catch(() => null);
          }
          if (decoded && decoded.rawValue && !barcodeHandledRef.current) {
            barcodeHandledRef.current = true;
            const value = decoded.rawValue.trim();
            const format = decoded.format || 'unknown';
            setLastBarcode(value);
            try { navigator.vibrate?.(80); } catch { /* ignore */ }
            if (value && onBarcode) {
              onBarcode(value, format);
              onClose();
              return;
            }
          }
        } catch (e) {
          // Detection errors are transient — keep looping.
        }
      }
      barcodeLoopRef.current = window.setTimeout(tick, nativeDetector ? 300 : 550) as unknown as number;
    };
    tick();
    return () => {
      cancelled = true;
      if (barcodeLoopRef.current) {
        clearTimeout(barcodeLoopRef.current);
        barcodeLoopRef.current = null;
      }
    };
  }, [isOpen, mode, ready, onBarcode, onClose]);



  const handleShutter = useCallback(async () => {
    if (capturing) return;
    setCapturing(true);
    try {
      // Only the Gallery action opens the OS picker. Shutter should never
      // unexpectedly launch Gallery just because the camera is still warming up.
      if (mode === 'gallery') {
        const dataUrl = await captureImageForAI('gallery');
        if (dataUrl) {
          onCapture(dataUrl);
          onClose();
        }
        return;
      }
      if (!ready) {
        toast.error('Camera not ready yet');
        return;
      }

      const video = videoRef.current;
      if (!video || video.videoWidth === 0) {
        toast.error('Camera not ready yet');
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        toast.error('Could not capture frame');
        return;
      }
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const raw = canvas.toDataURL('image/jpeg', 0.92);
      const compressed = await compressImage(raw, {
        maxWidth: 1400,
        maxHeight: 1400,
        quality: 0.82,
        mimeType: 'image/jpeg',
      }).catch(() => raw);

      if (mode === 'barcode') {
        // If native decoder is available, try one more sync decode on this frame.
        const decoded = await decodeBarcodeFromCanvas(canvas).catch(() => null);
        if (decoded && onBarcode) {
          setLastBarcode(decoded.rawValue);
          onBarcode(decoded.rawValue, decoded.format);
          onClose();
          return;
        }
        toast.error('No barcode detected. Hold it inside the frame and try again.');
        return;
      }
      if (mode === 'object' && onObjectCount) {
        onObjectCount(compressed);
        onClose();
        return;
      }
      onCapture(compressed);
      onClose();

    } catch (e) {
      console.error('[CameraScannerScreen] shutter error', e);
      toast.error('Could not capture image');
    } finally {
      setCapturing(false);
    }
  }, [capturing, mode, onCapture, onClose, onObjectCount, ready]);

  const openGallery = useCallback(async () => {
    setCapturing(true);
    try {
      const dataUrl = await captureImageForAI('gallery');
      if (dataUrl) {
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

  if (!isOpen) return null;

  const overlay = (
    <div className="fixed inset-0 z-[300] bg-black text-white flex flex-col select-none">
      {/* Live camera feed (or fallback background) */}
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
      {/* Vignette / darken outside the frame */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/70 pointer-events-none" />

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
            ) : mode === 'barcode' && !barcodeSupported ? (
              <span className="text-white/90">
                Barcode scanning not supported here — tap shutter to try one frame
              </span>
            ) : mode === 'barcode' ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Scanning for barcode…
                {lastBarcode ? ` · ${lastBarcode.slice(0, 24)}` : ''}
              </span>
            ) : mode === 'object' ? (
              <span>Frame the objects clearly · tap capture to count</span>
            ) : (
              <span>Point at a sticky note or handwritten page · {activeModeLabel}</span>
            )}
          </div>

        </div>
      </div>

      {/* Bottom frosted control bar */}
      <div
        className="relative z-10 px-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
      >
        {/* Mode chips */}
        <div
          className="flex items-center justify-start gap-2 pb-3 overflow-x-auto overscroll-x-contain touch-pan-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {MODES.map(({ id, label, icon: Icon }) => {
            const active = mode === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setMode(id);
                  if (id === 'gallery') openGallery();
                }}
                className={cn(
                  'flex-shrink-0 h-11 px-4 rounded-2xl border flex items-center gap-2 text-xs font-semibold backdrop-blur-xl transition active:scale-95',
                  active
                    ? 'bg-white text-black border-white shadow-[0_8px_30px_rgba(255,255,255,0.25)]'
                    : 'bg-white/10 text-white border-white/15',
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            );
          })}
        </div>

        {/* Shutter row */}
        <div className="flex items-center justify-between px-2">
          <button
            type="button"
            onClick={openGallery}
            className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/15 flex items-center justify-center active:scale-95 transition"
            aria-label="Pick from gallery"
          >
            <ImageIcon className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={handleShutter}
            disabled={capturing}
            className="relative w-[76px] h-[76px] rounded-full flex items-center justify-center active:scale-95 transition"
            aria-label="Capture"
          >
            <span className="absolute inset-0 rounded-full border-2 border-white/70" />
            <span
              className={cn(
                'w-[60px] h-[60px] rounded-full bg-white transition',
                capturing && 'scale-90 opacity-80',
              )}
            />
            {capturing && (
              <Loader2 className="absolute h-6 w-6 text-black animate-spin" />
            )}
          </button>

          <div className="w-12 h-12 opacity-0 pointer-events-none" aria-hidden />
        </div>
      </div>

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

export default CameraScannerScreen;

