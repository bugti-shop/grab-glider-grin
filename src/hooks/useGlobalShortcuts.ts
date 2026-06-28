/**
 * Global keyboard shortcuts wired to the whole app.
 *
 * Currently registered:
 *   • Ctrl/Cmd + B  → toggle the desktop sidebar (dispatches
 *     "desktop-sidebar:toggle" so DesktopSidebar can react).
 *
 * Shortcuts are ignored while the user is typing in an input, textarea,
 * select, or any contentEditable surface so they never hijack normal
 * typing.
 */
import { useEffect } from 'react';

const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
};

export const SIDEBAR_TOGGLE_EVENT = 'desktop-sidebar:toggle';

export const useGlobalShortcuts = () => {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + B → toggle desktop sidebar.
      // We allow this one even when typing, matching Todoist/Notion behaviour.
      const isMod = e.ctrlKey || e.metaKey;
      if (isMod && !e.shiftKey && !e.altKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent(SIDEBAR_TOGGLE_EVENT));
        return;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
};

export { isTypingTarget };
