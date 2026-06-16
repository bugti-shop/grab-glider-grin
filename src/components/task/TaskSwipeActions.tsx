import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Check as CheckIcon, Pin, FolderInput, Trash2, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

const SWIPE_THRESHOLD = 60;
const SWIPE_ACTION_WIDTH = 70;

interface TaskSwipeActionsProps {
  children: React.ReactNode;
  isPinned?: boolean;
  isCompleted?: boolean;
  isSelectionMode?: boolean;
  onComplete: () => void;
  onUncomplete: () => void;
  onDelete: () => void;
  onMoveTask?: () => void;
  onSetDate?: () => void;
  onTogglePin?: () => void;
  onTap: () => void;
}

export function useSwipeState() {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const swipeStartX = useRef<number | null>(null);
  const didSwipeRef = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touchX = e.touches[0].clientX;
    const touchY = e.touches[0].clientY;
    touchStartPos.current = { x: touchX, y: touchY };
    swipeStartX.current = touchX;
    didSwipeRef.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStartPos.current || !swipeStartX.current) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - swipeStartX.current;
    const deltaY = Math.abs(currentY - touchStartPos.current.y);

    if (deltaY > 30 && !isSwiping) return;

    if (Math.abs(deltaX) > 25) {
      setIsSwiping(true);
      didSwipeRef.current = true;
      const maxSwipeRight = SWIPE_ACTION_WIDTH * 2;
      const maxSwipeLeft = SWIPE_ACTION_WIDTH * 3;
      setSwipeOffset(Math.max(-maxSwipeLeft, Math.min(maxSwipeRight, deltaX)));
    }
  }, [isSwiping]);

  const resetSwipe = useCallback(() => {
    setSwipeOffset(0);
    setIsSwiping(false);
    touchStartPos.current = null;
    swipeStartX.current = null;
  }, []);

  return {
    swipeOffset,
    setSwipeOffset,
    isSwiping,
    setIsSwiping,
    didSwipeRef,
    handleTouchStart,
    handleTouchMove,
    resetSwipe,
    touchStartPos,
    swipeStartX,
  };
}

export const TaskSwipeActions = ({
  children,
  isPinned,
  isCompleted,
  isSelectionMode,
  onComplete,
  onUncomplete,
  onDelete,
  onMoveTask,
  onSetDate,
  onTogglePin,
  onTap,
}: TaskSwipeActionsProps) => {
  const { t } = useTranslation();
  const {
    swipeOffset, setSwipeOffset,
    isSwiping, setIsSwiping,
    didSwipeRef,
    handleTouchStart, handleTouchMove,
    resetSwipe, touchStartPos, swipeStartX,
  } = useSwipeState();

  const handleSwipeAction = async (action: () => void) => {
    try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {}
    action();
    setSwipeOffset(0);
  };

  const handleTouchEnd = async () => {
    if (isSwiping) {
      const maxSwipeRight = SWIPE_ACTION_WIDTH * 2;
      const maxSwipeLeft = SWIPE_ACTION_WIDTH * 3;

      if (swipeOffset > SWIPE_THRESHOLD) {
        try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {}
        setSwipeOffset(maxSwipeRight);
        setIsSwiping(false);
        touchStartPos.current = null;
        swipeStartX.current = null;
        return;
      } else if (swipeOffset < -SWIPE_THRESHOLD) {
        try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {}
        setSwipeOffset(-maxSwipeLeft);
        setIsSwiping(false);
        touchStartPos.current = null;
        swipeStartX.current = null;
        return;
      }
    }

    const wasTap = !didSwipeRef.current;
    resetSwipe();

    if (wasTap && swipeOffset === 0 && !isSelectionMode) {
      onTap();
    }
  };

  return (
    <div className="relative overflow-hidden">
      {/* Left actions (swipe right) */}
      <div
        className="absolute left-0 top-0 bottom-0 flex items-center"
        style={{ opacity: swipeOffset > 0 ? 1 : 0 }}
      >
        <button
          onClick={() => handleSwipeAction(isCompleted ? onUncomplete : onComplete)}
          className="flex flex-col items-center justify-center w-[70px] h-full bg-emerald-500 text-white"
        >
          <CheckIcon className="h-5 w-5" />
          <span className="text-[10px] font-medium mt-1">{t('swipe.done', 'Done')}</span>
        </button>
        <button
          onClick={() => onTogglePin && handleSwipeAction(onTogglePin)}
          className="flex flex-col items-center justify-center w-[70px] h-full bg-amber-400 text-white"
        >
          <Pin className={cn("h-5 w-5", isPinned && "fill-current")} />
          <span className="text-[10px] font-medium mt-1">{t('swipe.pin', 'Pin')}</span>
        </button>
      </div>

      {/* Right actions (swipe left) */}
      <div
        className="absolute right-0 top-0 bottom-0 flex items-center"
        style={{ opacity: swipeOffset < 0 ? 1 : 0 }}
      >
        <button
          onClick={() => onMoveTask && handleSwipeAction(onMoveTask)}
          className="flex flex-col items-center justify-center w-[70px] h-full bg-blue-500 text-white"
        >
          <FolderInput className="h-5 w-5" />
          <span className="text-[10px] font-medium mt-1">{t('swipe.move', 'Move')}</span>
        </button>
        <button
          onClick={() => handleSwipeAction(onDelete)}
          className="flex flex-col items-center justify-center w-[70px] h-full bg-red-500 text-white"
        >
          <Trash2 className="h-5 w-5" />
          <span className="text-[10px] font-medium mt-1">{t('swipe.delete', 'Delete')}</span>
        </button>
        <button
          onClick={() => onSetDate && handleSwipeAction(onSetDate)}
          className="flex flex-col items-center justify-center w-[70px] h-full bg-amber-500 text-white"
        >
          <Calendar className="h-5 w-5" />
          <span className="text-[10px] font-medium mt-1">{t('swipe.date', 'Date')}</span>
        </button>
      </div>

      {/* Swipeable content wrapper */}
      <div
        className={cn('perf-gpu-layer', isSwiping ? '' : 'transition-transform duration-200')}
        style={{ transform: `translateX(${swipeOffset}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={() => resetSwipe()}
      >
        {children}
      </div>
    </div>
  );
};
