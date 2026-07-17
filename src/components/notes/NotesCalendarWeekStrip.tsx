import { useMemo, useState, useEffect } from 'react';
import {
  addDays,
  startOfWeek,
  isSameDay,
  format,
  addWeeks,
  subWeeks,
  isSameMonth,
} from 'date-fns';
import { ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Note, NoteType } from '@/types/note';
import {
  StickyNote,
  FileText,
  Pen,
  FileCode,
  Mic,
  BookOpen,
} from 'lucide-react';

interface NotesCalendarWeekStripProps {
  selectedDate: Date;
  onDateSelect: (date: Date) => void;
  notes: Note[];
  onSearchClick?: () => void;
  onMonthClick?: () => void;
}

const WEEK_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const ACCENT = '#7C5CFF'; // violet accent from reference

// Map note type -> icon + soft background
const typeMeta: Record<NoteType, { Icon: React.ComponentType<any>; tint: string }> = {
  sticky:  { Icon: StickyNote, tint: '#FEF3C7' },  // amber
  lined:   { Icon: FileText,   tint: '#DBEAFE' },  // blue
  regular: { Icon: BookOpen,   tint: '#EDE9FE' },  // violet
  code:    { Icon: FileCode,   tint: '#DCFCE7' },  // green
  voice:   { Icon: Mic,        tint: '#FCE7F3' },  // pink
  sketch:  { Icon: Pen,        tint: '#FEE2E2' },  // red
} as any;

const getTypeMeta = (t: NoteType) => typeMeta[t] ?? typeMeta.regular;

type Slot = 'morning' | 'afternoon' | 'evening';

const slotOf = (d: Date): Slot => {
  const h = d.getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'afternoon';
  return 'evening';
};

