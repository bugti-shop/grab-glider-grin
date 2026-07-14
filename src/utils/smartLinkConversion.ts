// Reports a "install/first-open conversion" to the smart-link tracker on the
// very first native launch of Flowist. Web is a no-op.
//
// Android: if the @capacitor-community/install-referrer plugin is present at
// runtime we forward the Play install referrer string (contains click_id).
// iOS: no referrer API without an SDK — we still record the first open so the
// admin dashboard can show install→open counts.

import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

const CONVERSION_FIRED_KEY = "flowist_install_conversion_v1";
const DEVICE_ID_KEY = "flowist_device_id_v1";

function getOrCreateDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? // @ts-ignore
            crypto.randomUUID()
          : String(Date.now()) + Math.random().toString(36).slice(2);
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return String(Date.now());
  }
}

async function tryReadAndroidInstallReferrer(): Promise<string | null> {
  if (Capacitor.getPlatform() !== "android") return null;
  try {
    // Only load if a plugin is registered — avoids Vite trying to resolve it at build time.
    const w: any = window as any;
    const plugin = w?.Capacitor?.Plugins?.InstallReferrer;
    if (!plugin?.getReferrerDetails) return null;
    const res = await plugin.getReferrerDetails();
    return res?.referrer || res?.installReferrer || null;
  } catch {
    return null;
  }
}

export async function reportInstallConversionIfFirstLaunch(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    if (localStorage.getItem(CONVERSION_FIRED_KEY)) return;
  } catch {
    return;
  }

  // Mark first so we never double-fire even if network fails.
  try { localStorage.setItem(CONVERSION_FIRED_KEY, String(Date.now())); } catch {}

  const platform = Capacitor.getPlatform();
  const device_hash = getOrCreateDeviceId();
  const install_referrer = await tryReadAndroidInstallReferrer();

  // If Android install referrer is unavailable, fall back to any click_id we
  // stashed in localStorage (works when the same WebView instance opened /get).
  let click_id: string | null = null;
  try { click_id = localStorage.getItem("flowist_last_click_id"); } catch {}

  const app_version =
    (window as any)?.Capacitor?.Plugins?.App?.getInfo
      ? await (window as any).Capacitor.Plugins.App.getInfo().then((i: any) => i?.version).catch(() => null)
      : null;

  try {
    await supabase.functions.invoke("smart-link-conversion", {
      body: {
        platform,
        click_id,
        install_referrer,
        device_hash,
        app_version,
      },
    });
  } catch {
    // Allow retry on next launch by clearing the guard.
    try { localStorage.removeItem(CONVERSION_FIRED_KEY); } catch {}
  }
}
