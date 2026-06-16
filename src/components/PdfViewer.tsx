import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RotateCw,
  LayoutGrid,
  Printer,
  Download,
  Rows3,
  FileText,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';

interface PdfViewerProps {
  src: string; // data url, blob url, or http url
  className?: string;
  fileName?: string;
}

/**
 * In-app PDF viewer with persistent toolbar, page-jump input, thumbnail strip,
 * zoom, rotate, fullscreen, continuous scrolling, print and export
 * (whole-PDF / current-page PDF / current-page PNG). Renders pages via
 * pdfjs-dist so it works on mobile WebViews where iframes can't show data: PDFs.
 */
export const PdfViewer = ({ src, className, fileName }: PdfViewerProps) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const singleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const continuousContainerRef = useRef<HTMLDivElement | null>(null);
  const thumbStripRef = useRef<HTMLDivElement | null>(null);
  const pdfDocRef = useRef<any>(null);
  const renderTaskRef = useRef<any>(null);
  const pdfBufferRef = useRef<ArrayBuffer | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showThumbs, setShowThumbs] = useState(false);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [pageInput, setPageInput] = useState('1');
  const [continuous, setContinuous] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const safeFileName = (fileName || 'document.pdf').replace(/[^\w.\-]+/g, '_') || 'document.pdf';
  const baseName = safeFileName.replace(/\.pdf$/i, '');

  // Load the PDF document
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      setPage(1);
      setPageInput('1');
      setZoom(1);
      setRotation(0);
      setThumbs([]);

      try {
        const pdfjsLib: any = await import('pdfjs-dist/build/pdf.mjs');
        try {
          const workerUrl = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default;
          pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
        } catch {
          pdfjsLib.GlobalWorkerOptions.workerSrc = '';
        }

        const res = await fetch(src);
        const buf = await res.arrayBuffer();
        if (cancelled) return;
        pdfBufferRef.current = buf;

        const loadingTask = pdfjsLib.getDocument({ data: buf.slice(0) });
        const pdfDoc = await loadingTask.promise;
        if (cancelled) {
          try { pdfDoc.destroy?.(); } catch {}
          return;
        }
        pdfDocRef.current = pdfDoc;
        setNumPages(pdfDoc.numPages);
        setLoading(false);
      } catch (e: any) {
        console.error('PdfViewer load error', e);
        if (!cancelled) {
          setError(e?.message || 'Failed to load PDF');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      try { renderTaskRef.current?.cancel?.(); } catch {}
      try { pdfDocRef.current?.destroy?.(); } catch {}
      pdfDocRef.current = null;
      pdfBufferRef.current = null;
    };
  }, [src]);

  // Render current page (single mode only)
  useEffect(() => {
    if (continuous) return;
    const pdfDoc = pdfDocRef.current;
    const canvas = singleCanvasRef.current;
    const wrapper = wrapperRef.current;
    if (!pdfDoc || !canvas || !wrapper || numPages === 0) return;

    let cancelled = false;
    (async () => {
      try {
        try { renderTaskRef.current?.cancel?.(); } catch {}
        const pdfPage = await pdfDoc.getPage(page);
        if (cancelled) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const baseViewport = pdfPage.getViewport({ scale: 1, rotation });
        const containerWidth = Math.max(wrapper.clientWidth - 16, 200);
        const fitScale = containerWidth / baseViewport.width;
        const viewport = pdfPage.getViewport({ scale: fitScale * zoom * dpr, rotation });

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width / dpr}px`;
        canvas.style.height = `${viewport.height / dpr}px`;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const task = pdfPage.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;
      } catch (e: any) {
        if (e?.name !== 'RenderingCancelledException') console.error('PdfViewer render error', e);
      }
    })();

    return () => { cancelled = true; };
  }, [page, zoom, rotation, numPages, continuous]);

  // Render all pages (continuous mode)
  useEffect(() => {
    if (!continuous) return;
    const pdfDoc = pdfDocRef.current;
    const container = continuousContainerRef.current;
    const wrapper = wrapperRef.current;
    if (!pdfDoc || !container || !wrapper || numPages === 0) return;

    let cancelled = false;
    (async () => {
      container.innerHTML = '';
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const containerWidth = Math.max(wrapper.clientWidth - 16, 200);

      const pageCanvases: HTMLCanvasElement[] = [];
      for (let i = 1; i <= numPages; i++) {
        const c = document.createElement('canvas');
        c.dataset.pageNum = String(i);
        c.style.background = 'white';
        c.style.borderRadius = '4px';
        c.style.boxShadow = '0 2px 12px rgba(0,0,0,0.4)';
        c.style.marginBottom = '12px';
        c.style.display = 'block';
        container.appendChild(c);
        pageCanvases.push(c);
      }

      for (let i = 1; i <= numPages; i++) {
        if (cancelled) return;
        try {
          const pdfPage = await pdfDoc.getPage(i);
          if (cancelled) return;
          const baseViewport = pdfPage.getViewport({ scale: 1, rotation });
          const fitScale = containerWidth / baseViewport.width;
          const viewport = pdfPage.getViewport({ scale: fitScale * zoom * dpr, rotation });
          const c = pageCanvases[i - 1];
          c.width = viewport.width;
          c.height = viewport.height;
          c.style.width = `${viewport.width / dpr}px`;
          c.style.height = `${viewport.height / dpr}px`;
          const ctx = c.getContext('2d');
          if (!ctx) continue;
          await pdfPage.render({ canvasContext: ctx, viewport }).promise;
        } catch (e: any) {
          if (e?.name !== 'RenderingCancelledException') console.warn('continuous render fail', i, e);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [continuous, numPages, zoom, rotation]);

  // Track current page in continuous mode via scroll
  useEffect(() => {
    if (!continuous) return;
    const container = continuousContainerRef.current?.parentElement;
    if (!container) return;
    const handler = () => {
      const canvases = continuousContainerRef.current?.querySelectorAll<HTMLCanvasElement>('canvas[data-page-num]');
      if (!canvases || canvases.length === 0) return;
      const containerRect = container.getBoundingClientRect();
      const mid = containerRect.top + containerRect.height / 2;
      let best = 1;
      let bestDist = Infinity;
      canvases.forEach((c) => {
        const r = c.getBoundingClientRect();
        const center = r.top + r.height / 2;
        const dist = Math.abs(center - mid);
        if (dist < bestDist) {
          bestDist = dist;
          best = Number(c.dataset.pageNum) || 1;
        }
      });
      setPage(best);
    };
    container.addEventListener('scroll', handler, { passive: true });
    return () => container.removeEventListener('scroll', handler);
  }, [continuous]);

  // In continuous mode, scroll to selected page when user uses controls
  const scrollToPage = useCallback((n: number) => {
    const el = continuousContainerRef.current?.querySelector<HTMLCanvasElement>(`canvas[data-page-num="${n}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Generate thumbnails when strip first opens
  useEffect(() => {
    if (!showThumbs) return;
    const pdfDoc = pdfDocRef.current;
    if (!pdfDoc || numPages === 0 || thumbs.length === numPages) return;

    let cancelled = false;
    (async () => {
      const results: string[] = new Array(numPages).fill('');
      const THUMB_W = 96;
      for (let i = 1; i <= numPages; i++) {
        if (cancelled) return;
        try {
          const p = await pdfDoc.getPage(i);
          const vp = p.getViewport({ scale: 1 });
          const scale = THUMB_W / vp.width;
          const viewport = p.getViewport({ scale });
          const c = document.createElement('canvas');
          c.width = Math.ceil(viewport.width);
          c.height = Math.ceil(viewport.height);
          const ctx = c.getContext('2d');
          if (!ctx) continue;
          await p.render({ canvasContext: ctx, viewport }).promise;
          results[i - 1] = c.toDataURL('image/jpeg', 0.6);
          if (!cancelled && (i % 4 === 0 || i === numPages)) setThumbs([...results]);
        } catch (e) {
          console.warn('thumb render failed', i, e);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [showThumbs, numPages, thumbs.length]);

  // Sync page input + scroll active thumb into view
  useEffect(() => {
    setPageInput(String(page));
    if (showThumbs && thumbStripRef.current) {
      const el = thumbStripRef.current.querySelector<HTMLElement>(`[data-thumb-page="${page}"]`);
      el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [page, showThumbs]);

  // Fullscreen handling
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => setIsFullscreen((v) => !v));
    } else {
      document.exitFullscreen?.();
    }
  }, []);

  const goPrev = () => {
    const next = Math.max(1, page - 1);
    setPage(next);
    if (continuous) scrollToPage(next);
  };
  const goNext = () => {
    const next = Math.min(numPages, page + 1);
    setPage(next);
    if (continuous) scrollToPage(next);
  };
  const zoomIn = () => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)));
  const zoomOut = () => setZoom((z) => Math.max(0.5, +(z - 0.25).toFixed(2)));
  const resetZoom = () => setZoom(1);
  const rotate = () => setRotation((r) => (r + 90) % 360);

  const commitPageInput = () => {
    const n = parseInt(pageInput, 10);
    if (!Number.isFinite(n)) { setPageInput(String(page)); return; }
    const clamped = Math.min(Math.max(1, n), numPages || 1);
    setPage(clamped);
    setPageInput(String(clamped));
    if (continuous) scrollToPage(clamped);
  };

  // ---------------- Export / Print helpers ----------------

  const triggerDownload = async (blob: Blob, name: string) => {
    // Native share where available (mobile), otherwise standard download
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      const dataUrl: string = await new Promise((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.readAsDataURL(blob);
      });
      const base64 = dataUrl.split(',')[1];
      const result = await Filesystem.writeFile({
        path: name,
        data: base64,
        directory: Directory.Cache,
      });
      await Share.share({ title: name, url: result.uri });
      return;
    } catch {/* fall through */}
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const downloadFullPdf = async () => {
    if (!pdfBufferRef.current) return;
    setBusyAction('download-full');
    try {
      const blob = new Blob([pdfBufferRef.current.slice(0)], { type: 'application/pdf' });
      await triggerDownload(blob, safeFileName);
      toast.success('PDF downloaded');
    } catch (e: any) {
      toast.error(e?.message || 'Download failed');
    } finally {
      setBusyAction(null);
    }
  };

  const downloadCurrentPagePdf = async () => {
    if (!pdfBufferRef.current || numPages === 0) return;
    setBusyAction('download-page-pdf');
    try {
      const { PDFDocument } = await import('pdf-lib');
      const src = await PDFDocument.load(pdfBufferRef.current.slice(0));
      const out = await PDFDocument.create();
      const [copied] = await out.copyPages(src, [page - 1]);
      out.addPage(copied);
      const bytes = await out.save();
      const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer], { type: 'application/pdf' });
      await triggerDownload(blob, `${baseName}_page_${page}.pdf`);
      toast.success(`Page ${page} exported`);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Page export failed');
    } finally {
      setBusyAction(null);
    }
  };

  const downloadCurrentPagePng = async () => {
    const pdfDoc = pdfDocRef.current;
    if (!pdfDoc) return;
    setBusyAction('download-page-png');
    try {
      const pdfPage = await pdfDoc.getPage(page);
      const viewport = pdfPage.getViewport({ scale: 2, rotation });
      const c = document.createElement('canvas');
      c.width = viewport.width;
      c.height = viewport.height;
      const ctx = c.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      await pdfPage.render({ canvasContext: ctx, viewport }).promise;
      const blob: Blob = await new Promise((resolve, reject) =>
        c.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png')
      );
      await triggerDownload(blob, `${baseName}_page_${page}.png`);
      toast.success(`Page ${page} saved as image`);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Image export failed');
    } finally {
      setBusyAction(null);
    }
  };

  const printPdf = async () => {
    if (!pdfBufferRef.current) return;
    setBusyAction('print');
    try {
      const blob = new Blob([pdfBufferRef.current.slice(0)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.src = url;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (err) {
          console.warn('iframe print failed, opening in new tab', err);
          window.open(url, '_blank');
        }
        setTimeout(() => {
          iframe.remove();
          URL.revokeObjectURL(url);
        }, 60_000);
      };
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Print failed');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div
      ref={wrapperRef}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#1a1a1a',
        ...(isFullscreen ? { position: 'fixed', inset: 0, zIndex: 9999 } : {}),
      }}
    >
      {/* Persistent toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '8px 10px',
          background: 'rgba(0,0,0,0.75)',
          color: 'white',
          flexWrap: 'wrap',
          position: 'sticky',
          top: 0,
          zIndex: 5,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            type="button"
            onClick={goPrev}
            disabled={page <= 1 || loading}
            aria-label="Previous page"
            className="p-1.5 rounded disabled:opacity-40 hover:bg-white/10"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <form
            onSubmit={(e) => { e.preventDefault(); commitPageInput(); }}
            className="flex items-center gap-1"
          >
            <input
              type="number"
              min={1}
              max={numPages || 1}
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={commitPageInput}
              disabled={loading || numPages === 0}
              aria-label="Jump to page"
              className="w-12 text-center text-xs tabular-nums bg-white/10 rounded px-1 py-0.5 outline-none focus:bg-white/20 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <span className="text-xs tabular-nums text-white/70">/ {numPages || '–'}</span>
          </form>
          <button
            type="button"
            onClick={goNext}
            disabled={page >= numPages || loading}
            aria-label="Next page"
            className="p-1.5 rounded disabled:opacity-40 hover:bg-white/10"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            type="button"
            onClick={() => setContinuous((v) => !v)}
            disabled={loading || numPages === 0}
            aria-label="Toggle continuous scroll"
            aria-pressed={continuous}
            title={continuous ? 'Switch to single page' : 'Continuous scrolling'}
            className={`p-1.5 rounded disabled:opacity-40 hover:bg-white/10 ${continuous ? 'bg-white/15' : ''}`}
          >
            <Rows3 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setShowThumbs((v) => !v)}
            disabled={loading || numPages === 0}
            aria-label="Toggle thumbnails"
            aria-pressed={showThumbs}
            className={`p-1.5 rounded disabled:opacity-40 hover:bg-white/10 ${showThumbs ? 'bg-white/15' : ''}`}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={zoomOut}
            disabled={zoom <= 0.5 || loading}
            aria-label="Zoom out"
            className="p-1.5 rounded disabled:opacity-40 hover:bg-white/10"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={resetZoom}
            disabled={loading}
            className="text-xs tabular-nums min-w-[44px] text-center px-1 rounded hover:bg-white/10"
            aria-label="Reset zoom"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            onClick={zoomIn}
            disabled={zoom >= 4 || loading}
            aria-label="Zoom in"
            className="p-1.5 rounded disabled:opacity-40 hover:bg-white/10"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={rotate}
            disabled={loading}
            aria-label="Rotate"
            className="p-1.5 rounded disabled:opacity-40 hover:bg-white/10"
          >
            <RotateCw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={printPdf}
            disabled={loading || !!busyAction}
            aria-label="Print PDF"
            title="Print"
            className="p-1.5 rounded disabled:opacity-40 hover:bg-white/10"
          >
            {busyAction === 'print' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={loading || !!busyAction}
                aria-label="Export options"
                title="Export"
                className="p-1.5 rounded disabled:opacity-40 hover:bg-white/10"
              >
                {busyAction?.startsWith('download') ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-[10001]">
              <DropdownMenuItem onClick={downloadFullPdf} disabled={!!busyAction}>
                <Download className="h-4 w-4 mr-2" />
                Download full PDF
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={downloadCurrentPagePdf} disabled={!!busyAction}>
                <FileText className="h-4 w-4 mr-2" />
                Save page {page} as PDF
              </DropdownMenuItem>
              <DropdownMenuItem onClick={downloadCurrentPagePng} disabled={!!busyAction}>
                <Download className="h-4 w-4 mr-2" />
                Save page {page} as PNG
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            className="p-1.5 rounded hover:bg-white/10"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Thumbnail strip */}
      {showThumbs && numPages > 0 && (
        <div
          ref={thumbStripRef}
          style={{
            display: 'flex',
            gap: 8,
            padding: '8px 10px',
            overflowX: 'auto',
            background: 'rgba(0,0,0,0.55)',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => {
            const t = thumbs[n - 1];
            const active = n === page;
            return (
              <button
                type="button"
                key={n}
                data-thumb-page={n}
                onClick={() => {
                  setPage(n);
                  if (continuous) scrollToPage(n);
                }}
                aria-label={`Go to page ${n}`}
                aria-current={active}
                style={{
                  flex: '0 0 auto',
                  width: 72,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                  padding: 2,
                  borderRadius: 6,
                  background: active ? 'rgba(255,255,255,0.15)' : 'transparent',
                  outline: active ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.1)',
                }}
              >
                <div
                  style={{
                    width: 68,
                    height: 88,
                    background: '#fff',
                    borderRadius: 3,
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {t ? (
                    <img src={t} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                <span className="text-[10px] tabular-nums text-white/80">{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Body */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          WebkitOverflowScrolling: 'touch',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
          padding: 8,
        }}
      >
        {loading && (
          <div className="flex items-center gap-2 text-white py-8">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Loading PDF…</span>
          </div>
        )}
        {error && !loading && (
          <div className="text-center text-sm text-red-300 p-4">{error}</div>
        )}
        {!error && !loading && (
          continuous ? (
            <div ref={continuousContainerRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }} />
          ) : (
            <canvas
              ref={singleCanvasRef}
              style={{
                background: 'white',
                borderRadius: 4,
                boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
              }}
            />
          )
        )}
      </div>
    </div>
  );
};

export default PdfViewer;