export const NotesCalendarWeekStrip = ({
  selectedDate,
  onDateSelect,
  notes,
  onSearchClick,
  onMonthClick,
}: NotesCalendarWeekStripProps) => {
  const [weekStart, setWeekStart] = useState(() =>
    startOfWeek(selectedDate, { weekStartsOn: 1 }),
  );

  useEffect(() => {
    const ws = startOfWeek(selectedDate, { weekStartsOn: 1 });
    setWeekStart(ws);
  }, [selectedDate]);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  // Notes per day map for tiny indicator bar under each day
  const notesByDay = useMemo(() => {
    const map = new Map<string, Note[]>();
    for (const n of notes) {
      const d = new Date(n.createdAt);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const arr = map.get(key) ?? [];
      arr.push(n);
      map.set(key, arr);
    }
    return map;
  }, [notes]);

  const notesForDay = (d: Date) =>
    notesByDay.get(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`) ?? [];

  const selectedNotes = notesForDay(selectedDate);

  const grouped = useMemo(() => {
    const g: Record<Slot, Note[]> = { morning: [], afternoon: [], evening: [] };
    for (const n of selectedNotes) g[slotOf(new Date(n.createdAt))].push(n);
    for (const k of Object.keys(g) as Slot[]) {
      g[k].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    }
    return g;
  }, [selectedNotes]);

  // Swipe handling
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) =>
    setTouchStartX(e.touches[0].clientX);
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 50) {
      setWeekStart((w) => (dx < 0 ? addWeeks(w, 1) : subWeeks(w, 1)));
    }
    setTouchStartX(null);
  };

  const monthLabel = format(
    isSameMonth(selectedDate, weekStart) ? selectedDate : weekStart,
    'MMMM yyyy',
  );

  return (
    <div
      className="w-full bg-background"
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >
      {/* ============ Top bar: Month pill + search ============ */}
      <div className="flex items-center justify-between px-4 pt-3 pb-4">
        <button
          onClick={onMonthClick}
          className="flex items-center gap-1.5 h-10 px-4 rounded-full bg-card border border-border/60 shadow-[0_1px_2px_rgba(0,0,0,0.04)] active:scale-[0.98] transition-transform"
        >
          <span className="text-[15px] font-semibold text-foreground tracking-tight">
            {monthLabel}
          </span>
          <ChevronDown className="h-4 w-4 text-foreground/70" strokeWidth={2.25} />
        </button>
        <button
          onClick={onSearchClick}
          aria-label="Search"
          className="h-10 w-10 flex items-center justify-center rounded-full bg-card border border-border/60 shadow-[0_1px_2px_rgba(0,0,0,0.04)] active:scale-[0.96] transition-transform"
        >
          <Search className="h-[18px] w-[18px] text-foreground/80" strokeWidth={2.25} />
        </button>
      </div>

      {/* ============ Week strip card ============ */}
      <div className="px-4">
        <div
          className="rounded-2xl bg-card border border-border/60 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.06)] px-2 py-3"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div className="grid grid-cols-7">
            {weekDays.map((day, idx) => {
              const selected = isSameDay(day, selectedDate);
              const dayNotes = notesForDay(day);
              const count = dayNotes.length;

              // 4 tiny segments — filled by note density
              const filledSegments = Math.min(count, 4);

              return (
                <button
                  key={idx}
                  onClick={() => onDateSelect(day)}
                  className="flex flex-col items-center py-1.5 touch-manipulation"
                >
                  {/* Label + number: entire block turns into pill when selected */}
                  <div
                    className={cn(
                      'flex flex-col items-center rounded-2xl px-2 py-2 transition-colors',
                      selected && 'text-white',
                    )}
                    style={selected ? { backgroundColor: ACCENT } : undefined}
                  >
                    <span
                      className={cn(
                        'text-[10px] font-semibold tracking-[0.08em]',
                        selected ? 'text-white/85' : 'text-muted-foreground/70',
                      )}
                    >
                      {WEEK_LABELS[idx]}
                    </span>
                    <span
                      className={cn(
                        'mt-1 text-[20px] leading-none font-semibold',
                        !selected && 'text-foreground',
                      )}
                    >
                      {format(day, 'd')}
                    </span>
                    {/* dot beneath the number, only when there are notes */}
                    <span
                      className={cn(
                        'mt-1.5 h-[4px] w-[4px] rounded-full',
                        count > 0
                          ? selected
                            ? 'bg-white'
                            : 'bg-transparent'
                          : 'bg-transparent',
                      )}
                    />
                  </div>

                  {/* segment bar under the pill */}
                  <div className="mt-2 flex items-center gap-[3px]">
                    {[0, 1, 2, 3].map((i) => (
                      <span
                        key={i}
                        className="h-[3px] w-[8px] rounded-full"
                        style={{
                          backgroundColor:
                            i < filledSegments
                              ? ACCENT
                              : 'hsl(var(--muted))',
                          opacity: i < filledSegments ? 1 : 0.6,
                        }}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Page indicator (three dots) */}
      <div className="flex items-center justify-center gap-1.5 py-4">
        <span className="h-[6px] w-[6px] rounded-full bg-muted-foreground/25" />
        <span
          className="h-[6px] w-[6px] rounded-full"
          style={{ backgroundColor: ACCENT }}
        />
        <span className="h-[6px] w-[6px] rounded-full bg-muted-foreground/25" />
      </div>

      {/* ============ Time-of-day sections ============ */}
      <div className="border-t border-border/60">
        {(['morning', 'afternoon', 'evening'] as Slot[]).map((slot) => {
          const items = grouped[slot];
          return (
            <SlotSection
              key={slot}
              label={slot.toUpperCase()}
              count={items.length}
              items={items}
            />
          );
        })}

        {selectedNotes.length === 0 && (
          <div className="py-14 text-center text-sm text-muted-foreground">
            No notes for this day yet.
          </div>
        )}
      </div>
    </div>
  );
};

interface SlotSectionProps {
  label: string;
  count: number;
  items: Note[];
}

const SlotSection = ({ label, count, items }: SlotSectionProps) => {
  if (items.length === 0) return null;
  return (
    <section className="px-5 pt-5 pb-1 border-b border-border/60 last:border-b-0">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground">
          {label}
        </h3>
        <span className="text-[13px] text-muted-foreground/70">{count}</span>
      </div>

      <ul className="space-y-4 pb-4">
        {items.map((n) => {
          const meta = getTypeMeta(n.type);
          const Icon = meta.Icon;
          const created = new Date(n.createdAt);
          const subtitle =
            (n.folderId ? '' : '') +
            (n.type.charAt(0).toUpperCase() + n.type.slice(1)) +
            (n.content ? ` · ${Math.max(1, Math.round((n.content?.length ?? 0) / 200))}m` : '');
          return (
            <li key={n.id} className="flex items-start gap-3">
              <div
                className="h-11 w-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: meta.tint }}
              >
                <Icon className="h-[20px] w-[20px]" style={{ color: ACCENT }} strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[15px] font-semibold text-foreground truncate">
                    {n.title || 'Untitled'}
                  </p>
                  <span className="text-[13px] text-foreground/80 tabular-nums whitespace-nowrap">
                    {format(created, 'h:mm a')}
                  </span>
                </div>
                <div className="flex items-start justify-between gap-3 mt-0.5">
                  <p className="text-[13px] text-muted-foreground truncate">
                    {subtitle}
                  </p>
                  <span
                    className="mt-1.5 h-[6px] w-[6px] rounded-full flex-shrink-0"
                    style={{ backgroundColor: ACCENT }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
