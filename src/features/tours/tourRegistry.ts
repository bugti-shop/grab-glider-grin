// Data-only registry of every feature discovery tour in Flowist.
// Add new tours here — no JSX, no imports from components.

export type TourCategory = 'tasks' | 'notes' | 'personalization';

export type TourTrigger =
  | 'first-visit'
  | 'empty-state'
  | 'manual-only'
  | 'days-since-install';

export interface FeatureTourStep {
  elementSelector: string;
  title: string;
  description: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  optional?: boolean;
  /** If true, advance the tour when the user clicks the highlighted element
   *  (instead of dismissing). Used for guided click-through flows. */
  interactive?: boolean;
}

export interface FeatureTour {
  id: string;
  category: TourCategory;
  title: string;
  shortDescription: string;
  route: string;
  trigger: TourTrigger;
  triggerConfig?: { days?: number };
  premium?: boolean;
  /** Optional CSS selector(s) to click BEFORE the tour starts (e.g. open a menu).
   *  Provide an array to click multiple targets in sequence, each waited-for. */
  beforeStart?: string | string[];
  steps: FeatureTourStep[];
}


// Helper: build a single-step tour that highlights a specific selector
// (falls back to <body> if no target is given).
const hint = (
  id: string,
  category: TourCategory,
  title: string,
  shortDescription: string,
  route: string,
  extras: Partial<FeatureTour> & { target?: string; side?: 'top' | 'bottom' | 'left' | 'right' } = {},
): FeatureTour => {
  const { target, side, ...rest } = extras;
  const selector = target ?? 'body';
  return {
    id,
    category,
    title,
    shortDescription,
    route,
    trigger: 'manual-only',
    steps: [
      {
        elementSelector: selector,
        title,
        description: shortDescription,
        side: side ?? 'bottom',
        optional: true,
      },
    ],
    ...rest,
  };
};

