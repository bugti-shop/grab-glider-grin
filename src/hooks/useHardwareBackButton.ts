import { useEffect, useRef } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

interface UseHardwareBackButtonOptions {
  onBack: () => void | Promise<void>;
  enabled?: boolean;
  priority?: 'sheet' | 'navigation'; // sheets take priority over navigation
}

// Global stack to manage multiple back button handlers
const backHandlerStack: Array<{
  id: string;
  callback: () => void | Promise<void>;
  priority: 'sheet' | 'navigation';
}> = [];

let globalListenerSetup = false;

// Tracks sheet closures initiated by browser back (popstate) so we don't call history.back() again on cleanup
const webPopstateClosures = new Set<string>();

const setupGlobalListener = () => {
  if (globalListenerSetup) return;
  globalListenerSetup = true;

  // Native (Capacitor) back button
  if (Capacitor.isNativePlatform()) {
    App.addListener('backButton', () => {
      if (backHandlerStack.length === 0) return;

      const mostRecentSheet = [...backHandlerStack]
        .reverse()
        .find((h) => h.priority === 'sheet');

      if (mostRecentSheet) {
        Promise.resolve(mostRecentSheet.callback()).catch((err) => {
          console.error('Hardware back handler failed:', err);
        });
        return;
      }

      const handler = backHandlerStack[backHandlerStack.length - 1];
      if (handler) {
        Promise.resolve(handler.callback()).catch((err) => {
          console.error('Hardware back handler failed:', err);
        });
      }
    });
  }

  // Web (browser back / Android back in Chrome)
  if (typeof window !== 'undefined') {
    window.addEventListener('popstate', () => {
      if (backHandlerStack.length === 0) return;

      // Close the most recent sheet first (prevents leaving the current page)
      const mostRecentSheet = [...backHandlerStack]
        .reverse()
        .find((h) => h.priority === 'sheet');

      if (mostRecentSheet) {
        webPopstateClosures.add(mostRecentSheet.id);
        Promise.resolve(mostRecentSheet.callback()).catch((err) => {
          console.error('Web back handler failed:', err);
        });
      }
      // If no sheet is open, allow normal browser back navigation.
    });
  }
};

/**
 * Hook to handle back actions across native + web.
 * - Native: uses Capacitor App backButton
 * - Web: uses browser history (popstate) and pushes a history entry when a sheet opens
 */
export const useHardwareBackButton = ({
  onBack,
  enabled = true,
  priority = 'navigation',
}: UseHardwareBackButtonOptions) => {
  const handlerId = useRef(`handler-${Date.now()}-${Math.random()}`);
  const callbackRef = useRef(onBack);
  const pushedWebSheetStateRef = useRef(false);

  // Keep callback ref updated
  useEffect(() => {
    callbackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    setupGlobalListener();

    const id = handlerId.current;
    const isWeb = typeof window !== 'undefined' && !Capacitor.isNativePlatform();

    if (enabled) {
      backHandlerStack.push({
        id,
        callback: () => callbackRef.current(),
        priority,
      });

      // On web, when a sheet opens we push a history entry so browser back closes the sheet
      if (isWeb && priority === 'sheet' && !pushedWebSheetStateRef.current) {
        try {
          window.history.pushState({ __lovable_sheet_id: id }, '', window.location.href);
          pushedWebSheetStateRef.current = true;
        } catch (e) {
          console.warn('Failed to push web sheet history state:', e);
        }
      }
    }

    return () => {
      // Remove from stack
      const index = backHandlerStack.findIndex((h) => h.id === id);
      if (index !== -1) backHandlerStack.splice(index, 1);

      // If the sheet was closed via UI (not via popstate), pop the synthetic history entry
      if (isWeb && priority === 'sheet' && pushedWebSheetStateRef.current) {
        if (webPopstateClosures.has(id)) {
          webPopstateClosures.delete(id);
        } else {
          // Best-effort cleanup; if this causes a navigation, it will be within the same URL state we pushed.
          try {
            window.history.back();
          } catch {
            // ignore
          }
        }
        pushedWebSheetStateRef.current = false;
      }
    };
  }, [enabled, priority]);
};

export default useHardwareBackButton;
