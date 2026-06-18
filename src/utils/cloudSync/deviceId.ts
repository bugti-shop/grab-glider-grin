/**
 * Stable per-install device identifier used by the realtime sync engine.
 * Persisted in localStorage so it survives reloads but is per-install (per browser/app).
 */
const KEY = 'flowist_device_id';

function uuid(): string {
  // crypto.randomUUID is available in modern browsers + WKWebView/Android WebView
  try { return crypto.randomUUID(); } catch {}
  return 'd-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = uuid();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return 'ephemeral-' + uuid();
  }
}

export function getPlatform(): 'ios' | 'android' | 'web' {
  try {
    // @ts-ignore
    const cap = (window as any).Capacitor;
    if (cap?.getPlatform) {
      const p = cap.getPlatform();
      if (p === 'ios' || p === 'android') return p;
    }
  } catch {}
  return 'web';
}
