import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';

/**
 * Hook to detect keyboard height on mobile devices.
 * Uses Capacitor Keyboard plugin on native platforms for accurate detection.
 * Falls back to visualViewport API on web.
 * Updates CSS custom property --keyboard-inset for use in fixed position elements.
 */
export const useKeyboardHeight = () => {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const isNative = Capacitor.isNativePlatform();

    // Native platform: Use Capacitor Keyboard plugin
    if (isNative) {
      let showListener: { remove: () => void } | null = null;
      let hideListener: { remove: () => void } | null = null;

      const setupNativeListeners = async () => {
        try {
          // Set resize mode to none so WebView doesn't shrink — we handle positioning manually
          try {
            await Keyboard.setResizeMode({ mode: 'none' as any });
          } catch (_) {
            // setResizeMode may not be available on all versions
          }

          // Use keyboardDidShow for accurate final height (especially on Android)
          showListener = await Keyboard.addListener('keyboardDidShow', (info) => {
            const height = info.keyboardHeight;
            setKeyboardHeight(height);
            document.documentElement.style.setProperty('--keyboard-inset', `${height}px`);
          });

          hideListener = await Keyboard.addListener('keyboardDidHide', () => {
            setKeyboardHeight(0);
            document.documentElement.style.setProperty('--keyboard-inset', '0px');
          });
        } catch (error) {
          console.error('[useKeyboardHeight] Failed to setup native keyboard listeners:', error);
        }
      };

      setupNativeListeners();

      return () => {
        showListener?.remove();
        hideListener?.remove();
        document.documentElement.style.setProperty('--keyboard-inset', '0px');
      };
    }

    // Web fallback: Use visualViewport API
    if (typeof window === 'undefined' || !window.visualViewport) {
      return;
    }

    const viewport = window.visualViewport;

    const handleResize = () => {
      const currentHeight = viewport.height;
      const heightDiff = Math.max(0, window.innerHeight - currentHeight);
      const newKeyboardHeight = heightDiff > 100 ? heightDiff : 0;
      
      setKeyboardHeight(newKeyboardHeight);
      document.documentElement.style.setProperty(
        '--keyboard-inset',
        `${newKeyboardHeight}px`
      );
    };

    handleResize();

    viewport.addEventListener('resize', handleResize);
    viewport.addEventListener('scroll', handleResize);

    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        setTimeout(handleResize, 100);
        setTimeout(handleResize, 300);
      }
    };

    const handleBlur = () => {
      setTimeout(() => {
        setKeyboardHeight(0);
        document.documentElement.style.setProperty('--keyboard-inset', '0px');
      }, 100);
    };

    document.addEventListener('focusin', handleFocus);
    document.addEventListener('focusout', handleBlur);

    return () => {
      viewport.removeEventListener('resize', handleResize);
      viewport.removeEventListener('scroll', handleResize);
      document.removeEventListener('focusin', handleFocus);
      document.removeEventListener('focusout', handleBlur);
      document.documentElement.style.setProperty('--keyboard-inset', '0px');
    };
  }, []);

  return keyboardHeight;
};
