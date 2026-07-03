import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronDown, ChevronUp, Sparkles, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

import { getSetting, setSetting } from '@/utils/settingsStorage';
import { getDaysSinceInstall } from '@/features/tours/TourStateStore';
import { useFeatureTour } from '@/features/tours/useFeatureTour';
import { loadTodoItems } from '@/utils/todoItemsStorage';


const CHECKLIST_STATE_KEY = 'onboarding-checklist-v1';

interface ChecklistState {
  dismissed: boolean;
  collapsed: boolean;
}

interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  action: () => void;
  actionLabel: string;
}

interface OnboardingChecklistCardProps {
  /** Live signals from the parent screen so items can auto-check without user intervention. */
  signals: {
    hasCreatedTask: boolean;
    hasCreatedNote: boolean;
    hasSwitchedTaskView: boolean;
    hasVisitedProgress: boolean;
    hasChangedTheme: boolean;
  };
}

export const OnboardingChecklistCard = ({ signals }: OnboardingChecklistCardProps) => {
  const navigate = useNavigate();
  const { start } = useFeatureTour();
  const [state, setState] = useState<ChecklistState>({ dismissed: false, collapsed: false });
  const [daysSinceInstall, setDaysSinceInstall] = useState<number>(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const [stored, days] = await Promise.all([
        getSetting<ChecklistState | null>(CHECKLIST_STATE_KEY, null),
        getDaysSinceInstall(),
      ]);
      if (stored) setState(stored);
      setDaysSinceInstall(days);
      setLoaded(true);
    })();
  }, []);

  const persist = (next: ChecklistState) => {
    setState(next);
    setSetting(CHECKLIST_STATE_KEY, next, { skipCloudSync: true }).catch(() => {});
  };

  const items: ChecklistItem[] = useMemo(
    () => [
      {
        id: 'task',
        label: 'Create your first task',
        done: signals.hasCreatedTask,
        actionLabel: 'Add a task',
        action: () => navigate('/todo/today'),
      },
      {
        id: 'note',
        label: 'Try a note type',
        done: signals.hasCreatedNote,
        actionLabel: 'Show me',
        action: () => start('note-types'),
      },
      {
        id: 'view',
        label: 'Switch a task view (Kanban / Timeline)',
        done: signals.hasSwitchedTaskView,
        actionLabel: 'Show me',
        action: () => start('task-views'),
      },
      {
        id: 'progress',
        label: 'Explore the Progress tab',
        done: signals.hasVisitedProgress,
        actionLabel: 'Open Progress',
        action: () => navigate('/todo/progress'),
      },
      {
        id: 'theme',
        label: 'Pick a theme you love',
        done: signals.hasChangedTheme,
        actionLabel: 'Show me',
        action: () => start('themes-personalize'),
      },
    ],
    [signals, navigate, start],
  );

  const doneCount = items.filter((i) => i.done).length;
  const total = items.length;
  const percent = Math.round((doneCount / total) * 100);
  const allDone = doneCount === total;

  // Auto-dismiss when everything is checked off.
  useEffect(() => {
    if (loaded && allDone && !state.dismissed) {
      persist({ ...state, dismissed: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDone, loaded]);

  if (!loaded) return null;
  if (state.dismissed) return null;
  if (daysSinceInstall > 7 && doneCount === 0) return null; // Never shown late for zero-activity users
  if (daysSinceInstall > 14) return null;

  return (
    <div className="mx-3 my-3 rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">Get started with Flowist</p>
          <p className="text-[11px] text-muted-foreground">
            {doneCount}/{total} done
          </p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => persist({ ...state, collapsed: !state.collapsed })}
          aria-label={state.collapsed ? 'Expand' : 'Collapse'}
        >
          {state.collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => persist({ ...state, dismissed: true })}
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <Progress value={percent} className="h-1 rounded-none" />
      {!state.collapsed && (
        <ul className="px-2 py-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-muted/40 transition-colors"
            >
              <div
                className={cn(
                  'h-5 w-5 rounded-full border flex items-center justify-center flex-shrink-0',
                  item.done
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'border-muted-foreground/40',
                )}
              >
                {item.done && <Check className="h-3 w-3" strokeWidth={3} />}
              </div>
              <span
                className={cn(
                  'flex-1 text-sm leading-tight',
                  item.done && 'text-muted-foreground line-through',
                )}
              >
                {item.label}
              </span>
              {!item.done && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs px-2"
                  onClick={item.action}
                >
                  {item.actionLabel}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/**
 * Self-sufficient host that reads onboarding signals directly from storage.
 * Drop this anywhere without passing signals — it re-reads on window focus
 * and on the custom `flowistOnboardingSignalChange` event.
 */
export const OnboardingChecklistCardAuto = () => {
  const [signals, setSignals] = useState({
    hasCreatedTask: false,
    hasCreatedNote: false,
    hasSwitchedTaskView: false,
    hasVisitedProgress: false,
    hasChangedTheme: false,
  });

  useEffect(() => {
    let cancelled = false;
    const compute = async () => {
      try {
        const [items, theme, viewMode, visitedProgress, noteCountFlag] = await Promise.all([
          loadTodoItems().catch(() => []),
          getSetting<string>('theme', 'light'),
          getSetting<string>('todoViewMode', 'flat'),
          getSetting<boolean>('onboarding-visited-progress', false),
          getSetting<boolean>('onboarding-has-note', false),
        ]);
        if (cancelled) return;
        setSignals({
          hasCreatedTask: (items?.length ?? 0) > 0,
          hasCreatedNote: !!noteCountFlag,
          hasSwitchedTaskView: !!viewMode && viewMode !== 'flat',
          hasVisitedProgress: !!visitedProgress,
          hasChangedTheme: !!theme && theme !== 'light',
        });
      } catch {
        /* ignore */
      }
    };
    void compute();
    const handler = () => void compute();
    window.addEventListener('focus', handler);
    window.addEventListener('flowistOnboardingSignalChange', handler);
    const interval = window.setInterval(compute, 15000);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', handler);
      window.removeEventListener('flowistOnboardingSignalChange', handler);
      window.clearInterval(interval);
    };
  }, []);

  return <OnboardingChecklistCard signals={signals} />;
};

