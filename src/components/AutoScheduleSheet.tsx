import { useEffect, useRef, useState } from 'react';
import { Sparkles, Loader2, Check, AlertTriangle, Zap } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAutoSchedule } from '@/hooks/useAutoSchedule';
import { TodoItem } from '@/types/note';

interface AutoScheduleSheetProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: TodoItem[];
  onApply: (updatedTasks: TodoItem[]) => void;
}

type Phase = 'idle' | 'running' | 'done' | 'cap' | 'empty' | 'error';

/**
 * Smart Auto-Schedule (Motion-style, one-tap).
 * Uses defaults: 09:00–17:00 Mon–Fri, 25-min blocks, 5-min buffer, 7 days ahead.
 * Runs immediately when opened; writes calendar events + task updates.
 */
export const AutoScheduleSheet = ({ isOpen, onClose, tasks, onApply }: AutoScheduleSheetProps) => {
  const { run, freeDailyLimit, isPro } = useAutoSchedule();
  const [phase, setPhase] = useState<Phase>('idle');
  const [count, setCount] = useState(0);
  const [unfit, setUnfit] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      startedRef.current = false;
      setPhase('idle');
      setCount(0);
      setUnfit(0);
      return;
    }
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      setPhase('running');
      const out = await run(tasks);
      setCount(out.scheduledCount);
      setUnfit(out.unscheduledCount);
      if (out.ok) {
        onApply(out.updatedTasks);
        setPhase('done');
        setTimeout(() => onClose(), 900);
      } else if (out.reason === 'cap_reached') {
        setPhase('cap');
      } else if (out.reason === 'no_tasks') {
        setPhase('empty');
      } else {
        setPhase('error');
      }
    })();
  }, [isOpen, run, tasks, onApply, onClose]);

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Smart Auto-Schedule
          </SheetTitle>
        </SheetHeader>

        <div className="py-6 flex flex-col items-center text-center gap-3 min-h-[220px] justify-center">
          {phase === 'running' && (
            <>
              <Loader2 className="h-10 w-10 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">
                Packing tasks into your free time blocks…
              </p>
              <p className="text-xs text-muted-foreground/70">
                9 AM–5 PM · 25-min blocks · avoiding your calendar events
              </p>
            </>
          )}

          {phase === 'done' && (
            <>
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Check className="h-6 w-6 text-primary" />
              </div>
              <p className="text-base font-medium">
                Scheduled {count} task{count === 1 ? '' : 's'}
              </p>
              {unfit > 0 && (
                <Badge variant="outline" className="text-xs">
                  {unfit} couldn't fit — try again tomorrow
                </Badge>
              )}
            </>
          )}

          {phase === 'empty' && (
            <>
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                <Sparkles className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">
                Nothing to schedule right now.
              </p>
              <p className="text-xs text-muted-foreground/70">
                Add tasks without due dates and try again.
              </p>
              <Button variant="outline" onClick={onClose} className="mt-2">Close</Button>
            </>
          )}

          {phase === 'cap' && (
            <>
              <div className="h-12 w-12 rounded-full bg-warning/10 flex items-center justify-center">
                <Zap className="h-6 w-6 text-warning" />
              </div>
              <p className="text-base font-medium">Daily limit reached</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Free plan includes {freeDailyLimit} auto-schedule runs per day.
                Upgrade to Pro for unlimited scheduling.
              </p>
              <div className="flex gap-2 mt-2">
                <Button variant="outline" onClick={onClose}>Later</Button>
                {!isPro && (
                  <Button onClick={() => { onClose(); window.dispatchEvent(new CustomEvent('openPremiumPaywall')); }}>
                    Upgrade
                  </Button>
                )}
              </div>
            </>
          )}

          {phase === 'error' && (
            <>
              <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <p className="text-sm text-muted-foreground">
                Something went wrong. Please try again.
              </p>
              <Button variant="outline" onClick={onClose} className="mt-2">Close</Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
