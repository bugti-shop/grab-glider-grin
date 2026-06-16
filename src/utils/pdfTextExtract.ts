/**
 * Extract plain text from a PDF file in the browser using pdfjs-dist.
 * Returns concatenated page text with `\n\n` between pages.
 */
export async function extractTextFromPdfFile(file: File, maxPages = 40): Promise<string> {
  // Lazy-load to keep main bundle small.
  const pdfjsLib: any = await import('pdfjs-dist/build/pdf.mjs');
  // Use the bundled worker (Vite will resolve the URL).
  try {
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default;
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  } catch {
    // Fallback: disable worker (slower but works).
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';
  }

  const buf = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: buf });
  const pdf = await loadingTask.promise;
  const pageCount = Math.min(pdf.numPages, maxPages);
  const pages: string[] = [];
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const strings = (content.items || []).map((it: any) => (typeof it?.str === 'string' ? it.str : ''));
    pages.push(strings.join(' ').replace(/\s+\n/g, '\n').trim());
  }
  try { await pdf.destroy?.(); } catch {}
  return pages.join('\n\n').trim();
}