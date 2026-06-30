// Habit importers for Loop Habit Tracker, HabitNow, and Streaks.
// Each parser returns app-native `Habit` records ready to save.
//
// Supported formats (auto-detected from file shape):
//   • Loop CSV (wide):   Date,HabitA,HabitB,...     cell 1/2 = done
//   • Loop CSV (checkmarks): per-habit "Checkmarks.csv" with Date,Value
//   • HabitNow JSON:     [{name, color, checkIns:[{date,value}], ...}]
//   • Generic habit CSV: name[,emoji,color,frequency,difficulty]

import { Habit, HabitCompletionRecord, normalizeHabit } from '@/types/habit';
import { DEFAULT_HABIT_COLOR, HABIT_COLOR_SWATCHES } from '@/utils/habitColors';
import { DEFAULT_HABIT_SECTION_ID } from '@/utils/habitSectionsStorage';
import { genId } from '@/utils/genId';

export type HabitImportSource = 'loop' | 'habitnow' | 'streaks' | 'generic-csv' | 'auto';

export interface HabitImportResult {
  habits: Habit[];
  source: HabitImportSource;
  warnings: string[];
}

// ─── CSV helpers (lightweight; mirrors importData.ts) ─────────────
const parseCSVLine = (line: string): string[] => {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q;
    } else if (ch === ',' && !q) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
};

const parseCSV = (text: string): string[][] =>
  text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map(parseCSVLine);

const swatchFor = (i: number): string =>
  HABIT_COLOR_SWATCHES[i % HABIT_COLOR_SWATCHES.length];

const blankHabit = (name: string, color: string): Habit => {
  const now = new Date().toISOString();
  return normalizeHabit({
    id: genId(),
    name: name.trim() || 'Imported habit',
    emoji: '✨',
    color,
    frequency: 'daily',
    weeklyDays: [0, 1, 2, 3, 4, 5, 6],
    goalType: 'all',
    sectionId: DEFAULT_HABIT_SECTION_ID,
    completions: [],
    currentStreak: 0,
    bestStreak: 0,
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  });
};

// ─── Loop Habit Tracker (wide CSV) ─────────────────────────────────
// Header row: Date, Habit1, Habit2, ...
// Cells: empty/-1/0 = skip, 1/2/positive = completed.
const parseLoopWide = (rows: string[][]): Habit[] => {
  const [header, ...body] = rows;
  const names = header.slice(1).map((h) => h.trim()).filter(Boolean);
  const habits = names.map((n, i) => blankHabit(n, swatchFor(i)));

  for (const row of body) {
    const date = (row[0] || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    for (let c = 0; c < names.length; c++) {
      const raw = (row[c + 1] || '').trim();
      const num = Number(raw);
      const done = !isNaN(num) && num > 0;
      if (!done) continue;
      habits[c].completions.push({ date, completed: true, status: 'done' });
    }
  }
  return habits;
};

// ─── HabitNow (JSON) ───────────────────────────────────────────────
const parseHabitNowJSON = (text: string): Habit[] => {
  const data = JSON.parse(text);
  const list: any[] = Array.isArray(data) ? data : (data?.habits ?? []);
  return list.map((raw, i) => {
    const h = blankHabit(String(raw.name || raw.title || 'Habit'), swatchFor(i));
    if (typeof raw.color === 'string' && raw.color.startsWith('#')) h.color = raw.color;
    if (typeof raw.icon === 'string') h.emoji = raw.icon;
    if (raw.frequency === 'WEEKLY' || raw.type === 'weekly') h.frequency = 'weekly';
    const checks: any[] = raw.checkIns || raw.entries || raw.history || [];
    for (const c of checks) {
      const date = String(c.date || c.day || '').slice(0, 10);
      const val = Number(c.value ?? c.status ?? 1);
      if (/^\d{4}-\d{2}-\d{2}$/.test(date) && val > 0) {
        h.completions.push({ date, completed: true, status: 'done' });
      }
    }
    return h;
  });
};

// ─── Streaks (CSV: Date,Habit1,Habit2,... — same shape as Loop) ──
const parseStreaksCSV = parseLoopWide;

// ─── Generic CSV (definition rows: name,emoji,color,frequency) ───
const parseGenericCSV = (rows: string[][]): Habit[] => {
  const [header, ...body] = rows;
  const lower = header.map((h) => h.trim().toLowerCase());
  const idx = (key: string) => lower.findIndex((h) => h === key);
  const ni = idx('name');
  if (ni < 0) return [];
  const ei = idx('emoji');
  const ci = idx('color');
  const fi = idx('frequency');
  const di = idx('difficulty');

  return body.map((row, i) => {
    const h = blankHabit(row[ni], swatchFor(i));
    if (ei >= 0 && row[ei]) h.emoji = row[ei];
    if (ci >= 0 && row[ci] && row[ci].startsWith('#')) h.color = row[ci];
    if (fi >= 0) {
      const f = row[fi]?.toLowerCase();
      if (f === 'weekly' || f === 'interval' || f === 'daily') h.frequency = f as any;
    }
    if (di >= 0) {
      const d = row[di]?.toLowerCase();
      if (d === 'easy' || d === 'medium' || d === 'hard') h.difficulty = d as any;
    }
    return h;
  });
};

// ─── Auto-detect entry point ──────────────────────────────────────
export const importHabits = (
  text: string,
  fileName: string,
  forced?: HabitImportSource
): HabitImportResult => {
  const warnings: string[] = [];
  const lower = fileName.toLowerCase();
  const isJSON = lower.endsWith('.json') || text.trim().startsWith('{') || text.trim().startsWith('[');

  let source: HabitImportSource = forced && forced !== 'auto' ? forced : 'auto';

  if (source === 'auto') {
    if (isJSON) source = 'habitnow';
    else if (lower.includes('loop')) source = 'loop';
    else if (lower.includes('streak')) source = 'streaks';
    else source = 'generic-csv';
  }

  let habits: Habit[] = [];
  try {
    if (source === 'habitnow') {
      habits = parseHabitNowJSON(text);
    } else {
      const rows = parseCSV(text);
      if (rows.length < 2) {
        return { habits: [], source, warnings: ['File is empty or unreadable.'] };
      }
      const header = rows[0].map((h) => h.trim().toLowerCase());
      // Detect generic definition rows when "name" column exists and "date" doesn't.
      if (source === 'generic-csv' || (header.includes('name') && !header.includes('date'))) {
        source = 'generic-csv';
        habits = parseGenericCSV(rows);
      } else if (source === 'streaks') {
        habits = parseStreaksCSV(rows);
      } else {
        habits = parseLoopWide(rows);
      }
    }
  } catch (e: any) {
    return { habits: [], source, warnings: [`Could not parse file: ${e?.message ?? e}`] };
  }

  // Strip empty-name rows, dedupe by name (last wins).
  const byName = new Map<string, Habit>();
  for (const h of habits) {
    const key = h.name.trim().toLowerCase();
    if (!key) continue;
    byName.set(key, h);
  }
  const final = Array.from(byName.values());
  if (final.length === 0) warnings.push('No habits detected — please check the file format.');
  return { habits: final, source, warnings };
};
