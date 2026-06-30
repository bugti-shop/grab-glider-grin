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
  itemCount: number;
  onReorder: (fromIndex: number, toIndex: number) => void;
  itemAttr?: string;
  disabled?: boolean;
  /**
   * Stable id resolver. When provided, the hook records the *id* of the
   * source row at drag-start and re-resolves source/target indices at
   * drop-time. Makes reorder immune to concurrent list reconciliation
   * (e.g. a rapid completion queue shifting indices mid-gesture).
   */
  getItemId?: (index: number) => string | number | null | undefined;
  resolveIndexById?: (id: string | number) => number;
  onDragStart?: (fromIndex: number, fromId: string | number | null) => void;
  onDragEnd?: () => void;
}

export interface PointerDragApi {
  getItemProps: (index: number) => {
    'data-pdrag-index': number;
    'data-pdrag-id'?: string | number;
    style: React.CSSProperties;
  };
  getHandleProps: (index: number) => {
    onPointerDownCapture: (e: React.PointerEvent) => void;
    onTouchStartCapture: (e: React.TouchEvent) => void;
    style: React.CSSProperties;
  };
  isDragging: boolean;
  draggingIndex: number | null;
}

export function usePointerDragReorder(opts: UsePointerDragReorderOptions): PointerDragApi {
  const { onReorder, disabled = false, itemAttr = 'data-pdrag-index', getItemId, resolveIndexById, onDragStart, onDragEnd } = opts;

  const [isDragging, setIsDragging] = useState(false);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

  const stateRef = useRef<{
    startX: number;
    startY: number;
    pointerId: number;
    pointerType: string;
    fromIndex: number;
    fromId: string | number | null;
    sourceEl: HTMLElement | null;
    ghostEl: HTMLElement | null;
    placeholderEl: HTMLElement | null;
    longPressTimer: ReturnType<typeof setTimeout> | null;
    armed: boolean;
    active: boolean;
    moved: boolean;
    lastToIndex: number;
    lastToId: string | number | null;
    lastToBefore: boolean;
    lastX: number;
    lastY: number;
    scrollEl: HTMLElement | null;
    rafId: number | null;
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
    const slot = el?.closest<HTMLElement>(`[${itemAttr}]`) ?? null;
    if (slot) {
      const raw = slot.getAttribute(itemAttr);
      if (raw != null) {
        const idx = Number(raw);
        if (Number.isFinite(idx)) {
          const rect = slot.getBoundingClientRect();
          const before = y < rect.top + rect.height / 2;
          return { index: idx, before };
        }
      }
    }
    // Fallback: ghost / placeholder / overlay swallowed elementFromPoint,
    // OR the pointer is above the first / below the last row. Scan all
    // rendered slots and either: (a) find the one whose vertical band
    // contains y, or (b) snap to the nearest edge (top of first row when
    // dragging above, bottom of last row when dragging below). This makes
    // the drop commit at the visible blue line no matter how far the user
    // pulls past the list.
    const slots = Array.from(document.querySelectorAll<HTMLElement>(`[${itemAttr}]`))
      .filter((s) => !s.hasAttribute('data-pdrag-ghost'));
    let topMost: { el: HTMLElement; rect: DOMRect } | null = null;
    let bottomMost: { el: HTMLElement; rect: DOMRect } | null = null;
    for (const s of slots) {
      const r = s.getBoundingClientRect();
      if (r.height <= 0) continue;
      if (y >= r.top && y <= r.bottom) {
        const raw = s.getAttribute(itemAttr);
        const idx = raw != null ? Number(raw) : NaN;
        if (!Number.isFinite(idx)) continue;
        const before = y < r.top + r.height / 2;
        return { index: idx, before };
      }
      if (!topMost || r.top < topMost.rect.top) topMost = { el: s, rect: r };
      if (!bottomMost || r.bottom > bottomMost.rect.bottom) bottomMost = { el: s, rect: r };
    }
    // Above the first row → insert before it.
    if (topMost && y < topMost.rect.top) {
      const idx = Number(topMost.el.getAttribute(itemAttr));
      if (Number.isFinite(idx)) return { index: idx, before: true };
    }
    // Below the last row → insert after it.
    if (bottomMost && y > bottomMost.rect.bottom) {
      const idx = Number(bottomMost.el.getAttribute(itemAttr));
      if (Number.isFinite(idx)) return { index: idx, before: false };
    }
    return null;
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
    s.lastToBefore = hit.before;
    const idAttr = slot.getAttribute('data-pdrag-id');
    s.lastToId = idAttr ?? null;
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
      // Only count as "moved" once the finger/pointer actually travels past
      // a small threshold after activation — guarantees that a stationary
      // long-press release never registers as a drop.
      const movedDx = Math.abs(e.clientX - s.startX);
      const movedDy = Math.abs(e.clientY - s.startY);
      if (!s.moved && (movedDx > TOUCH_HOLD_TOLERANCE_PX || movedDy > TOUCH_HOLD_TOLERANCE_PX)) {
        s.moved = true;
      }
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
    try { onDragStart?.(s.fromIndex, s.fromId); } catch {}
  }, [onDragStart]);

  const handlePointerUp = useCallback((e: PointerEvent | { clientX: number; clientY: number }) => {
    const s = stateRef.current;
    if (!s) return;
    if (s.active && s.moved) {
      // Snap to the last placeholder position rather than re-hit-testing at
      // pointerup. The blue line the user sees IS the drop target — trust it.
      // Only fall back to a fresh hit-test if no placeholder was ever shown
      // (e.g. drop happened before the first move event).
      if (s.lastToId == null) {
        const finalHit = hitTestIndex(e.clientX, e.clientY);
        if (finalHit) {
          s.lastToIndex = finalHit.before ? finalHit.index : finalHit.index + 1;
          s.lastToBefore = finalHit.before;
          const slot = document.querySelector<HTMLElement>(`[${itemAttr}="${finalHit.index}"]`);
          s.lastToId = slot?.getAttribute('data-pdrag-id') ?? null;
        }
      }
      // Resolve indices against the *current* list at drop time using stable
      // ids. This neutralizes any reconciliation (task completion, sync, etc.)
      // that may have shifted indices while the gesture was in flight.
      let from = s.fromIndex;
      if (s.fromId != null && resolveIndexById) {
        const resolved = resolveIndexById(s.fromId);
        if (Number.isFinite(resolved) && resolved >= 0) from = resolved;
      }
      let insertionIndex = s.lastToIndex;
      if (s.lastToId != null && resolveIndexById) {
        const resolvedTarget = resolveIndexById(s.lastToId);
        if (Number.isFinite(resolvedTarget) && resolvedTarget >= 0) {
          insertionIndex = s.lastToBefore ? resolvedTarget : resolvedTarget + 1;
        }
      }
      let to = insertionIndex;
      if (to > from) to -= 1;
      try {
        (window as any).__flowistLastTaskDrop = { from, insertionIndex, insert: { index: insertionIndex } };
        (window as any).__flowistLastTaskInsert = { index: insertionIndex, from };
      } catch {}
      if (to !== from && to >= 0) {
        try {
          onReorder(from, to);
          try {
            (window as any).__flowistLastTaskReorder = { ok: true, from, to, insertionIndex };
          } catch {}
        } catch (err) {
          try {
            (window as any).__flowistLastTaskReorder = { ok: false, from, to, insertionIndex, error: String(err) };
          } catch {}
          // eslint-disable-next-line no-console
          console.error('[usePointerDragReorder] onReorder threw', err);
        }
      }
    }
    cleanup();
    try { onDragEnd?.(); } catch {}
  }, [cleanup, hitTestIndex, itemAttr, onDragEnd, onReorder, resolveIndexById]);

  // Touch-event fallback for synthetic TouchEvents (Playwright) and any
  // WebView that suppresses pointer-from-touch. Mirrors the pointer state.
  const handleTouchMove = useCallback((e: TouchEvent) => {
    const t = e.touches[0] ?? e.changedTouches[0];
    if (!t) return;
    handlePointerMove({ clientX: t.clientX, clientY: t.clientY, preventDefault: () => e.preventDefault() } as unknown as PointerEvent);
  }, [handlePointerMove]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    const t = e.changedTouches[0] ?? e.touches[0];
    handlePointerUp({ clientX: t?.clientX ?? 0, clientY: t?.clientY ?? 0 });
  }, [handlePointerUp]);

  useEffect(() => () => cleanup(), [cleanup]);

  const armAndMaybeActivate = useCallback((index: number, x: number, y: number, pointerType: string, sourceEl: HTMLElement) => {
    if (stateRef.current) cleanup();
    const initialId = getItemId?.(index) ?? sourceEl.getAttribute('data-pdrag-id') ?? null;
    stateRef.current = {
      startX: x,
      startY: y,
      pointerId: -1,
      pointerType,
      fromIndex: index,
      fromId: initialId,
      sourceEl,
      ghostEl: null,
      placeholderEl: null,
      longPressTimer: null,
      armed: false,
      active: false,
      moved: false,
      lastToIndex: index,
      lastToId: null,
      lastToBefore: true,
      lastX: x,
      lastY: y,
      scrollEl: null,
      rafId: null,
    };
    stateRef.current.longPressTimer = setTimeout(() => {
      const s = stateRef.current;
      if (!s) return;
      s.armed = true;
      try { (window as any).__flowistTaskDragArmed = { index: s.fromIndex, at: Date.now() }; } catch {}
      const fresh = document.querySelector<HTMLElement>(`[${itemAttr}="${s.fromIndex}"]`);
      if (fresh) s.sourceEl = fresh;
      activateDrag(s.startX, s.startY);
    }, LONG_PRESS_MS);
  }, [activateDrag, cleanup, itemAttr]);

  const onPointerDown = useCallback((index: number) => (e: React.PointerEvent) => {
    if (disabled) return;
    if (e.button !== undefined && e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target && target.closest('button, a, input, textarea, select, [role="button"], [role="checkbox"], [data-no-drag]')) {
      return;
    }
    const sourceEl = (e.currentTarget as HTMLElement).closest<HTMLElement>(`[${itemAttr}]`);
    if (!sourceEl) return;
    try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch {}
    armAndMaybeActivate(index, e.clientX, e.clientY, e.pointerType || 'mouse', sourceEl);
    if (stateRef.current) stateRef.current.pointerId = e.pointerId;
    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  }, [armAndMaybeActivate, disabled, handlePointerMove, handlePointerUp, itemAttr]);

  const onTouchStart = useCallback((index: number) => (e: React.TouchEvent) => {
    if (disabled) return;
    const target = e.target as HTMLElement | null;
    if (target && target.closest('button, a, input, textarea, select, [role="button"], [role="checkbox"], [data-no-drag]')) {
      return;
    }
    const t = e.touches[0];
    if (!t) return;
    const sourceEl = (e.currentTarget as HTMLElement).closest<HTMLElement>(`[${itemAttr}]`);
    if (!sourceEl) return;
    armAndMaybeActivate(index, t.clientX, t.clientY, 'touch', sourceEl);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchEnd);
  }, [armAndMaybeActivate, disabled, handleTouchEnd, handleTouchMove, itemAttr]);

  const getItemProps = useCallback((index: number) => {
    const id = getItemId?.(index);
    const props: { 'data-pdrag-index': number; 'data-pdrag-id'?: string | number; style: React.CSSProperties } = {
      'data-pdrag-index': index,
      style: (isDragging ? { touchAction: 'none' as const } : {}) as React.CSSProperties,
    };
    if (id != null) props['data-pdrag-id'] = id;
    return props;
  }, [getItemId, isDragging]);

  const getHandleProps = useCallback((index: number) => ({
    onPointerDownCapture: onPointerDown(index),
    onTouchStartCapture: onTouchStart(index),
    style: {} as React.CSSProperties,
  }), [onPointerDown, onTouchStart]);

  return { getItemProps, getHandleProps, isDragging, draggingIndex };
}
