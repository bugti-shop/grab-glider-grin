import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function FetchArticleTest() {
  const [url, setUrl] = useState("https://www.xda-developers.com/lesser-known-pixel-features/");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<Record<string, unknown> | null>(null);
  const [html, setHtml] = useState<string>("");

  const run = async () => {
    setLoading(true);
    setError(null);
    setMeta(null);
    setHtml("");
    const started = performance.now();
    try {
      const { data, error } = await supabase.functions.invoke("fetch-article", {
        body: { url: url.trim(), mode: "fullpage" },
      });
      const ms = Math.round(performance.now() - started);
      if (error) {
        setError(`Transport error (${ms}ms): ${error.message}`);
        return;
      }
      if (!data) {
        setError(`Empty response (${ms}ms)`);
        return;
      }
      if ((data as any).error) {
        setError(`Function error (${ms}ms): ${(data as any).error}`);
        return;
      }
      const raw = String((data as any).rawHtml || "");
      setHtml(raw);
      setMeta({
        ms,
        title: (data as any).title,
        siteName: (data as any).siteName,
        author: (data as any).author,
        publishedTime: (data as any).publishedTime,
        excerptChars: String((data as any).excerpt || "").length,
        htmlChars: raw.length,
        htmlKB: Math.round(raw.length / 1024),
        leadImage: (data as any).leadImage,
        finalUrl: (data as any).finalUrl,
        status: (data as any).status,
        truncated: (data as any).truncated,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const srcdoc = html
    ? html.replace(/&/g, "&amp;").replace(/"/g, "&quot;")
    : "";

  return (
    <div className="min-h-screen bg-background text-foreground p-4 md:p-6 space-y-4">
      <h1 className="text-2xl font-bold">fetch-article tester</h1>
      <p className="text-sm text-muted-foreground">
        Paste any URL, hit Fetch, and inspect the sanitized snapshot returned by the edge function.
      </p>

      <div className="flex flex-col md:flex-row gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/article"
          className="flex-1 border border-border rounded-md px-3 py-2 bg-card text-foreground"
        />
        <button
          onClick={run}
          disabled={loading || !url.trim()}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
        >
          {loading ? "Fetching…" : "Fetch"}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-md border border-destructive text-destructive bg-destructive/10 text-sm whitespace-pre-wrap">
          {error}
        </div>
      )}

      {meta && (
        <pre className="p-3 rounded-md border border-border bg-card text-xs overflow-auto max-h-64">
          {JSON.stringify(meta, null, 2)}
        </pre>
      )}

      {html && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium">Rendered snapshot (sandboxed):</div>
            <button
              onClick={() => {
                const blob = new Blob([html], { type: "text/html;charset=utf-8" });
                const a = document.createElement("a");
                const objUrl = URL.createObjectURL(blob);
                let host = "snapshot";
                try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* ignore */ }
                a.href = objUrl;
                a.download = `${host}-${Date.now()}.html`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
              }}
              className="px-3 py-1.5 rounded-md border border-border bg-card text-sm"
            >
              Download .html
            </button>
          </div>
          <iframe
            title="snapshot"
            sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            referrerPolicy="no-referrer"
            loading="lazy"
            srcDoc={srcdoc}
            style={{
              width: "100%",
              height: "80vh",
              border: "1px solid hsl(var(--border))",
              borderRadius: 12,
              background: "white",
            }}
          />
        </div>
      )}
    </div>
  );
}
