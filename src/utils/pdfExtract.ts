/**
 * Lightweight PDF → text extraction backed by pdfjs-dist.
 *
 * Used by the Web Clipper when a user shares a PDF: we fetch the file,
 * pull the first N pages of readable text, and embed it into the saved
 * note so the clip is searchable even if the original URL goes away.
 *
 * Kept dynamic-import only — pdfjs is ~400KB and we don't want it in the
 * main bundle unless the user actually shares a PDF.
 */

export interface PdfExtractResult {
  text: string;
  pageCount: number;
  truncated: boolean;
}

export interface PdfExtractOptions {
  /** Cap on pages we walk. Default 10. */
  maxPages?: number;
  /** Cap on characters in the returned text. Default 20000. */
  maxChars?: number;
  /** Abort fetch/decoding after this many ms. Default 15000. */
  timeoutMs?: number;
  /** External abort signal — lets the caller cancel mid-flight. */
  signal?: AbortSignal;
  /**
   * Progress callback. `stage` is one of:
   *  - 'download'  : 0..1 download ratio (or undefined if unknown)
   *  - 'parse'     : 0..1 ratio of pages parsed
   *  - 'done'      : extraction complete
   */
  onProgress?: (stage: 'download' | 'parse' | 'done', ratio?: number) => void;
}

const DEFAULTS: Required<Omit<PdfExtractOptions, 'onProgress' | 'signal'>> = {
  maxPages: 10,
  maxChars: 20000,
  timeoutMs: 15000,
};

/** Fetch a PDF from a URL and return its plain-text content. */
export async function extractPdfTextFromUrl(
  url: string,
  options: PdfExtractOptions = {},
): Promise<PdfExtractResult> {
  const opts = { ...DEFAULTS, ...options };
  const onProgress = options.onProgress;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  // Bridge external signal -> internal controller so callers can cancel.
  const external = options.signal;
  const onExternalAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', onExternalAbort, { once: true });
  }
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`PDF fetch failed: ${res.status}`);
    const total = Number(res.headers.get('content-length') || 0);
    let buf: ArrayBuffer;
    if (res.body && total > 0 && onProgress) {
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let received = 0;
      onProgress('download', 0);
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          received += value.length;
          onProgress('download', Math.min(1, received / total));
        }
      }
      const merged = new Uint8Array(received);
      let off = 0;
      for (const c of chunks) { merged.set(c, off); off += c.length; }
      buf = merged.buffer;
    } else {
      buf = await res.arrayBuffer();
      onProgress?.('download', 1);
    }
    return await extractPdfTextFromBuffer(buf, { ...options, onProgress, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    if (external) external.removeEventListener('abort', onExternalAbort);
  }
}

/** Extract text from an in-memory PDF buffer. */
export async function extractPdfTextFromBuffer(
  data: ArrayBuffer | Uint8Array,
  options: PdfExtractOptions = {},
): Promise<PdfExtractResult> {
  const opts = { ...DEFAULTS, ...options };

  // Dynamic import — keeps pdfjs out of the main chunk.
  const pdfjs: any = await import('pdfjs-dist');
  // Worker setup: pdfjs needs a worker URL. The Vite-friendly ?url import
  // lives at 'pdfjs-dist/build/pdf.worker.min.mjs'.
  try {
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    }
  } catch {
    /* fall back to fake worker if worker import fails */
  }

  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const loadingTask = pdfjs.getDocument({ data: bytes, disableFontFace: true, isEvalSupported: false });
  const doc = await loadingTask.promise;

  const pageCount: number = doc.numPages;
  const pagesToRead = Math.min(pageCount, opts.maxPages);
  const chunks: string[] = [];
  let total = 0;
  let truncated = pageCount > pagesToRead;

  const onProgress = options.onProgress;
  onProgress?.('parse', 0);
  for (let i = 1; i <= pagesToRead; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    const pageText = (tc.items as Array<{ str?: string }>)
      .map((it) => it.str || '')
      .join(' ')
      .replace(/\s+\n/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
    if (pageText) {
      chunks.push(pageText);
      total += pageText.length + 2;
      if (total >= opts.maxChars) {
        truncated = true;
        onProgress?.('parse', 1);
        break;
      }
    }
    page.cleanup?.();
    onProgress?.('parse', i / pagesToRead);
  }
  doc.cleanup?.();
  doc.destroy?.();

  let text = chunks.join('\n\n');
  if (text.length > opts.maxChars) {
    text = text.slice(0, opts.maxChars).trimEnd();
    truncated = true;
  }
  onProgress?.('done', 1);

  return { text, pageCount, truncated };
}
