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

const LONG_PRESS_MS = 220;
const MOVE_THRESHOLD_PX = 6;
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
    fromIndex: number;
    sourceEl: HTMLElement | null;
    ghostEl: HTMLElement | null;
    placeholderEl: HTMLElement | null;
    longPressTimer: ReturnType<typeof setTimeout> | null;
    armed: boolean;     // long-press fired, awaiting motion confirmation
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

    // Pre-activation: cancel on horizontal scroll-like motion.
    if (!s.active) {
      const dx = Math.abs(e.clientX - s.startX);
      const dy = Math.abs(e.clientY - s.startY);
      if (!s.armed && (dx > MOVE_THRESHOLD_PX || dy > MOVE_THRESHOLD_PX)) {
        // User moved before long-press fired → treat as scroll/tap, abort.
        cleanup();
        return;
      }
      if (s.armed && (dx > MOVE_THRESHOLD_PX || dy > MOVE_THRESHOLD_PX)) {
        activateDrag(e.clientX, e.clientY);
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

    setIsDragging(true);
    setDraggingIndex(s.fromIndex);
  }, []);

  const handlePointerUp = useCallback((_e: PointerEvent) => {
    const s = stateRef.current;
    if (!s) return;
    if (s.active) {
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
  }, [cleanup, onReorder]);

  // Keep latest move/up refs stable on the window listeners.
  useEffect(() => () => cleanup(), [cleanup]);

  const onPointerDown = useCallback((index: number) => (e: React.PointerEvent) => {
    if (disabled) return;
    // Only primary button / first touch.
    if (e.button !== undefined && e.button !== 0) return;
    if (stateRef.current) cleanup();

    const sourceEl = (e.currentTarget as HTMLElement).closest<HTMLElement>(`[${itemAttr}]`);
    if (!sourceEl) return;

    stateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      pointerId: e.pointerId,
      fromIndex: index,
      sourceEl,
      ghostEl: null,
      placeholderEl: null,
      longPressTimer: null,
      armed: false,
      active: false,
      lastToIndex: index,
    };

    // Long-press to arm drag (lets tap/scroll work normally).
    stateRef.current.longPressTimer = setTimeout(() => {
      const s = stateRef.current;
      if (!s) return;
      s.armed = true;
      // Activate immediately on long-press even without motion.
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
    onPointerDown: onPointerDown(index),
    // No `touch-action: none` by default — would break list scrolling on
    // touch devices. We only suppress browser gestures once the drag is
    // actually active (see getItemProps + active body cursor styles).
    style: {} as React.CSSProperties,
  }), [onPointerDown]);

  return { getItemProps, getHandleProps, isDragging, draggingIndex };
}
