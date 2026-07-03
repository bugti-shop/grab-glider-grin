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


// Helper: build a single-step "hint" tour that just shows a popover on <body>.
const hint = (
  id: string,
  category: TourCategory,
  title: string,
  shortDescription: string,
  route: string,
  extras: Partial<FeatureTour> = {},
): FeatureTour => ({
  id,
  category,
  title,
  shortDescription,
  route,
  trigger: 'manual-only',
  steps: [
    {
      elementSelector: 'body',
      title,
      description: shortDescription,
      side: 'bottom',
      optional: true,
    },
  ],
  ...extras,
});

export const FEATURE_TOURS: FeatureTour[] = [
  // ─── Tasks ─────────────────────────────────────────────────────
  hint('task-create-first', 'tasks', 'Create your first task', 'Tap the task input at the top of Today and type your first task.', '/todo/today'),
  hint('task-natural-language', 'tasks', 'Try natural language input', 'Type e.g. "Buy Groceries tomorrow at 6:46 PM" — Flowist auto-parses date & time.', '/todo/today'),
  hint('task-scan-from-image', 'tasks', 'Scan tasks from notes or screenshots', 'Use the AI scanner to extract tasks from a photo or screenshot.', '/todo/today', { premium: true }),
  hint('task-set-priority', 'tasks', 'Set a task priority', 'Open a task and choose Low / Medium / High / Urgent priority.', '/todo/today'),
  hint('task-update-status', 'tasks', 'Update task status', 'Change a task between To-do, In progress, or Done from the task menu.', '/todo/today'),
  hint('task-create-section', 'tasks', 'Create your first section', 'Group related tasks by adding a new section inside any list.', '/todo/today'),
  hint('task-create-folder', 'tasks', 'Create your first folder', 'Organize multiple task lists together using folders in the sidebar.', '/todo/today'),
  hint('task-focus-mode', 'tasks', 'Try Focus Mode', 'Start a Pomodoro session with an ambient background to focus deeply.', '/todo/today'),
  hint('task-switch-view', 'tasks', 'Switch view — Timeline or Kanban', 'Open the ⋮ menu and switch between Flat, Kanban, Status, Timeline, or Priority.', '/todo/today'),
  hint('task-journey', 'tasks', 'Choose your virtual journey', 'Turn long-term goals into a gamified adventure in Progress → Journeys.', '/todo/progress'),
  hint('task-create-habit', 'tasks', 'Create your first habit', 'Add a daily habit and start building streaks from the sidebar.', '/todo/progress'),
  hint('task-eisenhower', 'tasks', 'Add tasks via Eisenhower Matrix', 'Drop tasks into the 4 quadrants to focus on what matters most.', '/todo/progress'),
  hint('task-import', 'tasks', 'Import tasks', 'Bring in tasks from CSV using the ⋮ → Import option.', '/todo/today'),
  hint('task-batch-add', 'tasks', 'Add batch tasks', 'Open ⋮ → Add multiple to paste or type many tasks at once.', '/todo/today'),

  // ─── Notes ─────────────────────────────────────────────────────
  hint('notes-switch-dashboard', 'notes', 'Switch to Notes dashboard', 'Tap Notebooks in the bottom navigation to enter your notes workspace.', '/notesdashboard'),
  hint('notes-create-first', 'notes', 'Create your first note', 'Tap "+" on the Notes dashboard and pick a note type.', '/notesdashboard'),
  hint('notes-create-notebook', 'notes', 'Create your first notebook', 'Open the Notebooks tab and tap "+" to create a color-coded notebook.', '/notebooks'),
  hint('notes-sketch', 'notes', 'Add a sketch note', 'Choose the Sketch note type to draw freehand with pens, colors & shapes.', '/notesdashboard'),
  hint('notes-import', 'notes', 'Import notes', 'Bring notes in from Markdown or other apps via the notes ⋮ menu.', '/notesdashboard'),
  hint('notes-scan', 'notes', 'Scan notes from the editor toolbar', 'Inside any note, use the bottom toolbar scan button to capture handwritten pages.', '/notesdashboard', { premium: true }),
  hint('notes-editor-menu', 'notes', 'Explore all features in the notes editor menu', 'Open the ⋮ menu inside a note to unlock TOC, export, and more.', '/notesdashboard'),

  // ─── Personalization ──────────────────────────────────────────
  hint('personalize-theme', 'personalization', 'Personalize your theme', 'Open Settings → Appearance to switch between 9 themes or design your own.', '/settings'),
  hint('personalize-app-lock', 'personalization', 'Setup App Lock in Settings', 'Turn on App Lock in Settings to protect Flowist with a passcode or biometrics.', '/settings'),
];

export const getTour = (id: string): FeatureTour | undefined =>
  FEATURE_TOURS.find((t) => t.id === id);

export const CATEGORY_LABELS: Record<TourCategory, string> = {
  tasks: 'Tasks',
  notes: 'Notes',
  personalization: 'Personalization',
};
