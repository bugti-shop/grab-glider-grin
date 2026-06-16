import { useState, useRef, useCallback } from 'react';
import { Check as CheckIcon, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerTripleHeavyHaptic } from '@/utils/haptics';
import { TASK_CIRCLE, TASK_CHECK_ICON } from '@/utils/taskItemStyles';
import { TaskCompletionBurst } from '@/components/TaskCompletionBurst';
import { getCurrentCombo } from '@/utils/comboSystem';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useTranslation } from 'react-i18next';

interface TaskCompletionCircleProps {
  completed: boolean;
  priorityColor: string;
  isBlocked: boolean;
  blockedByNames: string[];
  onComplete: () => void;
  onUncomplete: () => void;
}

export const TaskCompletionCircle = ({
  completed,
  priorityColor,
  isBlocked,
  blockedByNames,
  onComplete,
  onUncomplete,
}: TaskCompletionCircleProps) => {
  const { t } = useTranslation();
  const [pendingComplete, setPendingComplete] = useState(false);
  const [showBurst, setShowBurst] = useState(false);
  const [burstIntensity, setBurstIntensity] = useState<'normal' | 'combo' | 'milestone'>('normal');
  const pendingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleBurstDone = useCallback(() => setShowBurst(false), []);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isBlocked) return;

    if (completed || pendingComplete) {
      if (pendingTimer.current) {
        clearTimeout(pendingTimer.current);
        pendingTimer.current = null;
      }
      setPendingComplete(false);
      setShowBurst(false);
      if (completed) onUncomplete();
      return;
    }

    // Determine burst intensity based on combo state
    const combo = getCurrentCombo();
    setBurstIntensity(combo.multiplier >= 4 ? 'milestone' : combo.isActive ? 'combo' : 'normal');
    setPendingComplete(true);
    setShowBurst(true);
    triggerTripleHeavyHaptic();

    pendingTimer.current = setTimeout(() => {
      setPendingComplete(false);
      pendingTimer.current = null;
      onComplete();
    }, 400);
  };

  return (
    <div className={cn("relative flex items-center flex-shrink-0", TASK_CIRCLE.marginTop)}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="relative">
              <button
                disabled={isBlocked}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchMove={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
                onClick={handleClick}
                className={cn(
                  TASK_CIRCLE.base,
                  TASK_CIRCLE.size,
                  completed && TASK_CIRCLE.completed,
                  pendingComplete && TASK_CIRCLE.pending,
                  isBlocked && TASK_CIRCLE.blocked,
                )}
                style={{
                  borderColor: (completed || pendingComplete) ? undefined : priorityColor,
                  backgroundColor: pendingComplete ? priorityColor : undefined,
                }}
              >
                {(completed || pendingComplete) && (
                  <CheckIcon
                    className={cn(
                      TASK_CHECK_ICON.base,
                      TASK_CHECK_ICON.size,
                      pendingComplete && TASK_CHECK_ICON.pendingAnimation,
                    )}
                    style={{
                      color: pendingComplete ? TASK_CHECK_ICON.pendingColor : TASK_CHECK_ICON.completedColor,
                    }}
                    strokeWidth={TASK_CHECK_ICON.strokeWidth}
                  />
                )}
              </button>
              {isBlocked && <Lock className="absolute -top-1 -right-1 h-3 w-3 text-warning" />}
              {showBurst && <TaskCompletionBurst onDone={handleBurstDone} intensity={burstIntensity} />}
            </div>
          </TooltipTrigger>
          {isBlocked && (
            <TooltipContent>
              <p className="text-xs">
                {t('tasks.blockedBy', 'Blocked by')}: {blockedByNames.slice(0, 2).join(', ')}
                {blockedByNames.length > 2 ? ` +${blockedByNames.length - 2}` : ''}
              </p>
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};
