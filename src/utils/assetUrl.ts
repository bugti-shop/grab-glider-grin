import { Capacitor } from '@capacitor/core';

/**
 * Lovable CDN pointer URLs are relative (`/__l5e/assets-v1/...`) and served
 * by Lovable's hosting infra on web/preview/custom-domain. Inside the native
 * WebView (capacitor://localhost or file://) those relative paths resolve to
 * the local bundle and 404, so images silently fail to render.
 *
 * Prepend the public origin when running natively so the WebView fetches
 * from the CDN instead.
 */
const NATIVE_ORIGIN = 'https://flowist.me';

export const resolveAssetUrl = (url: string): string => {
  if (!url) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (!Capacitor.isNativePlatform()) return url;
  if (url.startsWith('/')) return NATIVE_ORIGIN + url;
  return url;
};
