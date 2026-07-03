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
  /** Optional CSS selector to click BEFORE the tour starts (e.g. open a menu). */
  beforeStart?: string;
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
  {
    id: 'task-set-priority',
    category: 'tasks',
    title: 'Set a task priority',
    shortDescription: 'Open a task and choose Low / Medium / High / Urgent priority.',
    route: '/todo/today',
    trigger: 'manual-only',
    steps: [
      { elementSelector: '[data-tour="task-row"]', title: 'Open any task', description: 'Tap a task to open its details.', side: 'bottom', interactive: true },
      { elementSelector: '[data-tour="task-detail-options"]', title: 'Open the options menu', description: 'Tap the ⋮ menu at the top right.', side: 'bottom', interactive: true },
      { elementSelector: '[data-tour="task-detail-priority-item"]', title: 'Pick a priority', description: 'Choose Low, Medium, High, or Urgent.', side: 'left' },
    ],
  },
  {
    id: 'task-update-status',
    category: 'tasks',
    title: 'Update task status',
    shortDescription: 'Change a task between To-do, In progress, or Done.',
    route: '/todo/today',
    trigger: 'manual-only',
    steps: [
      { elementSelector: '[data-tour="task-row"]', title: 'Open any task', description: 'Tap a task to open its details.', side: 'bottom', interactive: true },
      { elementSelector: '[data-tour="task-detail-status"]', title: 'Change the status', description: 'Switch between To-do, In progress, or Done here.', side: 'top' },
    ],
  },
  hint('task-create-section', 'tasks', 'Create your first section', 'Group related tasks by adding a new section inside any list.', '/todo/today', { target: '[data-tour="todo-folders-section"]' }),
  hint('task-create-folder', 'tasks', 'Create your first folder', 'Organize multiple task lists together using folders in the sidebar.', '/todo/today', { target: '[data-tour="todo-folders-section"]' }),
  hint('task-focus-mode', 'tasks', 'Try Focus Mode', 'Start a Pomodoro session with an ambient background to focus deeply.', '/todo/today', { beforeStart: '[data-tour="todo-options-menu"]', target: '[data-tour="todo-options-menu"]' }),
  hint('task-switch-view', 'tasks', 'Switch view — Timeline or Kanban', 'Open the ⋮ menu and switch between Flat, Kanban, Status, Timeline, or Priority.', '/todo/today', { beforeStart: '[data-tour="todo-options-menu"]', target: '[data-tour="todo-options-menu"]' }),
  hint('task-journey', 'tasks', 'Choose your virtual journey', 'Turn long-term goals into a gamified adventure in Progress → Journeys.', '/todo/progress', { target: '[data-tour="progress-journeys"]' }),
  hint('task-create-habit', 'tasks', 'Create your first habit', 'Add a daily habit and start building streaks from the sidebar.', '/todo/progress'),
  hint('task-eisenhower', 'tasks', 'Add tasks via Eisenhower Matrix', 'Drop tasks into the 4 quadrants to focus on what matters most.', '/todo/progress'),
  hint('task-import', 'tasks', 'Import tasks', 'Bring in tasks from CSV using the ⋮ → Import option.', '/todo/today', { beforeStart: '[data-tour="todo-options-menu"]', target: '[data-tour="todo-options-menu"]' }),
  hint('task-batch-add', 'tasks', 'Add batch tasks', 'Open ⋮ → Add multiple to paste or type many tasks at once.', '/todo/today', { beforeStart: '[data-tour="todo-options-menu"]', target: '[data-tour="todo-options-menu"]' }),

  // ─── Notes ─────────────────────────────────────────────────────
  hint('notes-switch-dashboard', 'notes', 'Switch to Notes dashboard', 'Tap Notebooks in the bottom navigation to enter your notes workspace.', '/notesdashboard', { target: '[data-tour="switch-to-notes"]' }),
  hint('notes-create-first', 'notes', 'Create your first note', 'Tap "+" on the Notes dashboard and pick a note type.', '/notesdashboard', { target: '[data-tour="new-note-button"]' }),
  hint('notes-create-notebook', 'notes', 'Create your first notebook', 'Open the Notebooks tab and tap "+" to create a color-coded notebook.', '/notebooks', { target: '[data-tour="add-notebook"]' }),
  hint('notes-sketch', 'notes', 'Add a sketch note', 'Choose the Sketch note type to draw freehand with pens, colors & shapes.', '/notesdashboard', { target: '[data-tour="new-note-button"]' }),
  hint('notes-import', 'notes', 'Import notes', 'Bring notes in from Markdown or other apps via the notes ⋮ menu.', '/notesdashboard'),
  hint('notes-scan', 'notes', 'Scan notes from the editor toolbar', 'Inside any note, use the bottom toolbar scan button to capture handwritten pages.', '/notesdashboard', { premium: true }),
  hint('notes-editor-menu', 'notes', 'Explore all features in the notes editor menu', 'Open the ⋮ menu inside a note to unlock TOC, export, and more.', '/notesdashboard'),

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
