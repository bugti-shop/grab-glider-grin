/**
 * usePointerDragReorder
 * ---------------------
 * Custom pointer-event drag-and-drop reorder built for Capacitor WebViews
 * (Android + iOS) where the HTML5 native drag API is unreliable / broken.
 *
 * - Uses pointerdown / pointermove / pointerup only (no `draggable`, no
 *   `dragstart`, no `drop`).
 * - On `pointerdown`, clones the dragged element using
 *   `getBoundingClientRect()` so the ghost matches the source's exact size
 *   and computed styles, then appends it to `document.body` with
 *   `position: fixed` so it floats above all content while following the
 *   pointer.
 * - During `pointermove`, uses `document.elementFromPoint()` to find the
 *   hovered slot and renders a visual placeholder line at the insertion
 *   point.
 * - On `pointerup`, calls `onReorder(fromIndex, toIndex)`, removes the
 *   ghost, and tears down all listeners.
 * - Items get `touch-action: none` while drag is active to avoid scroll
 *   conflicts.
 *
 * Zero UI: this hook does not render anything. Wire it into existing rows
 * by spreading `getItemProps(index)` and `getHandleProps(index)` onto your
 * own elements.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

const LONG_PRESS_MS = 200;
// Mouse / pen: activate immediately on small motion (click-and-drag).
const MOUSE_MOVE_THRESHOLD_PX = 6;
// Touch: tolerate finger wobble during the long-press hold so a straight
// vertical press still arms the drag. Only obvious scroll motion aborts.
const TOUCH_HOLD_TOLERANCE_PX = 10;
const GHOST_OPACITY = 0.92;
const PLACEHOLDER_HEIGHT_PX = 2;
const PLACEHOLDER_COLOR = 'hsl(217 91% 60%)'; // blue accent — visual only

export interface UsePointerDragReorderOptions {
  /** Total reorderable items in the list. */
  itemCount: number;
  /** Called when the user drops on a valid slot. `to` is the destination
   *  index in the *original* (pre-move) array. */
  onReorder: (fromIndex: number, toIndex: number) => void;
  /** Attribute used to discover slot elements. Must be a number. */
  itemAttr?: string;
  /** Disable drag entirely (e.g. when selection mode is active). */
  disabled?: boolean;
}

export interface PointerDragApi {
  /** Spread onto each row container. Adds the data attribute used for
   *  hit-testing and the `touch-action: none` style while active. */
  getItemProps: (index: number) => {
    'data-pdrag-index': number;
    style: React.CSSProperties;
  };
  /** Spread onto a drag handle (or the whole row to make it draggable). */
  getHandleProps: (index: number) => {
    onPointerDown: (e: React.PointerEvent) => void;
    style: React.CSSProperties;
  };
  /** True while the user is actively dragging an item. */
  isDragging: boolean;
  /** Index of the currently-dragged item, or null. */
  draggingIndex: number | null;
}

