import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Globe, AlertTriangle } from 'lucide-react';
import { fetchArticleFromUrl, FetchedArticle } from '@/utils/articleFetch';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

export type ImportArticleMode = 'replace' | 'append';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the cleaned article; the editor decides whether to replace or append. */
  onImport: (article: FetchedArticle, mode: ImportArticleMode) => void;
}

export const ImportArticleDialog = ({ open, onOpenChange, onImport }: Props) => {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = () => {
    setUrl('');
    setError(null);
    setLoading(false);
    abortRef.current?.abort();
    abortRef.current = null;
  };

  const handleFetch = async (mode: ImportArticleMode) => {
    if (!url.trim()) {
      setError(t('importArticle.errEmpty', 'Please paste an article URL first.'));
      return;
    }
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const article = await fetchArticleFromUrl(url.trim(), { signal: controller.signal });
      onImport(article, mode);
      toast.success(t('importArticle.success', { defaultValue: `Imported "${article.title}"`, title: article.title }));
      reset();
      onOpenChange(false);
    } catch (e) {
      const msg = (e as Error)?.message || 'Could not fetch this article.';
      setError(msg);
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

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
              'Paste an article link — we’ll fetch the title, headings, paragraphs, and images for you.',
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
              onChange={(e) => setUrl(e.target.value)}
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !loading) handleFetch('append');
              }}
            />
          </div>

          {error && (
            <Alert variant="destructive" className="py-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">{error}</AlertDescription>
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
