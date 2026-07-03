import { useCallback, useEffect, useState } from 'react';
import { Copy, Mail, RefreshCw, Check, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

const INBOUND_DOMAIN = 'mail.flowist.me';

function randomSuffix(len = 6) {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
  return out;
}

function slugify(input: string) {
  return (input || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 16) || 'user';
}

export function EmailToFlowistCard({ userId, displayName }: { userId: string; displayName?: string | null }) {
  const [loading, setLoading] = useState(true);
  const [localPart, setLocalPart] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const { toast } = useToast();

  const address = localPart ? `${localPart}@${INBOUND_DOMAIN}` : '';

  const createAlias = useCallback(async () => {
    const base = slugify(displayName || 'user');
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = `${base}.${randomSuffix()}`;
      const { data, error } = await supabase
        .from('email_aliases')
        .insert({ user_id: userId, local_part: candidate, is_active: true })
        .select('local_part')
        .single();
      if (!error && data) return data.local_part as string;
    }
    throw new Error('Could not generate a unique alias');
  }, [userId, displayName]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('email_aliases')
        .select('local_part')
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle();
      if (cancelled) return;
      if (data?.local_part) {
        setLocalPart(data.local_part);
        setLoading(false);
      } else {
        try {
          const lp = await createAlias();
          if (!cancelled) setLocalPart(lp);
        } catch (e: any) {
          toast({ title: 'Could not create your email address', description: e.message, variant: 'destructive' });
        } finally {
          if (!cancelled) setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [userId, createAlias, toast]);

  const handleCopy = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast({ title: 'Copied', description: address });
  };

  const handleRegenerate = async () => {
    if (!confirm('Generate a new email address? The old one will stop working.')) return;
    setRegenerating(true);
    try {
      await supabase.from('email_aliases').update({ is_active: false }).eq('user_id', userId);
      const lp = await createAlias();
      setLocalPart(lp);
      toast({ title: 'New address ready' });
    } catch (e: any) {
      toast({ title: 'Failed', description: e.message, variant: 'destructive' });
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Mail className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Email to Flowist</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Send or forward any email to this private address and it appears as a note in Flowist — instantly synced across devices.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 py-4"><Loader2 className="h-4 w-4 animate-spin" /><span className="text-xs">Preparing your address…</span></div>
      ) : (
        <>
          <div className="flex items-stretch gap-2 mb-3">
            <div className="flex-1 min-w-0 rounded-lg bg-muted px-3 py-2 text-sm font-mono break-all select-all">
              {address}
            </div>
            <Button size="sm" variant="secondary" onClick={handleCopy} className="shrink-0">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
            <Button size="sm" variant="ghost" onClick={handleRegenerate} disabled={regenerating} className="shrink-0" title="Generate new address">
              {regenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>

          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer font-medium text-foreground/80 mb-2">How to use it</summary>
            <ol className="mt-2 space-y-1.5 list-decimal list-inside">
              <li>Save this address in your contacts as <strong>Flowist</strong>.</li>
              <li>Send or forward an email to it — subject becomes the note title, body becomes the content.</li>
              <li>Attachments (PDF, images, audio) are attached to the note.</li>
            </ol>
            <p className="mt-3 font-medium text-foreground/80">Subject-line shortcuts</p>
            <ul className="mt-1 space-y-1">
              <li><code className="bg-muted px-1 rounded">@Notebook</code> — file into a notebook (created if missing)</li>
              <li><code className="bg-muted px-1 rounded">#tag</code> — add tags</li>
              <li><code className="bg-muted px-1 rounded">!2026-07-15</code> — set a reminder date</li>
            </ul>
            <p className="mt-3 opacity-70">Example: <em>Trip ideas @Travel #summer !2026-08-01</em></p>
          </details>
        </>
      )}
    </div>
  );
}