export function usePointerDragReorder(opts: UsePointerDragReorderOptions): PointerDragApi {
  const { onReorder, disabled = false, itemAttr = 'data-pdrag-index' } = opts;

  const [isDragging, setIsDragging] = useState(false);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const stateRef = useRef<{
    startX: number;
    startY: number;
    pointerId: number;
    pointerType: string;
    fromIndex: number;
    sourceEl: HTMLElement | null;
    ghostEl: HTMLElement | null;
    placeholderEl: HTMLElement | null;
    longPressTimer: ReturnType<typeof setTimeout> | null;
    armed: boolean;     // long-press fired (touch) OR distance threshold met (mouse)
    active: boolean;    // ghost is in DOM, drag in progress
    lastToIndex: number;
  } | null>(null);

  const cleanup = useCallback(() => {
    const s = stateRef.current;
    if (!s) return;
    if (s.longPressTimer) clearTimeout(s.longPressTimer);
    if (s.ghostEl?.parentNode) s.ghostEl.parentNode.removeChild(s.ghostEl);
    if (s.placeholderEl?.parentNode) s.placeholderEl.parentNode.removeChild(s.placeholderEl);
    if (s.sourceEl) {
      s.sourceEl.style.removeProperty('opacity');
      s.sourceEl.style.removeProperty('pointer-events');
    }
    document.body.style.removeProperty('user-select');
    document.body.style.removeProperty('-webkit-user-select');
    document.body.style.removeProperty('cursor');
    // Immediately restore scroll on drop / cancel — no delay.
    document.body.style.removeProperty('overflow');
    document.body.style.removeProperty('touch-action');
    document.documentElement.style.removeProperty('overflow');
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    window.removeEventListener('pointercancel', handlePointerUp);
    stateRef.current = null;
    setIsDragging(false);
    setDraggingIndex(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hitTestIndex = useCallback((x: number, y: number): { index: number; before: boolean } | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!el) return null;
    const slot = el.closest<HTMLElement>(`[${itemAttr}]`);
    if (!slot) return null;
    const raw = slot.getAttribute(itemAttr);
    if (raw == null) return null;
    const idx = Number(raw);
    if (!Number.isFinite(idx)) return null;
    const rect = slot.getBoundingClientRect();
    const before = y < rect.top + rect.height / 2;
    return { index: idx, before };
  }, [itemAttr]);

  const updatePlaceholder = useCallback((hit: { index: number; before: boolean } | null) => {
    const s = stateRef.current;
    if (!s || !s.placeholderEl) return;
    if (!hit) {
      s.placeholderEl.style.display = 'none';
      return;
    }
    const slot = document.querySelector<HTMLElement>(`[${itemAttr}="${hit.index}"]`);
    if (!slot) {
      s.placeholderEl.style.display = 'none';
      return;
    }
    const rect = slot.getBoundingClientRect();
    const top = hit.before ? rect.top : rect.bottom;
    s.placeholderEl.style.display = 'block';
    s.placeholderEl.style.top = `${top - PLACEHOLDER_HEIGHT_PX / 2}px`;
    s.placeholderEl.style.left = `${rect.left}px`;
    s.placeholderEl.style.width = `${rect.width}px`;
    s.lastToIndex = hit.before ? hit.index : hit.index + 1;
  }, [itemAttr]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const s = stateRef.current;
    if (!s) return;

    // Pre-activation behaviour depends on pointer type:
    //  - Mouse / pen: activate as soon as motion exceeds threshold (no wait).
    //    This matches @dnd-kit's PointerSensor { distance } activation so
    //    click-and-drag feels instant on desktop.
    //  - Touch: require long-press first so vertical list scroll still works.
    if (!s.active) {
      const dx = Math.abs(e.clientX - s.startX);
      const dy = Math.abs(e.clientY - s.startY);
      const isPointerLikeMouse = s.pointerType === 'mouse' || s.pointerType === 'pen';

      if (isPointerLikeMouse) {
        // Distance-based activation — drag starts the moment the mouse moves.
        if (dx > MOUSE_MOVE_THRESHOLD_PX || dy > MOUSE_MOVE_THRESHOLD_PX) {
          if (s.longPressTimer) {
            clearTimeout(s.longPressTimer);
            s.longPressTimer = null;
          }
          s.armed = true;
          activateDrag(e.clientX, e.clientY);
        }
      } else {
        // Touch: pure delay-based activation. Tolerate small wobble while the
        // long-press timer is counting down so a straight vertical press
        // still arms the drag. Only meaningful motion (likely a scroll
        // gesture) aborts.
        if (!s.armed && (dx > TOUCH_HOLD_TOLERANCE_PX || dy > TOUCH_HOLD_TOLERANCE_PX)) {
          cleanup();
          return;
        }
        // If armed by long-press, any motion confirms drag.
        if (s.armed) activateDrag(e.clientX, e.clientY);
      }
    }

    if (s.active && s.ghostEl) {
      e.preventDefault();
      const rect = (s.ghostEl as any)._pdragRect as DOMRect;
      const offX = (s.ghostEl as any)._pdragOffX as number;
      const offY = (s.ghostEl as any)._pdragOffY as number;
      s.ghostEl.style.left = `${e.clientX - offX}px`;
      s.ghostEl.style.top = `${e.clientY - offY}px`;
      void rect;
      const hit = hitTestIndex(e.clientX, e.clientY);
      updatePlaceholder(hit);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanup, hitTestIndex, updatePlaceholder]);

  const activateDrag = useCallback((x: number, y: number) => {
    const s = stateRef.current;
    if (!s || !s.sourceEl || s.active) return;
    const rect = s.sourceEl.getBoundingClientRect();
    const ghost = s.sourceEl.cloneNode(true) as HTMLElement;
    // Match exact size; float above all content.
    ghost.style.position = 'fixed';
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.margin = '0';
    ghost.style.pointerEvents = 'none';
    ghost.style.opacity = String(GHOST_OPACITY);
    ghost.style.zIndex = '2147483647';
    ghost.style.boxShadow = '0 12px 32px rgba(0,0,0,0.18)';
    ghost.style.borderRadius = getComputedStyle(s.sourceEl).borderRadius || '8px';
    ghost.style.transform = 'translate3d(0,0,0)';
    ghost.style.transition = 'none';
    ghost.setAttribute('aria-hidden', 'true');
    ghost.setAttribute('data-pdrag-ghost', 'true');
    (ghost as any)._pdragRect = rect;
    (ghost as any)._pdragOffX = x - rect.left;
    (ghost as any)._pdragOffY = y - rect.top;
    document.body.appendChild(ghost);

    const placeholder = document.createElement('div');
    placeholder.setAttribute('data-pdrag-placeholder', 'true');
    placeholder.style.position = 'fixed';
    placeholder.style.height = `${PLACEHOLDER_HEIGHT_PX}px`;
    placeholder.style.background = PLACEHOLDER_COLOR;
    placeholder.style.borderRadius = '2px';
    placeholder.style.pointerEvents = 'none';
    placeholder.style.zIndex = '2147483646';
    placeholder.style.display = 'none';
    placeholder.style.boxShadow = '0 0 0 1px rgba(255,255,255,0.4)';
    document.body.appendChild(placeholder);

    s.ghostEl = ghost;
    s.placeholderEl = placeholder;
    s.active = true;
    s.lastToIndex = s.fromIndex;

    // Dim source without removing it from layout (preserves UI).
    s.sourceEl.style.opacity = '0.35';
    s.sourceEl.style.pointerEvents = 'none';

    document.body.style.userSelect = 'none';
    (document.body.style as any).webkitUserSelect = 'none';
    document.body.style.cursor = 'grabbing';

    document.body.style.userSelect = 'none';
    (document.body.style as any).webkitUserSelect = 'none';
    document.body.style.cursor = 'grabbing';
    // Hard-lock page scroll the instant the drag activates. Restored in cleanup().
    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.documentElement.style.overflow = 'hidden';

    setIsDragging(true);
    setDraggingIndex(s.fromIndex);
  }, []);

  const handlePointerUp = useCallback((e: PointerEvent) => {
    const s = stateRef.current;
    if (!s) return;
    if (s.active) {
      // Final synchronous hit-test at the up coordinates — guarantees the
      // drop position matches the last indicator the user saw, even if the
      // last pointermove didn't fire exactly at the release point.
      const finalHit = hitTestIndex(e.clientX, e.clientY);
      if (finalHit) {
        s.lastToIndex = finalHit.before ? finalHit.index : finalHit.index + 1;
      }
      const from = s.fromIndex;
      let to = s.lastToIndex;
      // Adjust for removal of source slot when moving downward.
      if (to > from) to -= 1;
      if (to !== from && to >= 0) {
        try { onReorder(from, to); } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[usePointerDragReorder] onReorder threw', err);
        }
      }
    }
    cleanup();
  }, [cleanup, hitTestIndex, onReorder]);

  // Keep latest move/up refs stable on the window listeners.
  useEffect(() => () => cleanup(), [cleanup]);

  const onPointerDown = useCallback((index: number) => (e: React.PointerEvent) => {
    if (disabled) return;
    if (e.button !== undefined && e.button !== 0) return;
    // Ignore interactive controls so taps still work.
    const target = e.target as HTMLElement | null;
    if (target && target.closest('button, a, input, textarea, select, [role="button"], [role="checkbox"], [data-no-drag]')) {
      return;
    }
    if (stateRef.current) cleanup();

    const sourceEl = (e.currentTarget as HTMLElement).closest<HTMLElement>(`[${itemAttr}]`);
    if (!sourceEl) return;

    // Capture pointer so virtualizer recycling doesn't drop our events.
    try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch {}

    stateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
      pointerType: e.pointerType || 'mouse',
      fromIndex: index,
      sourceEl,
      ghostEl: null,
      placeholderEl: null,
      longPressTimer: null,
      armed: false,
      active: false,
      lastToIndex: index,
    };

    stateRef.current.longPressTimer = setTimeout(() => {
      const s = stateRef.current;
      if (!s) return;
      s.armed = true;
      // Re-resolve sourceEl in case virtualizer recycled the DOM node.
      const fresh = document.querySelector<HTMLElement>(`[${itemAttr}="${s.fromIndex}"]`);
      if (fresh) s.sourceEl = fresh;
      activateDrag(s.startX, s.startY);
    }, LONG_PRESS_MS);

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  }, [activateDrag, cleanup, disabled, handlePointerMove, handlePointerUp, itemAttr]);

  const getItemProps = useCallback((index: number) => ({
    'data-pdrag-index': index,
    style: (isDragging ? { touchAction: 'none' as const } : {}) as React.CSSProperties,
  }), [isDragging]);

  const getHandleProps = useCallback((index: number) => ({
    // Capture phase fires before child buttons / swipe handlers can
    // stopPropagation or trigger remounts that would kill the drag.
    onPointerDownCapture: onPointerDown(index),
    style: {} as React.CSSProperties,
  }), [onPointerDown]);

  return { getItemProps, getHandleProps, isDragging, draggingIndex };
}
