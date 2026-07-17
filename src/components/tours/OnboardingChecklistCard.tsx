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

const CHECKLIST_STATE_KEY = 'onboarding-checklist-v2';

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

interface ChecklistSection {
  id: string;
  title: string;
  items: ChecklistItem[];
}

interface Signals {
  // Tasks
  hasCreatedTask: boolean;
  hasUsedNaturalLanguage: boolean;
  hasScannedTasks: boolean;
  hasSetPriority: boolean;
  hasUpdatedStatus: boolean;
  hasCreatedSection: boolean;
  hasCreatedFolder: boolean;
  hasUsedFocusMode: boolean;
  hasSwitchedTaskView: boolean;
  hasChosenJourney: boolean;
  hasCreatedHabit: boolean;
  hasUsedEisenhower: boolean;
  hasImportedTasks: boolean;
  hasBatchAddedTasks: boolean;
  // Notes
  hasVisitedNotesDashboard: boolean;
  hasCreatedNote: boolean;
  hasCreatedNotebook: boolean;
  hasCreatedSketch: boolean;
  hasImportedNotes: boolean;
  hasScannedNote: boolean;
  hasExploredNotesMenu: boolean;
  // Personalization
  hasChangedTheme: boolean;
  hasSetupAppLock: boolean;
}

interface OnboardingChecklistCardProps {
  signals: Signals;
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

  const sections: ChecklistSection[] = useMemo(
    () => [
      {
        id: 'tasks',
        title: 'Tasks',
        items: [
          { id: 'task', label: 'Create your first task', done: signals.hasCreatedTask, actionLabel: 'Add a task', action: () => navigate('/todo/today') },
          { id: 'nl', label: 'Try natural language — e.g. "Buy groceries tomorrow at 6:46 PM"', done: signals.hasUsedNaturalLanguage, actionLabel: 'Try it', action: () => navigate('/todo/today') },
          { id: 'scan', label: 'Scan tasks from notes or screenshots (Premium + Sign-in)', done: signals.hasScannedTasks, actionLabel: 'Open', action: () => navigate('/todo/today') },
          { id: 'priority', label: 'Set a task priority', done: signals.hasSetPriority, actionLabel: 'Show me', action: () => navigate('/todo/today') },
          { id: 'status', label: 'Update task status', done: signals.hasUpdatedStatus, actionLabel: 'Show me', action: () => navigate('/todo/today') },
          { id: 'section', label: 'Create your first section', done: signals.hasCreatedSection, actionLabel: 'Show me', action: () => navigate('/todo/today') },
          { id: 'folder', label: 'Create your first folder', done: signals.hasCreatedFolder, actionLabel: 'Show me', action: () => navigate('/todo/today') },
          { id: 'focus', label: 'Try Focus Mode', done: signals.hasUsedFocusMode, actionLabel: 'Open Focus', action: () => navigate('/focus') },
          { id: 'view', label: 'Switch view — Timeline or Status', done: signals.hasSwitchedTaskView, actionLabel: 'Show me', action: () => start('task-views') },
          { id: 'journey', label: 'Choose your virtual journey', done: signals.hasChosenJourney, actionLabel: 'Pick one', action: () => navigate('/todo/progress') },
          { id: 'habit', label: 'Create your first habit', done: signals.hasCreatedHabit, actionLabel: 'Add habit', action: () => navigate('/todo/habits') },
          { id: 'eisenhower', label: 'Add tasks via Eisenhower Matrix', done: signals.hasUsedEisenhower, actionLabel: 'Open Matrix', action: () => navigate('/todo/eisenhower') },
          { id: 'import-tasks', label: 'Import tasks', done: signals.hasImportedTasks, actionLabel: 'Show me', action: () => navigate('/todo/today') },
          { id: 'batch-tasks', label: 'Add batch tasks', done: signals.hasBatchAddedTasks, actionLabel: 'Show me', action: () => navigate('/todo/today') },
        ],
      },
      {
        id: 'notes',
        title: 'Notes',
        items: [
          { id: 'notes-dash', label: 'Switch to Notes dashboard', done: signals.hasVisitedNotesDashboard, actionLabel: 'Open', action: () => navigate('/notesdashboard') },
          { id: 'note', label: 'Create your first note', done: signals.hasCreatedNote, actionLabel: 'Show me', action: () => start('note-types') },
          { id: 'notebook', label: 'Create your first notebook', done: signals.hasCreatedNotebook, actionLabel: 'Open Notebooks', action: () => navigate('/notebooks') },
          { id: 'sketch', label: 'Add a sketch note', done: signals.hasCreatedSketch, actionLabel: 'Show me', action: () => start('note-types') },
          { id: 'import-notes', label: 'Import notes', done: signals.hasImportedNotes, actionLabel: 'Show me', action: () => navigate('/notesdashboard') },
          { id: 'scan-note', label: 'Scan notes from the editor bottom navigation', done: signals.hasScannedNote, actionLabel: 'Show me', action: () => navigate('/notesdashboard') },
          { id: 'notes-menu', label: 'Explore all features in the Notes editor menu', done: signals.hasExploredNotesMenu, actionLabel: 'Show me', action: () => navigate('/notesdashboard') },
        ],
      },
      {
        id: 'personalization',
        title: 'Personalization',
        items: [
          { id: 'theme', label: 'Personalize your theme', done: signals.hasChangedTheme, actionLabel: 'Show me', action: () => start('themes-personalize') },
          { id: 'lock', label: 'Set up App Lock in Settings', done: signals.hasSetupAppLock, actionLabel: 'Open Settings', action: () => navigate('/settings') },
        ],
      },
    ],
    [signals, navigate, start],
  );

