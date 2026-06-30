export type HabitFrequencyType = 'daily' | 'weekly' | 'interval';

export type HabitGoalType = 'all' | 'amount';

export type HabitDayStatus = 'done' | 'skipped' | 'failed';

/** 'build' = positive habit (default). 'avoid' = bad habit you're trying to quit. */
export type HabitKind = 'build' | 'avoid';

export interface HabitReminder {
  enabled: boolean;
  /** Time of day in HH:mm format */
  time: string;
  /**
   * Weekdays this reminder fires on (0=Sun..6=Sat).
   * Empty / undefined = every day.
   */
  days?: number[];
  /** Notification IDs for cancellation */
  notificationIds?: number[];
}

export interface HabitCompletionRecord {
  date: string; // YYYY-MM-DD
  completed: boolean;
  /** Optional tri-state status; 'done' implies completed, others mark as not-completed */
  status?: HabitDayStatus;
  /** Progress amount when goalType === 'amount' */
  amount?: number;
  /** Optional reflection note for the day */
  note?: string;
}

export interface HabitSection {
  id: string;
  name: string;
  order: number;
  /** Optional parent section id — one level of nesting. */
  parentSectionId?: string;
}

export type HabitDifficulty = 'easy' | 'medium' | 'hard';

export interface Habit {
  id: string;
  name: string;
  /** Emoji or icon key (e.g. "🍌" or "icon:apple") */
  emoji: string;
  /** Theme color (HSL or hex) */
  color: string;
  /** Motivational quote shown on detail */
  quote?: string;

  /** 'build' (default) or 'avoid' (bad habit). */
  kind?: HabitKind;

  /** Frequency configuration */
  frequency: HabitFrequencyType;
  /** For weekly habits with specific days (0=Sun..6=Sat) */
  weeklyDays?: number[];
  /** For weekly with count: N days per week (1-7) */
  weeklyCount?: number;
  /** For interval: every N days (>=2) */
  intervalDays?: number;

  /** Goal mode: achieve all, or reach a numeric amount */
  goalType?: HabitGoalType;
  goalAmount?: number;
  goalUnit?: string;

  /** ISO start date */
  startDate?: string;
  /** Number of days to pursue (0 = forever) */
  goalDays?: number;

  /** Section/category id */
  sectionId?: string;

  /**
   * Multiple daily reminders. New code should use this array.
   * Legacy single `reminder` is migrated into here on load.
   */
  reminders?: HabitReminder[];
  /** @deprecated kept for backward compatibility — migrated into `reminders` on load. */
  reminder?: HabitReminder;

  /** Auto pop-up habit log dialog after completion */
  autoPopupLog?: boolean;

  /** "Stack after": parent habit whose completion triggers this one. */
  chainAfterHabitId?: string;

  /** Target streak to aim for (legacy display) */
  targetStreak?: number;

  /** Completion history keyed by date */
  completions: HabitCompletionRecord[];
  /** Current streak count (cached) */
  currentStreak: number;
  /** Best streak ever (cached) */
  bestStreak: number;

  /** Subjective difficulty for filtering and effort awareness. */
  difficulty?: HabitDifficulty;

  /**
   * Day-count thresholds (e.g. 7, 30, 100) already celebrated for this habit.
   * Used to avoid re-firing milestone toasts.
   */
  unlockedMilestones?: number[];

  /**
   * Per-habit streak-freeze state. Defaults to 2 free passes per calendar
   * month, auto-consumed on missed scheduled days to keep streak intact.
   * Populated lazily by `applyStreakFreezes` — see `utils/habitFreezes.ts`.
   */
  freezeState?: {
    freezesPerMonth: number;
    freezesUsedThisMonth: number;
    freezeMonth: string;
    frozenDates: string[];
  };

  isArchived: boolean;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

/**
 * Normalize a habit loaded from storage — promotes the legacy single
 * `reminder` into the `reminders[]` array if needed. Idempotent.
 */
export const normalizeHabit = (h: Habit): Habit => {
  if (!h) return h;
  if (h.reminders && h.reminders.length > 0) return h;
  if (h.reminder && h.reminder.enabled && h.reminder.time) {
    return { ...h, reminders: [{ ...h.reminder }] };
  }
  return h;
};
