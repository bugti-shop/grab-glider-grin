// Data-only registry of every feature discovery tour in Flowist.
// Add new tours here — no JSX, no imports from components.

export type TourCategory =
  | 'tasks'
  | 'notes'
  | 'notebooks'
  | 'progress'
  | 'journeys'
  | 'settings';

export type TourTrigger =
  | 'first-visit'
  | 'empty-state'
  | 'manual-only'
  | 'days-since-install';

export interface FeatureTourStep {
  /** CSS selector or [data-tour="id"] attribute of the element to spotlight. */
  elementSelector: string;
  title: string;
  description: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** If true, this step is skipped when the target isn't in the DOM (rather than failing the tour). */
  optional?: boolean;
}

export interface FeatureTour {
  id: string;
  category: TourCategory;
  title: string;
  shortDescription: string;
  /** Route to navigate to before the tour starts. */
  route: string;
  trigger: TourTrigger;
  triggerConfig?: { days?: number };
  /** Marks features that are behind Flowist Pro — shown as a small badge in the guide. */
  premium?: boolean;
  steps: FeatureTourStep[];
}

export const FEATURE_TOURS: FeatureTour[] = [
  // ─── Tasks & Boards ──────────────────────────────────────────────
  {
    id: 'task-add-basics',
    category: 'tasks',
    title: 'Add a task the smart way',
    shortDescription: 'Templates, dates, and deadlines — right where you type.',
    route: '/todo/today',
    trigger: 'first-visit',
    steps: [
      {
        elementSelector: '[data-tour="task-input"]',
        title: 'Type a task',
        description: 'Start typing to add a task. Press Enter to save and keep going.',
        side: 'top',
      },
      {
        elementSelector: '[data-tour="task-templates"]',
        title: 'Reuse with templates',
        description: 'Save frequent tasks as templates so you can add them in one tap.',
        side: 'top',
        optional: true,
      },
      {
        elementSelector: '[data-tour="task-date"]',
        title: 'Schedule and set deadlines',
        description: 'Pick a due date, deadline, or repeat pattern from the toolbar.',
        side: 'top',
        optional: true,
      },
    ],
  },
  {
    id: 'task-views',
    category: 'tasks',
    title: 'Switch task views',
    shortDescription: 'Flat, Kanban, Status, Timeline, or Priority — your tasks, your way.',
    route: '/todo/today',
    trigger: 'manual-only',
    steps: [
      {
        elementSelector: '[data-tour="task-menu"]',
        title: 'Open the task menu',
        description: 'Tap ⋮ to switch layout — try Kanban or Timeline for a new perspective.',
        side: 'left',
      },
    ],
  },
  {
    id: 'task-toolbar-power',
    category: 'tasks',
    title: 'Power tools in the task menu',
    shortDescription: 'Group by, filter, bulk-add, and CSV import/export.',
    route: '/todo/today',
    trigger: 'manual-only',
    steps: [
      {
        elementSelector: '[data-tour="task-menu"]',
        title: 'Group, filter, import & export',
        description: 'The ⋮ menu holds Group By, Filter, Add Multiple, and CSV import/export.',
        side: 'left',
      },
    ],
  },

  // ─── Notes ────────────────────────────────────────────────────────
  {
    id: 'note-types',
    category: 'notes',
    title: '6 note types for every thought',
    shortDescription: 'Sticky, Lined, Regular, Code, Sketch, and LinkedIn Formatter.',
    route: '/notesdashboard',
    trigger: 'empty-state',
    steps: [
      {
        elementSelector: '[data-tour="new-note-button"]',
        title: 'Pick a note type',
        description: 'Tap here and choose Sticky, Lined, Code, Sketch, or the LinkedIn Formatter.',
        side: 'top',
      },
    ],
  },

  // ─── Notebooks & Folders ─────────────────────────────────────────
  {
    id: 'notebooks-color-coding',
    category: 'notebooks',
    title: 'Color-coded notebooks',
    shortDescription: 'Group notes into notebooks with a color that fits the topic.',
    route: '/notebooks',
    trigger: 'first-visit',
    steps: [
      {
        elementSelector: '[data-tour="add-notebook"]',
        title: 'Create your first notebook',
        description: 'Notebooks are color-coded folders for notes. Long-press one to rename or recolor.',
        side: 'top',
      },
    ],
  },

  // ─── Progress & Habits ───────────────────────────────────────────
  {
    id: 'progress-tab-overview',
    category: 'progress',
    title: 'Track habits & priorities',
    shortDescription: 'Habits, Eisenhower Matrix, and Choose Your Adventure — all in one place.',
    route: '/todo/progress',
    trigger: 'first-visit',
    steps: [
      {
        elementSelector: '[data-tour="progress-habits"]',
        title: 'Daily habits',
        description: 'Build streaks with a gallery of Life, Health, and Sports habits.',
        side: 'bottom',
        optional: true,
      },
      {
        elementSelector: '[data-tour="progress-matrix"]',
        title: 'Eisenhower Matrix',
        description: 'Your tasks auto-sort into 4 quadrants so you focus on what matters.',
        side: 'bottom',
        optional: true,
      },
      {
        elementSelector: '[data-tour="progress-journeys"]',
        title: 'Choose Your Adventure',
        description: 'Turn long-term goals into gamified journeys — Sail the Nile, Climb Everest, and more.',
        side: 'bottom',
        optional: true,
      },
    ],
  },

  // ─── Journeys ────────────────────────────────────────────────────
  {
    id: 'journeys-intro',
    category: 'journeys',
    title: 'Choose Your Adventure',
    shortDescription: 'Long-term goals become gamified task journeys.',
    route: '/todo/progress',
    trigger: 'manual-only',
    steps: [
      {
        elementSelector: '[data-tour="progress-journeys"]',
        title: 'Start a journey',
        description: 'Pick an adventure — every completed task moves you further along the map.',
        side: 'bottom',
        optional: true,
      },
    ],
  },

  // ─── Settings & Personalization ──────────────────────────────────
  {
    id: 'themes-personalize',
    category: 'settings',
    title: 'Personalize your theme',
    shortDescription: '9 themes plus a custom builder.',
    route: '/settings',
    trigger: 'manual-only',
    steps: [
      {
        elementSelector: '[data-tour="settings-appearance"]',
        title: 'Pick a look you love',
        description: 'Open Appearance to switch between 9 themes or design your own.',
        side: 'bottom',
        optional: true,
      },
    ],
  },
];

export const getTour = (id: string): FeatureTour | undefined =>
  FEATURE_TOURS.find((t) => t.id === id);

export const CATEGORY_LABELS: Record<TourCategory, string> = {
  tasks: 'Tasks & Boards',
  notes: 'Notes',
  notebooks: 'Notebooks & Folders',
  progress: 'Progress & Habits',
  journeys: 'Journeys',
  settings: 'Settings & Personalization',
};
