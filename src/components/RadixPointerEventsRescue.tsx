import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Radix Dialog/Sheet/Popover sometimes leaves `pointer-events: none` on
 * <body> after close (interrupted animation, route change while open, etc.).
 * That makes follow-up triggers — most visibly the Notes-Types dropdown —
 * appear "unclickable" until a manual refresh.
 *
 * This mounts a MutationObserver that clears the lock whenever no Radix
 * overlay is actually open, and also clears it on every route change.
 */
export const RadixPointerEventsRescue = () => {
  const location = useLocation();

  // Clear on every route change — covers the "navigate while a sheet was open" case.
  useEffect(() => {
    document.body.style.pointerEvents = '';
    document.body.removeAttribute('inert');
  }, [location.pathname, location.search]);

  useEffect(() => {
    const hasOpenOverlay = () =>
      !!document.querySelector(
        '[data-state="open"][role="dialog"], [data-radix-popper-content-wrapper] [data-state="open"]'
      );

    const fix = () => {
      const body = document.body;
      if (body.style.pointerEvents === 'none' && !hasOpenOverlay()) {
        body.style.pointerEvents = '';
      }
      if (body.hasAttribute('inert') && !hasOpenOverlay()) {
        body.removeAttribute('inert');
      }
    };

    const obs = new MutationObserver(fix);
    obs.observe(document.body, { attributes: true, attributeFilter: ['style', 'inert'] });
    obs.observe(document.documentElement, { childList: true, subtree: true });

    // Safety net: periodic check (cheap).
    const id = window.setInterval(fix, 1500);

    return () => { obs.disconnect(); window.clearInterval(id); };
  }, []);

  return null;
};
