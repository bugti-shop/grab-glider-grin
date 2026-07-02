/**
 * useShareIntent — Receives content shared into the Flowist app via the
 * OS share sheet (Android intent-filter or iOS Share Extension) and
 * forwards it to the in-app Web Clipper flow.
 *
 * • Android: backed by the `send-intent` Capacitor plugin which surfaces
 *   ACTION_SEND payloads (text + URL).
 * • iOS: the Share Extension target writes shared content to the App
 *   Group's UserDefaults under `sharedItems`; `send-intent` reads it on
 *   resume and emits `sendIntentReceived`.
 *
 * The web build is a no-op — this hook only activates on native.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import {
  buildClipperUrl,
  buildShareSignature,
  detectAttachmentKind,
  extractUrlAndText,
  isDuplicateShare,
  parseClipMode,
  validateUrl,
} from '@/utils/webClipper';

type SendIntentResult = {
  title?: string;
  description?: string;
  type?: string;
  url?: string;
  webUrl?: string;
  additionalItems?: Array<{ title?: string; description?: string; type?: string; url?: string }>;
};

type FlowistShareIntentPlugin = {
  markConsumed(): Promise<{ ok: boolean }>;
};

const FlowistShareIntent = registerPlugin<FlowistShareIntentPlugin>('FlowistShareIntent');

export function useShareIntent() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cancelled = false;
    const handledThisMount = new Set<string>();

    const markNativeShareConsumed = () => {
      if (!Capacitor.isNativePlatform()) return;
      void FlowistShareIntent.markConsumed().catch(() => {
        // Older native shells won't have this plugin yet; persistent JS dedup
        // still prevents stale shares from being reprocessed on app reopen.
      });
    };

    const handlePayload = (raw: SendIntentResult | null | undefined) => {
      if (cancelled || !raw) return;

      // 1. Try to interpret raw.url as a direct file/asset reference first
      //    (image share from gallery, PDF share from Files, etc.).
      const directUrl = raw.url || raw.webUrl || '';
      const attachmentKind = detectAttachmentKind(raw.type, directUrl);
      const safeDirect = validateUrl(directUrl);

      // 2. Otherwise, fall back to text/URL parsing from the combined blob.
      const blob = [raw.title, raw.description, raw.url, raw.webUrl]
        .filter(Boolean)
        .join('\n')
        .trim();
      const { url: parsedUrl, text } = extractUrlAndText(blob);

      const url = attachmentKind ? '' : parsedUrl;
      const attachment = attachmentKind && safeDirect ? safeDirect : undefined;

      if (!url && !text && !attachment) return;

      // 3. De-dup repeated fires (cold start + resume + sendIntentReceived).
      const signature = buildShareSignature({ url: url || attachment, text, attachment });
      if (handledThisMount.has(signature)) return;
      if (isDuplicateShare(signature)) return;
      handledThisMount.add(signature);

      // 4. Mode selection: image/pdf attachments override; pure URL = article;
      //    pure text = selection.
      const mode = attachmentKind
        ? parseClipMode(attachmentKind)
        : !url && text
          ? parseClipMode('selection')
          : parseClipMode('article');

      const fallbackTitle = attachment
        ? attachmentKind === 'pdf' ? 'Shared PDF' : 'Shared image'
        : url ? new URL(url).hostname : 'Shared clip';

      const target = buildClipperUrl({
        title: raw.title || fallbackTitle,
        url,
        selection: text || undefined,
        attachment,
        attachmentType: attachmentKind,
        mode,
      });
      markNativeShareConsumed();
      navigate(target, { replace: true });
    };

    const handleSendIntentEvent = () => {
      import('send-intent')
        .then(({ SendIntent }) => SendIntent.checkSendIntentReceived().then(handlePayload).catch(() => {}))
        .catch(() => {});
    };

    // Lazy import — the plugin's JS bridge is only present in native builds.
    import('send-intent')
      .then(({ SendIntent }) => {
        // 1. Cold start: app launched FROM the share sheet.
        SendIntent.checkSendIntentReceived()
          .then(handlePayload)
          .catch(() => {
            /* no pending share — normal cold start */
          });

        // 2. Warm start: app already in background when user shared.
        window.addEventListener('sendIntentReceived', handleSendIntentEvent);
      })
      .catch((err) => {
        console.warn('[shareIntent] send-intent plugin unavailable', err);
      });

    // 3. iOS App Group fallback: re-check whenever app resumes.
    const resumeSub = CapApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return;
      import('send-intent')
        .then(({ SendIntent }) => SendIntent.checkSendIntentReceived().then(handlePayload).catch(() => {}))
        .catch(() => {});
    });

    return () => {
      cancelled = true;
      window.removeEventListener('sendIntentReceived', handleSendIntentEvent);
      resumeSub.then((s) => s.remove()).catch(() => {});
    };
  }, [navigate]);
}