  const allItems = sections.flatMap((s) => s.items);
  const doneCount = allItems.filter((i) => i.done).length;
  const total = allItems.length;
  const percent = Math.round((doneCount / total) * 100);
  const allDone = doneCount === total;

  useEffect(() => {
    if (loaded && allDone && !state.dismissed) {
      persist({ ...state, dismissed: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allDone, loaded]);

  if (!loaded) return null;
  if (state.dismissed) return null;
  if (daysSinceInstall > 7 && doneCount === 0) return null;
  if (daysSinceInstall > 21) return null;

  return (
    <div className="mx-3 my-3 rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3">
        <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">Tutorial — Get started with Flowist</p>
          <p className="text-[11px] text-muted-foreground">{doneCount}/{total} done</p>
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
        <div className="px-2 py-2 max-h-[60vh] overflow-y-auto">
          {sections.map((section) => (
            <div key={section.id} className="mb-2">
              <p className="px-2 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {section.title}
              </p>
              <ul>
                {section.items.map((item) => (
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
                      <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={item.action}>
                        {item.actionLabel}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Self-sufficient host that reads onboarding signals directly from storage.
 * Emits `flowistOnboardingSignalChange` to refresh live.
 */
export const OnboardingChecklistCardAuto = () => {
  const [signals, setSignals] = useState<Signals>({
    hasCreatedTask: false,
    hasUsedNaturalLanguage: false,
    hasScannedTasks: false,
    hasSetPriority: false,
    hasUpdatedStatus: false,
    hasCreatedSection: false,
    hasCreatedFolder: false,
    hasUsedFocusMode: false,
    hasSwitchedTaskView: false,
    hasChosenJourney: false,
    hasCreatedHabit: false,
    hasUsedEisenhower: false,
    hasImportedTasks: false,
    hasBatchAddedTasks: false,
    hasVisitedNotesDashboard: false,
    hasCreatedNote: false,
    hasCreatedNotebook: false,
    hasCreatedSketch: false,
    hasImportedNotes: false,
    hasScannedNote: false,
    hasExploredNotesMenu: false,
    hasChangedTheme: false,
    hasSetupAppLock: false,
  });

  useEffect(() => {
    let cancelled = false;
    const compute = async () => {
      try {
        const [
          items,
          theme,
          viewMode,
          noteCountFlag,
          folders,
          sections,
          nlFlag,
          scannedTasksFlag,
          priorityFlag,
          statusFlag,
          focusFlag,
          journeyFlag,
          habitFlag,
          eisenhowerFlag,
          importTasksFlag,
          batchTasksFlag,
          visitedNotesFlag,
          notebookFlag,
          sketchFlag,
          importNotesFlag,
          scanNoteFlag,
          notesMenuFlag,
          appLockFlag,
        ] = await Promise.all([
          loadTodoItems().catch(() => []),
          getSetting<string>('theme', 'light'),
          getSetting<string>('todoViewMode', 'flat'),
          getSetting<boolean>('onboarding-has-note', false),
          getSetting<any[]>('todoFolders', []),
          getSetting<any[]>('taskSections', []),
          getSetting<boolean>('onboarding-used-nl', false),
          getSetting<boolean>('onboarding-scanned-tasks', false),
          getSetting<boolean>('onboarding-set-priority', false),
          getSetting<boolean>('onboarding-updated-status', false),
          getSetting<boolean>('onboarding-used-focus', false),
          getSetting<boolean>('onboarding-chose-journey', false),
          getSetting<boolean>('onboarding-created-habit', false),
          getSetting<boolean>('onboarding-used-eisenhower', false),
          getSetting<boolean>('onboarding-imported-tasks', false),
          getSetting<boolean>('onboarding-batch-tasks', false),
          getSetting<boolean>('onboarding-visited-notes', false),
          getSetting<boolean>('onboarding-created-notebook', false),
          getSetting<boolean>('onboarding-created-sketch', false),
          getSetting<boolean>('onboarding-imported-notes', false),
          getSetting<boolean>('onboarding-scanned-note', false),
          getSetting<boolean>('onboarding-explored-notes-menu', false),
          getSetting<boolean>('onboarding-app-lock', false),
        ]);
        if (cancelled) return;
        const userFolders = Array.isArray(folders) ? folders.filter((f: any) => !f?.isDefault) : [];
        setSignals({
          hasCreatedTask: (items?.length ?? 0) > 0,
          hasUsedNaturalLanguage: !!nlFlag,
          hasScannedTasks: !!scannedTasksFlag,
          hasSetPriority: !!priorityFlag,
          hasUpdatedStatus: !!statusFlag,
          hasCreatedSection: Array.isArray(sections) && sections.length > 0,
          hasCreatedFolder: userFolders.length > 0,
          hasUsedFocusMode: !!focusFlag,
          hasSwitchedTaskView: !!viewMode && viewMode !== 'flat',
          hasChosenJourney: !!journeyFlag,
          hasCreatedHabit: !!habitFlag,
          hasUsedEisenhower: !!eisenhowerFlag,
          hasImportedTasks: !!importTasksFlag,
          hasBatchAddedTasks: !!batchTasksFlag,
          hasVisitedNotesDashboard: !!visitedNotesFlag,
          hasCreatedNote: !!noteCountFlag,
          hasCreatedNotebook: !!notebookFlag,
          hasCreatedSketch: !!sketchFlag,
          hasImportedNotes: !!importNotesFlag,
          hasScannedNote: !!scanNoteFlag,
          hasExploredNotesMenu: !!notesMenuFlag,
          hasChangedTheme: !!theme && theme !== 'light',
          hasSetupAppLock: !!appLockFlag,
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
