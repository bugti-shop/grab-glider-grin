/**
 * Mount the invisible realtime sync engine.
 *
 * Starts on sign-in (any auth provider — Google / Apple / email / future
 * methods), stops on sign-out. Also wires Capacitor App lifecycle so a
 * background → foreground transition on iOS/Android triggers an immediate
 * resync without the user pressing refresh.
 *
 * Auth-event hygiene:
 *  - Deduplicates by userId so INITIAL_SESSION / TOKEN_REFRESHED /
 *    USER_UPDATED bursts don't spam startSync().
 *  - Serializes start/stop transitions through a single promise chain so
 *    rapid sign-in → sign-out → sign-in sequences can never leave two
 *    Realtime channels attached at once.
 *  - Route changes are intentionally NOT observed here: Realtime lives at
 *    the app root and must survive navigation; the per-view components
 *    subscribe to window events (tasksUpdated / notesUpdated / …) and clean
 *    those up on unmount.
 */
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { startSync, stopSync, syncNow } from '@/utils/cloudSync/syncEngine';
import { installCloudListener } from '@/utils/cloudSync/storeBridge';
import { runLegacyIdMigration } from '@/utils/cloudSync/legacyIdMigration';
import { startNoteTaskReverseSync } from '@/utils/noteTaskReverseSync';
import { Capacitor } from '@capacitor/core';

export function useCloudSync(): void {
  useEffect(() => {
    let mounted = true;
    installCloudListener();
    startNoteTaskReverseSync();

    // Serialize every start/stop transition. Prevents two overlapping
    // startSync() invocations from attaching duplicate Realtime channels
    // when auth events arrive back-to-back.
    let chain: Promise<void> = Promise.resolve();
    let activeUserId: string | null = null;

    const transition = (nextUserId: string | null) => {
      if (!mounted) return;
      // Dedupe: skip if nothing changed (TOKEN_REFRESHED / USER_UPDATED /
      // repeated INITIAL_SESSION all resolve to the same userId).
      if (nextUserId === activeUserId) return;
      activeUserId = nextUserId;

      chain = chain.then(async () => {
        if (!mounted) return;
        if (nextUserId) {
          try { await runLegacyIdMigration(); } catch {}
          if (!mounted || activeUserId !== nextUserId) return;
          await startSync(nextUserId);
        } else {
          await stopSync();
        }
      }).catch(err => {
        console.warn('[cloudSync] transition failed', err);
      });
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Token refresh is handled inside syncEngine (rebinds channel with
      // fresh JWT) — don't restart the whole engine here.
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') return;
      transition(session?.user?.id ?? null);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      transition(session?.user?.id ?? null);
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
          (sub as any).then?.((h: any) => h?.remove?.()).catch?.(() => {});
        };
      }).catch(() => {});
    }

    return () => {
      mounted = false;
      try { sub.subscription.unsubscribe(); } catch {}
      removeAppListener?.();
      // Chain the final teardown so it runs after any in-flight transition.
      chain = chain.then(() => stopSync()).catch(() => {});
    };
  }, []);
}
