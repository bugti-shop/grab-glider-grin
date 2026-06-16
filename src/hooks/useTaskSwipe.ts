import { useState, useRef, useCallback } from 'react';
import { TodoItem } from '@/types/note';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

const SWIPE_THRESHOLD = 60;
const SWIPE_ACTION_WIDTH = 60;

interface SwipeState {
  id: string;
  x: number;
  isSwiping: boolean;
  snapped?: 'left' | 'right';
}

interface SubtaskSwipeState {
  id: string;
  parentId: string;
  x: number;
  isSwiping: boolean;
}

export const useTaskSwipe = (
  swipeEnabled: boolean,
  updateSubtask: (parentId: string, subtaskId: string, updates: Partial<TodoItem>) => void,
  deleteSubtask: (parentId: string, subtaskId: string, withHaptic: boolean) => void,
) => {
  const [swipeState, setSwipeState] = useState<SwipeState | null>(null);
  const touchStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const [subtaskSwipeState, setSubtaskSwipeState] = useState<SubtaskSwipeState | null>(null);
  const subtaskTouchStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleFlatTouchStart = useCallback((itemId: string, e: React.TouchEvent) => {
    if (!swipeEnabled) return;
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    setSwipeState({ id: itemId, x: 0, isSwiping: false });
  }, [swipeEnabled]);

  const handleFlatTouchMove = useCallback((itemId: string, e: React.TouchEvent) => {
    if (!swipeEnabled) return;
    if (!swipeState || swipeState.id !== itemId) return;
    const deltaX = e.touches[0].clientX - touchStartRef.current.x;
    const deltaY = Math.abs(e.touches[0].clientY - touchStartRef.current.y);
    if (deltaY > 30 && !swipeState.isSwiping) return;
    if (Math.abs(deltaX) > 15) {
      const maxSwipeRight = SWIPE_ACTION_WIDTH * 2;
      const maxSwipeLeft = SWIPE_ACTION_WIDTH * 3;
      const clampedX = Math.max(-maxSwipeLeft, Math.min(maxSwipeRight, deltaX));
      setSwipeState({ id: itemId, x: clampedX, isSwiping: true });
    }
  }, [swipeEnabled, swipeState]);

  const handleFlatTouchEnd = useCallback(async (item: TodoItem) => {
    if (!swipeEnabled) return;
    if (!swipeState || swipeState.id !== item.id) return;
    const maxSwipeRight = SWIPE_ACTION_WIDTH * 2;
    const maxSwipeLeft = SWIPE_ACTION_WIDTH * 3;
    if (swipeState.isSwiping) {
      if (swipeState.x > SWIPE_THRESHOLD) {
        try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {}
        setSwipeState({ id: item.id, x: maxSwipeRight, isSwiping: false, snapped: 'right' });
        return;
      } else if (swipeState.x < -SWIPE_THRESHOLD) {
        try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {}
        setSwipeState({ id: item.id, x: -maxSwipeLeft, isSwiping: false, snapped: 'left' });
        return;
      }
    }
    setSwipeState(null);
  }, [swipeEnabled, swipeState]);

  const handleSwipeAction = useCallback(async (action: () => void) => {
    try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {}
    action();
    setSwipeState(null);
  }, []);

  const handleSubtaskSwipeStart = useCallback((subtaskId: string, parentId: string, e: React.TouchEvent) => {
    if (!swipeEnabled) return;
    subtaskTouchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    setSubtaskSwipeState({ id: subtaskId, parentId, x: 0, isSwiping: false });
  }, [swipeEnabled]);

  const handleSubtaskSwipeMove = useCallback((subtaskId: string, _parentId: string, e: React.TouchEvent) => {
    if (!swipeEnabled) return;
    if (!subtaskSwipeState || subtaskSwipeState.id !== subtaskId) return;
    const deltaX = e.touches[0].clientX - subtaskTouchStartRef.current.x;
    const deltaY = Math.abs(e.touches[0].clientY - subtaskTouchStartRef.current.y);
    if (deltaY < 30) {
      const clampedX = Math.max(-120, Math.min(120, deltaX));
      setSubtaskSwipeState(prev => prev ? { ...prev, x: clampedX, isSwiping: true } : null);
    }
  }, [swipeEnabled, subtaskSwipeState]);

  const handleSubtaskSwipeEnd = useCallback(async (subtask: TodoItem, parentId: string) => {
    if (!swipeEnabled) return;
    if (!subtaskSwipeState || subtaskSwipeState.id !== subtask.id) return;
    if (subtaskSwipeState.x < -SWIPE_THRESHOLD) {
      try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {}
      deleteSubtask(parentId, subtask.id, true);
    } else if (subtaskSwipeState.x > SWIPE_THRESHOLD) {
      try { await Haptics.impact({ style: ImpactStyle.Heavy }); } catch {}
      updateSubtask(parentId, subtask.id, { completed: !subtask.completed });
    }
    setSubtaskSwipeState(null);
  }, [swipeEnabled, subtaskSwipeState, deleteSubtask, updateSubtask]);

  return {
    swipeState,
    setSwipeState,
    subtaskSwipeState,
    SWIPE_ACTION_WIDTH,
    handleFlatTouchStart,
    handleFlatTouchMove,
    handleFlatTouchEnd,
    handleSwipeAction,
    handleSubtaskSwipeStart,
    handleSubtaskSwipeMove,
    handleSubtaskSwipeEnd,
  };
};
