/**
 * Gzip-compress arbitrary HTML into a compact base64 string using the
 * browser-native CompressionStream API. Falls back to a `raw:`-prefixed
 * base64 payload on runtimes without CompressionStream so callers always
 * get something round-trippable.
 *
 * Typical compression ratio for HTML: 4–8x. A 20 MB page usually squashes
 * to ~2–4 MB before base64, ~3–5 MB after.
 */

function u8ToBase64(bytes: Uint8Array): string {
  // Chunked to avoid `apply` argument-length blowups on multi-MB payloads.
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + CHUNK)),
    );
  }
  return btoa(binary);
}

function base64ToU8(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function streamThrough(
  bytes: Uint8Array,
  transform: ReadableWritablePair<Uint8Array, Uint8Array>,
): Promise<Uint8Array> {
  const stream = new Blob([bytes as unknown as BlobPart]).stream().pipeThrough(transform as any);
  const buf = await new Response(stream as any).arrayBuffer();
  return new Uint8Array(buf);
}

/** Compress an HTML string to gzip+base64. */
export async function compressHtml(html: string): Promise<{ gz: string; bytes: number }> {
  const raw = new TextEncoder().encode(html || '');
  const bytes = raw.byteLength;
  const CS: any = (globalThis as any).CompressionStream;
  if (typeof CS === 'function') {
    try {
      const compressed = await streamThrough(raw, new CS('gzip'));
      return { gz: u8ToBase64(compressed), bytes };
    } catch {
      /* fall through to raw */
    }
  }
  return { gz: 'raw:' + u8ToBase64(raw), bytes };
}

/** Decompress a payload produced by {@link compressHtml}. */
export async function decompressHtml(gz: string): Promise<string> {
  if (!gz) return '';
  if (gz.startsWith('raw:')) {
    return new TextDecoder().decode(base64ToU8(gz.slice(4)));
  }
  const bytes = base64ToU8(gz);
  const DS: any = (globalThis as any).DecompressionStream;
  if (typeof DS !== 'function') {
    throw new Error('Browser lacks DecompressionStream — cannot expand snapshot');
  }
  const inflated = await streamThrough(bytes, new DS('gzip'));
  return new TextDecoder().decode(inflated);
}

export function formatBytesShort(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
