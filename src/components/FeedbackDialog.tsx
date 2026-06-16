import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Capacitor } from '@capacitor/core';

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const CATEGORIES = [
  { id: 'bug', label: '🐞 Bug' },
  { id: 'idea', label: '💡 Idea' },
  { id: 'ux', label: '✨ UX' },
  { id: 'other', label: '💬 Other' },
];

export const FeedbackDialog = ({ open, onOpenChange }: FeedbackDialogProps) => {
  const [category, setCategory] = useState('bug');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setCategory('bug'); setMessage(''); setEmail(''); setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
  };

  const handleFile = (f: File | null) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) { toast.error('Please pick an image'); return; }
    if (f.size > 5 * 1024 * 1024) { toast.error('Image must be under 5 MB'); return; }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const submit = async () => {
    const trimmed = message.trim();
    if (trimmed.length < 5) { toast.error('Please write a bit more (min 5 chars)'); return; }
    if (trimmed.length > 4000) { toast.error('Message too long (max 4000 chars)'); return; }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let screenshotUrl: string | null = null;

      if (file) {
        const folder = user?.id || 'anon';
        const path = `${folder}/${Date.now()}-${file.name.replace(/[^a-z0-9.\-_]/gi, '_')}`;
        const { error: upErr } = await supabase.storage
          .from('feedback-screenshots')
          .upload(path, file, { upsert: false, contentType: file.type });
        if (upErr) {
          console.warn('[Feedback] upload failed:', upErr);
        } else {
          screenshotUrl = path;
        }
      }

      const fullMessage = email.trim() ? `${trimmed}\n\nReply to: ${email.trim()}` : trimmed;

      const { error } = await supabase.from('feedback').insert({
        user_id: user?.id ?? null,
        category,
        message: fullMessage,
        screenshot_url: screenshotUrl,
        user_agent: navigator.userAgent.slice(0, 500),
        platform: Capacitor.getPlatform(),
        app_version: '1.0.0',
      });
      if (error) throw error;
      toast.success('Thanks! Your feedback is in 🙌');
      reset();
      onOpenChange(false);
    } catch (e: any) {
      console.error('[Feedback] submit error', e);
      toast.error(e?.message || 'Could not send feedback');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send feedback</DialogTitle>
          <DialogDescription>
            Found a bug or have an idea? Tell us — screenshots are optional but super helpful.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                  category === c.id
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-border text-foreground hover:bg-muted'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What happened? What did you expect?"
            rows={5}
            maxLength={4000}
          />

          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Your email (optional, for follow-up)"
            maxLength={255}
          />

          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] || null)}
          />

          {previewUrl ? (
            <div className="relative rounded-md border border-border overflow-hidden">
              <img src={previewUrl} alt="screenshot preview" className="w-full max-h-48 object-cover" />
              <button
                type="button"
                onClick={() => { if (previewUrl) URL.revokeObjectURL(previewUrl); setFile(null); setPreviewUrl(''); }}
                className="absolute top-1 right-1 p-1 rounded-full bg-background/90 hover:bg-background"
                aria-label="Remove screenshot"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              className="gap-2"
            >
              <ImagePlus className="h-4 w-4" /> Add screenshot (optional)
            </Button>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending…</> : 'Send'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};