export const FEATURE_TOURS: FeatureTour[] = [
  // ─── Tasks ─────────────────────────────────────────────────────
  hint('task-create-first', 'tasks', 'Create your first task', 'Tap the task input at the top of Today and type your first task.', '/todo/today', { target: '[data-tour="todo-add-task"]' }),
  hint('task-natural-language', 'tasks', 'Try natural language input', 'Type e.g. "Buy Groceries tomorrow at 6:46 PM" — Flowist auto-parses date & time.', '/todo/today', { beforeStart: '[data-tour="todo-add-task"]', target: '[data-tour="task-input-sheet-input"]' }),
  hint('task-scan-from-image', 'tasks', 'Scan tasks from notes or screenshots', 'Use the AI scanner to extract tasks from a photo or screenshot.', '/todo/today', { premium: true, beforeStart: '[data-tour="todo-add-task"]', target: '[data-tour="task-input-scan-button"]' }),
  hint('task-set-priority', 'tasks', 'Set a task priority', 'Pick High, Medium, Low or None to sort what matters most.', '/todo/today', { beforeStart: ['event:flowist-tour-open-first-task', '[data-tour="task-detail-options"]'], target: '[data-tour="task-detail-priority-group"]', side: 'left' }),
  hint('task-update-status', 'tasks', 'Update task status', 'Switch a task between To-do, In progress, or Done from the detail page.', '/todo/today', { beforeStart: 'event:flowist-tour-open-first-task', target: '[data-tour="task-detail-status"]', side: 'top' }),
  hint('task-create-section', 'tasks', 'Create your first section', 'Group related tasks by adding a new section inside any list.', '/todo/today', { beforeStart: '[data-tour="todo-options-menu"]', target: '[data-tour="todo-menu-add-section"]', side: 'left' }),
  hint('task-create-folder', 'tasks', 'Create your first folder', 'Organize multiple task lists together using folders in the sidebar.', '/todo/today', { beforeStart: '[data-tour="todo-options-menu"]', target: '[data-tour="todo-menu-manage-folders"]', side: 'left' }),
  hint('task-focus-mode', 'tasks', 'Try Focus Mode', 'Start a Pomodoro session with an ambient background to focus deeply.', '/todo/today', { beforeStart: 'event:flowist-tour-open-first-task', target: '[data-tour="task-detail-focus-mode"]', side: 'top' }),
  hint('task-switch-view', 'tasks', 'Switch view — Timeline or Kanban', 'Open the ⋮ menu and switch between Flat, Kanban, Status, Timeline, or Priority.', '/todo/today', { beforeStart: '[data-tour="todo-options-menu"]', target: '[data-tour="todo-menu-view-modes"]', side: 'left' }),
  hint('task-journey', 'tasks', 'Choose your virtual journey', 'Turn long-term goals into a gamified adventure in Progress → Journeys.', '/todo/progress', { target: '[data-tour="progress-journeys"]' }),
  hint('task-create-habit', 'tasks', 'Create your first habit', 'Add a daily habit and start building streaks from the sidebar.', '/todo/settings', { beforeStart: '[data-tour="settings-more-tabs"]', target: '[data-tour="settings-habit-tracker"]', side: 'top' }),
  hint('task-eisenhower', 'tasks', 'Add tasks via Eisenhower Matrix', 'Drop tasks into the 4 quadrants to focus on what matters most.', '/todo/settings', { beforeStart: '[data-tour="settings-more-tabs"]', target: '[data-tour="settings-eisenhower-matrix"]', side: 'top' }),
  hint('task-import', 'tasks', 'Import tasks', 'Bring in tasks from CSV using the ⋮ → Import option.', '/todo/today', { beforeStart: '[data-tour="todo-options-menu"]', target: '[data-tour="todo-menu-import-tasks"]', side: 'left' }),
  hint('task-batch-add', 'tasks', 'Add batch tasks', 'Open ⋮ → Add multiple to paste or type many tasks at once.', '/todo/today', { beforeStart: '[data-tour="todo-options-menu"]', target: '[data-tour="todo-menu-batch-tasks"]', side: 'left' }),

  // ─── Notes ─────────────────────────────────────────────────────
  hint('notes-switch-dashboard', 'notes', 'Switch to Notes dashboard', 'Tap the notes icon in the header to jump into your notes workspace.', '/todo/today', { target: '[data-tour="switch-to-notes"]', side: 'bottom' }),
  hint('notes-create-first', 'notes', 'Create your first note', 'Tap "+" on the Notes dashboard and pick a note type.', '/notesdashboard', { target: '[data-tour="new-note-button"]' }),
  hint('notes-create-notebook', 'notes', 'Create your first notebook', 'Open the Notebooks tab and tap "+" to create a color-coded notebook.', '/notebooks', { target: '[data-tour="add-notebook"]' }),
  hint('notes-sketch', 'notes', 'Add a sketch note', 'Choose the Sketch note type to draw freehand with pens, colors & shapes.', '/notesdashboard', { beforeStart: '[data-tour="new-note-button"]', target: '[data-tour="note-type-sketch"]', side: 'left' }),
  hint('notes-import', 'notes', 'Import notes', 'Bring notes in from Markdown or other apps via the notes ⋮ menu.', '/notesdashboard'),
  hint('notes-scan', 'notes', 'Scan notes from the editor toolbar', 'Inside any note, use the bottom toolbar scan button to capture handwritten pages.', '/notesdashboard', { premium: true, beforeStart: 'event:flowist-tour-open-first-regular-note', target: '[data-tour="editor-toolbar-scan"]', side: 'top' }),
  hint('notes-editor-menu', 'notes', 'Explore all features in the notes editor menu', 'Open the ⋮ menu inside a note to unlock TOC, export, and more.', '/notesdashboard', { beforeStart: ['event:flowist-tour-open-first-regular-note', '[data-tour="note-options-menu"]'], target: '[data-tour="note-extract-group"]', side: 'left' }),

  // ─── Personalization ──────────────────────────────────────────
  hint('personalize-theme', 'personalization', 'Personalize your theme', 'Open Settings → Appearance to switch between 9 themes or design your own.', '/settings', { target: '[data-tour="settings-appearance"]' }),
  hint('personalize-app-lock', 'personalization', 'Setup App Lock in Settings', 'Turn on App Lock in Settings to protect Flowist with a passcode or biometrics.', '/settings', { target: '[data-tour="settings-security"]' }),
];


export const getTour = (id: string): FeatureTour | undefined =>
  FEATURE_TOURS.find((t) => t.id === id);

export const CATEGORY_LABELS: Record<TourCategory, string> = {
  tasks: 'Tasks',
  notes: 'Notes',
  personalization: 'Personalization',
};

/**
 * Ordered onboarding chain — matches the "Features" list in FeatureGuideModal
 * top-to-bottom. New users are auto-walked through this sequence:
 *   • The first tour fires when the welcome sheet closes.
 *   • When the user completes the action (or clicks "Next"), the next tour
 *     in the chain fires automatically.
 * Tours already marked seen are skipped so no one is re-walked through
 * features they've already learned.
 */
export const ONBOARDING_CHAIN: string[] = [
  // Tasks
  'task-create-first',
  'task-natural-language',
  'task-scan-from-image',
  'task-set-priority',
  'task-update-status',
  'task-create-section',
  'task-create-folder',
  'task-focus-mode',
  'task-switch-view',
  'task-journey',
  'task-create-habit',
  'task-eisenhower',
  'task-import',
  'task-batch-add',
  // Notes
  'notes-switch-dashboard',
  'notes-create-first',
  'notes-create-notebook',
  'notes-sketch',
  'notes-import',
  'notes-scan',
  'notes-editor-menu',
  // Personalization
  'personalize-theme',
  'personalize-app-lock',
];

/** ID of the tour that runs right after the given one finishes, or null at the end. */
export const nextOnboardingTourId = (currentId: string): string | null => {
  const idx = ONBOARDING_CHAIN.indexOf(currentId);
  if (idx === -1 || idx === ONBOARDING_CHAIN.length - 1) return null;
  return ONBOARDING_CHAIN[idx + 1];
};

export const firstOnboardingTourId = (): string => ONBOARDING_CHAIN[0];

