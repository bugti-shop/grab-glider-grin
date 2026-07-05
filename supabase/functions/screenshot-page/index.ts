// Edge function: capture a full-page screenshot of a URL and return it as an
// offline-friendly base64 data URL, so the resulting Web Clip note embeds the
// image bytes directly (no external image host, works offline).
//
// Backend: microlink.io — free anonymous tier is used by default (50 req/day
// per anonymous IP). Set MICROLINK_API_KEY in the project's edge secrets to
// lift the anonymous rate limit; when present it is forwarded as `x-api-key`.
//
// Public — no JWT required (the parent web clipper flow validates the user).

// deno-lint-ignore-file no-explicit-any

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_IMAGE_BYTES = 6 * 1024 * 1024; // 6 MB hard cap — keeps note payload sane
const FETCH_TIMEOUT_MS = 45_000;

function validateUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    // Block obvious local/loopback/link-local hosts to prevent SSRF from a
    // free public function into the sandbox network.
    const host = u.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host === "0.0.0.0" ||
      host.endsWith(".local") ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return null;
    }
    return u.toString();
  } catch {
    return null;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  // Chunked conversion so we never blow the call stack on large PNGs.
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

async function captureScreenshot(
  targetUrl: string,
  signal: AbortSignal,
): Promise<{ bytes: Uint8Array; mime: string }> {
  const apiKey = Deno.env.get("MICROLINK_API_KEY") || "";
  const params = new URLSearchParams({
    url: targetUrl,
    screenshot: "true",
    fullPage: "true",
    meta: "false",
    embed: "screenshot.url",
    // Force PNG for lossless offline image; microlink defaults to png anyway.
    type: "png",
    // A reasonable default viewport; fullPage=true still captures the whole doc.
    "viewport.width": "1280",
    "viewport.height": "800",
  });
  const endpoint = `https://api.microlink.io/?${params.toString()}`;

  const res = await fetch(endpoint, {
    method: "GET",
    signal,
    headers: apiKey ? { "x-api-key": apiKey } : {},
    redirect: "follow",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Screenshot service returned HTTP ${res.status}: ${body.slice(0, 300)}`,
    );
  }

  const mime = res.headers.get("content-type") || "image/png";
  if (!mime.startsWith("image/")) {
    // microlink error responses come back as JSON — surface the message.
    const body = await res.text().catch(() => "");
    throw new Error(`Screenshot service did not return an image: ${body.slice(0, 300)}`);
  }

  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_IMAGE_BYTES) {
    throw new Error(
      `Screenshot too large (${(buf.byteLength / (1024 * 1024)).toFixed(1)} MB, max ${(MAX_IMAGE_BYTES / (1024 * 1024)).toFixed(0)} MB).`,
    );
  }
  if (buf.byteLength === 0) {
    throw new Error("Screenshot service returned an empty image.");
  }
  return { bytes: buf, mime };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body", code: "bad_request" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const targetUrl = validateUrl(payload?.url);
  if (!targetUrl) {
    return new Response(
      JSON.stringify({ error: "A valid public http(s) URL is required.", code: "bad_url" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const { bytes, mime } = await captureScreenshot(targetUrl, controller.signal);
    clearTimeout(timeoutId);

    const base64 = bytesToBase64(bytes);
    const dataUrl = `data:${mime};base64,${base64}`;

    return new Response(
      JSON.stringify({
        dataUrl,
        mime,
        byteLength: bytes.byteLength,
        sourceUrl: targetUrl,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    clearTimeout(timeoutId);
    const message = (err as Error)?.message || "Screenshot capture failed";
    const isTimeout = (err as Error)?.name === "AbortError";
    const code = isTimeout
      ? "timeout"
      : /too large/i.test(message)
      ? "too_large"
      : /HTTP 4\d\d/i.test(message)
      ? "upstream_client_error"
      : /HTTP 5\d\d/i.test(message)
      ? "upstream_server_error"
      : "internal";
    console.warn("[screenshot-page] failed", { url: targetUrl, code, message });
    return new Response(
      JSON.stringify({ error: message, code }),
      {
        status: 200, // 200 with error body — matches fetch-article convention
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
