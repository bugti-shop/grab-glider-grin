export type HabitFrequencyType = 'daily' | 'weekly' | 'interval';

export type HabitGoalType = 'all' | 'amount';

export type HabitDayStatus = 'done' | 'skipped' | 'failed';

export interface HabitReminder {
  enabled: boolean;
  /** Time of day in HH:mm format */
  time: string;
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
}

export interface Habit {
  id: string;
  name: string;
  /** Emoji or icon key (e.g. "🍌" or "icon:apple") */
  emoji: string;
  /** Theme color (HSL or hex) */
  color: string;
  /** Motivational quote shown on detail */
  quote?: string;

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

  /** Daily reminder */
  reminder?: HabitReminder;

  /** Auto pop-up habit log dialog after completion */
  autoPopupLog?: boolean;

  /** Target streak to aim for (legacy display) */
  targetStreak?: number;

  /** Completion history keyed by date */
  completions: HabitCompletionRecord[];
  /** Current streak count (cached) */
  currentStreak: number;
  /** Best streak ever (cached) */
  bestStreak: number;

  isArchived: boolean;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}
