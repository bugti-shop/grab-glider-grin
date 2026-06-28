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
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { buildClipperUrl, extractUrlAndText, parseClipMode } from '@/utils/webClipper';

type SendIntentResult = {
  title?: string;
  description?: string;
  type?: string;
  url?: string;
  webUrl?: string;
  additionalItems?: Array<{ title?: string; description?: string; type?: string; url?: string }>;
};

export function useShareIntent() {
  const navigate = useNavigate();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cancelled = false;

    const handlePayload = (raw: SendIntentResult | null | undefined) => {
      if (cancelled || !raw) return;
      // Combine all fields the plugin might populate; different sources
      // (Chrome link share vs text-selection share vs iOS extension) use
      // different keys.
      const blob = [raw.title, raw.description, raw.url, raw.webUrl]
        .filter(Boolean)
        .join('\n')
        .trim();
      if (!blob) return;

      const { url, text } = extractUrlAndText(blob);
      // Heuristic: a pure URL share = "article" mode, a long text payload
      // with no URL = "selection" mode, everything else = article.
      const mode = !url && text ? parseClipMode('selection') : parseClipMode('article');

      const target = buildClipperUrl({
        title: raw.title || (url ? new URL(url).hostname : 'Shared clip'),
        url,
        selection: text || undefined,
        mode,
      });
      navigate(target, { replace: false });
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
        window.addEventListener('sendIntentReceived', () => {
          SendIntent.checkSendIntentReceived().then(handlePayload).catch(() => {});
        });
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
      resumeSub.then((s) => s.remove()).catch(() => {});
    };
  }, [navigate]);
}
