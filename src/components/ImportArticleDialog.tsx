import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Globe, AlertTriangle, RefreshCw, ExternalLink, XCircle } from 'lucide-react';
import {
  fetchArticleFromUrl,
  ArticleFetchError,
  type FetchedArticle,
} from '@/utils/articleFetch';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export type ImportArticleMode = 'replace' | 'append';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the cleaned article; the editor decides whether to replace or append. */
  onImport: (article: FetchedArticle, mode: ImportArticleMode) => void;
}

interface FailureState {
  title: string;
  message: string;
  hint?: string;
  code: ArticleFetchError['code'] | 'generic';
  /** What the user last tried, so Retry can repeat the exact action. */
  lastMode: ImportArticleMode;
}

/** Human-readable copy for each ArticleFetchError code. Keeps the dialog
 *  honest about why a fetch failed and what the user can do next. */
const FAILURE_COPY: Record<
  ArticleFetchError['code'],
  { title: string; hint: string }
> = {
  invalid_url: {
    title: "That URL doesn't look right",
    hint: 'Paste the full link starting with https://',
  },
  unsupported_protocol: {
    title: 'Unsupported link',
    hint: 'Only http:// and https:// pages can be imported.',
  },
  timeout: {
    title: 'The page took too long to respond',
    hint: 'It may be slow or actively blocking automated requests. Try again, or open the link and paste the text manually.',
  },
  blocked: {
    title: 'The site refused the request',
    hint: "Pages behind a login, paywall, or anti-bot filter can't be imported automatically. Open it in your browser and copy the text.",
  },
  not_found: {
    title: 'Page not found (404)',
    hint: 'Double-check the URL is still live, then retry.',
  },
  rate_limited: {
    title: 'Fetch proxies are rate-limited right now',
    hint: 'Wait a minute and tap Retry. We rotate through several proxies automatically.',
  },
  server_error: {
    title: 'The source site returned a server error',
    hint: 'This is usually temporary — retrying in a few seconds often works.',
  },
  empty_response: {
    title: 'The page returned no readable HTML',
    hint: 'Likely a JavaScript-only single-page app. Try a printer-friendly or AMP version of the link.',
  },
  unreadable: {
    title: "We couldn't find article-like content",
    hint: 'The page loaded but had little text — common on media galleries, paywalls, or app shells.',
  },
  network: {
    title: 'Network error',
    hint: 'Check your connection and tap Retry.',
  },
  unknown: {
    title: "Couldn't fetch this page",
    hint: 'We tried multiple proxies without luck. Tap Retry or try a different link.',
  },
};

export const ImportArticleDialog = ({ open, onOpenChange, onImport }: Props) => {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState<FailureState | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = () => {
    setUrl('');
    setFailure(null);
    setLoading(false);
    abortRef.current?.abort();
    abortRef.current = null;
  };

  const handleFetch = async (mode: ImportArticleMode) => {
    const trimmed = url.trim();
    if (!trimmed) {
      setFailure({
        title: t('importArticle.errEmptyTitle', 'Paste a URL first'),
        message: t('importArticle.errEmpty', 'Please paste an article URL to import.'),
        code: 'invalid_url',
        lastMode: mode,
      });
      return;
    }
    setLoading(true);
    setFailure(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const article = await fetchArticleFromUrl(trimmed, { signal: controller.signal });
      onImport(article, mode);
      toast.success(
        t('importArticle.success', {
          defaultValue: `Imported "${article.title}"`,
          title: article.title,
        }),
      );
      reset();
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ArticleFetchError) {
        const copy = FAILURE_COPY[e.code];
        const proxyNote = e.attemptedProxy
          ? ` (last tried via ${e.attemptedProxy}${e.lastStatus ? `, HTTP ${e.lastStatus}` : ''})`
          : '';
        setFailure({
          title: copy.title,
          message: e.message + proxyNote,
          hint: copy.hint,
          code: e.code,
          lastMode: mode,
        });
      } else {
        setFailure({
          title: t('importArticle.errGenericTitle', 'Something went wrong'),
          message: (e as Error)?.message || 'Could not fetch this article.',
          hint: 'Tap Retry or try a different link.',
          code: 'generic',
          lastMode: mode,
        });
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const cancelInFlight = () => {
    abortRef.current?.abort();
  };

  const canRetry = failure && failure.code !== 'invalid_url' && failure.code !== 'unsupported_protocol';
  const safeOpenUrl = url.trim();
  const canOpenSource = /^https?:\/\//i.test(safeOpenUrl);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            {t('importArticle.title', 'Import from URL')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'importArticle.desc',
              "Paste an article link — we'll fetch the title, headings, paragraphs, and images for you.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="article-url" className="text-xs">
              {t('importArticle.urlLabel', 'Article URL')}
            </Label>
            <Input
              id="article-url"
              type="url"
              inputMode="url"
              autoFocus
              placeholder="https://example.com/great-article"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                if (failure) setFailure(null);
              }}
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !loading) handleFetch('append');
              }}
            />
          </div>

          {loading && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t('importArticle.loading', 'Fetching… trying our proxies in order.')}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={cancelInFlight}
              >
                <XCircle className="h-3.5 w-3.5 mr-1" />
                {t('common.cancel', 'Cancel')}
              </Button>
            </div>
          )}

          {failure && !loading && (
            <Alert variant="destructive" className="py-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="text-xs font-semibold">{failure.title}</AlertTitle>
              <AlertDescription className="text-xs space-y-1.5">
                <p>{failure.message}</p>
                {failure.hint && <p className="opacity-90">{failure.hint}</p>}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {canRetry && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      onClick={() => handleFetch(failure.lastMode)}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      {t('importArticle.retry', 'Retry')}
                    </Button>
                  )}
                  {canOpenSource && (
                    <Button
                      asChild
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                    >
                      <a href={safeOpenUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3 w-3 mr-1" />
                        {t('importArticle.openSource', 'Open source')}
                      </a>
                    </Button>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          )}

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {t(
              'importArticle.hint',
              'Works best on public article pages (blogs, news, docs). Sites that require login or render only via JavaScript may not import cleanly.',
            )}
          </p>
        </div>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleFetch('replace')}
            disabled={loading}
            className="w-full sm:w-auto"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            {t('importArticle.replace', 'Replace note')}
          </Button>
          <Button
            type="button"
            onClick={() => handleFetch('append')}
            disabled={loading}
            className="w-full sm:w-auto"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            {t('importArticle.append', 'Append to note')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
