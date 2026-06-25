/**
 * Mount the invisible realtime sync engine.
 *
 * Starts on sign-in (any auth provider — Google / Apple / email / future
 * methods), stops on sign-out. Also wires Capacitor App lifecycle so a
 * background → foreground transition on iOS/Android triggers an immediate
 * resync without the user pressing refresh.
 */
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { startSync, stopSync, syncNow } from '@/utils/cloudSync/syncEngine';
import { installCloudListener } from '@/utils/cloudSync/storeBridge';
import { runLegacyIdMigration } from '@/utils/cloudSync/legacyIdMigration';
import { loadDeletionsAsync } from '@/utils/deletionTracker';
import { Capacitor } from '@capacitor/core';

export function useCloudSync(): void {
  useEffect(() => {
    let mounted = true;
    installCloudListener();

    const handle = async (userId: string | null) => {
      if (!mounted) return;
      if (userId) {
        // Reassign UUIDs to legacy local rows BEFORE the engine starts so the
        // first listener pass merges them cleanly. Runs at most once per device.
        try { await runLegacyIdMigration(); } catch {}
        if (!mounted) return;
        void startSync(userId);
      } else void stopSync();
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      handle(session?.user?.id ?? null);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      handle(session?.user?.id ?? null);
    });

    // Capacitor app lifecycle — foreground = trigger resync
    let removeAppListener: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      import('@capacitor/app').then(({ App }) => {
        const sub = App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) {
            window.dispatchEvent(new CustomEvent('flowist:app:foreground'));
            syncNow();
          }
        });
        removeAppListener = () => {
          // capacitor returns a promise; ignore
          (sub as any).then?.((h: any) => h?.remove?.()).catch?.(() => {});
        };
      }).catch(() => {});
    }

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      removeAppListener?.();
      void stopSync();
    };
  }, []);
}
