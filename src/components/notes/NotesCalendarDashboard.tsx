import { useMemo } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameDay,
  isSameMonth,
  isToday,
  differenceInCalendarDays,
} from 'date-fns';
import { Search, Menu, Sun, Flame, Star, StickyNote, FileText, BookOpen, FileCode, Mic, Pen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Note, NoteType } from '@/types/note';
import { NoteCard } from '@/components/NoteCard';

interface Props {
  selectedDate: Date;
  onDateSelect: (d: Date) => void;
  notes: Note[];
  onEditNote: (n: Note) => void;
  onDeleteNote: (id: string) => void;
  onSearchClick?: () => void;
  onMenuClick?: () => void;
}

const WEEK_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const typeTint: Record<NoteType, { bg: string; fg: string; Icon: React.ComponentType<any>; chipBg: string; chipFg: string }> = {
  sticky:  { bg: '#FFF7EC', fg: '#8A5A2B', Icon: StickyNote, chipBg: '#FBEAD1', chipFg: '#8A5A2B' },
  lined:   { bg: '#EAF3FF', fg: '#1E4B94', Icon: FileText,   chipBg: '#D6E6FB', chipFg: '#1E4B94' },
  regular: { bg: '#FBF7F0', fg: '#6B4A1E', Icon: BookOpen,   chipBg: '#F0E6D2', chipFg: '#6B4A1E' },
  code:    { bg: '#EAF7EE', fg: '#1F5B33', Icon: FileCode,   chipBg: '#D3ECD9', chipFg: '#1F5B33' },
  voice:   { bg: '#FCEDF2', fg: '#8B2D4E', Icon: Mic,        chipBg: '#F6D6E1', chipFg: '#8B2D4E' },
  sketch:  { bg: '#F1EEFB', fg: '#4B3C8E', Icon: Pen,        chipBg: '#E1DBF4', chipFg: '#4B3C8E' },
} as any;

const getMeta = (t: NoteType) => typeTint[t] ?? typeTint.regular;

const dateKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

const computeStreak = (dates: Set<string>): number => {
  let streak = 0;
  let cursor = new Date();
  while (dates.has(dateKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
};

export const NotesCalendarDashboard = ({
  selectedDate,
  onDateSelect,
  notes,
  onEditNote,
  onDeleteNote,
  onSearchClick,
  onMenuClick,
}: Props) => {
  // Build month grid (6 rows x 7 cols, Monday start)
  const monthDays = useMemo(() => {
    const monthStart = startOfMonth(selectedDate);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(endOfMonth(selectedDate), { weekStartsOn: 1 });
    const days: Date[] = [];
    let d = gridStart;
    while (d <= gridEnd) {
      days.push(d);
      d = addDays(d, 1);
    }
    return days.slice(0, 42);
  }, [selectedDate]);

  const noteDateSet = useMemo(() => {
    const s = new Set<string>();
    for (const n of notes) s.add(dateKey(new Date(n.createdAt)));
    return s;
  }, [notes]);

  const todayCount = useMemo(
    () => notes.filter((n) => isSameDay(new Date(n.createdAt), new Date())).length,
    [notes],
  );

  const yesterdayCount = useMemo(() => {
    const y = addDays(new Date(), -1);
    return notes.filter((n) => isSameDay(new Date(n.createdAt), y)).length;
  }, [notes]);

  const streak = useMemo(() => computeStreak(noteDateSet), [noteDateSet]);

  // This Week strip (Mon start, week containing selectedDate)
  const weekDays = useMemo(() => {
    const s = startOfWeek(selectedDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(s, i));
  }, [selectedDate]);

  const weekLabel = useMemo(() => {
    const s = weekDays[0];
    const e = weekDays[6];
    return `${format(s, 'MMM d')} – ${format(e, 'MMM d')}`;
  }, [weekDays]);

  const selectedNotes = useMemo(
    () => notes.filter((n) => isSameDay(new Date(n.createdAt), selectedDate)),
    [notes, selectedDate],
  );

  // Split: featured (starred) vs grid
  const featured = useMemo(() => selectedNotes.find((n) => (n as any).starred || (n as any).isFavorite), [selectedNotes]);
  const gridNotes = useMemo(() => selectedNotes.filter((n) => n !== featured).slice(0, 6), [selectedNotes, featured]);

  const deltaLabel = (() => {
    const diff = todayCount - yesterdayCount;
    if (diff === 0) return 'Same as yesterday';
    if (diff > 0) return `+${diff} from yesterday`;
    return `${diff} from yesterday`;
  })();

  return (
    <div className="px-4 pt-2 pb-24">
      {/* Header */}
      <div className="flex items-start justify-between pt-2 pb-4">
        <h1 className="text-[34px] leading-[1.05] font-bold tracking-tight text-foreground">
          {format(selectedDate, 'MMMM yyyy')}
        </h1>
        <div className="flex items-center gap-2 pt-1">
          <button
            aria-label="Search"
            onClick={onSearchClick}
            className="h-10 w-10 rounded-full border border-border/70 bg-card flex items-center justify-center active:scale-95 transition-transform"
          >
            <Search className="h-[17px] w-[17px] text-foreground/80" />
          </button>
          <button
            aria-label="Menu"
            onClick={onMenuClick}
            className="h-10 w-10 rounded-full border border-border/70 bg-card flex items-center justify-center active:scale-95 transition-transform"
          >
            <Menu className="h-[17px] w-[17px] text-foreground/80" />
          </button>
        </div>
      </div>

      {/* Row: mini month + today stats */}
      <div className="grid grid-cols-[1.35fr_1fr] gap-3">
        {/* Mini month grid */}
        <div className="rounded-[22px] bg-card border border-border/50 p-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
          <div className="grid grid-cols-7 gap-y-1 text-center mb-1">
            {WEEK_LABELS.map((l) => (
              <div key={l} className="text-[9px] font-semibold tracking-[0.06em] text-muted-foreground/70">
                {l}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-[6px]">
            {monthDays.map((d) => {
              const inMonth = isSameMonth(d, selectedDate);
              const selected = isSameDay(d, selectedDate);
              const hasNote = noteDateSet.has(dateKey(d));
              return (
                <button
                  key={d.toISOString()}
                  onClick={() => onDateSelect(d)}
                  className="relative h-7 flex flex-col items-center justify-center"
                >
                  <span
                    className={cn(
                      'text-[12.5px] font-medium tabular-nums flex items-center justify-center',
                      selected
                        ? 'h-7 w-7 rounded-full bg-black text-white'
                        : inMonth
                          ? 'text-foreground'
                          : 'text-muted-foreground/40',
                    )}
                  >
                    {format(d, 'd')}
                  </span>
                  {hasNote && !selected && (
                    <span className="absolute bottom-[-2px] h-[3px] w-[3px] rounded-full bg-foreground" />
                  )}
                  {hasNote && selected && (
                    <span className="absolute bottom-[1px] h-[3px] w-[3px] rounded-full bg-white" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Today stats card */}
        <div className="rounded-[22px] bg-card border border-border/50 p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)] flex flex-col">
          <div className="flex items-start justify-between">
            <span className="text-[13px] font-semibold text-foreground">Today</span>
            <div className="h-8 w-8 rounded-lg bg-[#FEF3C7] flex items-center justify-center">
              <Sun className="h-4 w-4 text-[#D97706]" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-[30px] font-bold leading-none text-foreground tabular-nums">{todayCount}</div>
            <div className="text-[13px] font-semibold text-foreground mt-1">Notes</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{deltaLabel}</div>
          </div>
          <div className="border-t border-border/60 my-2.5" />
          <div className="flex items-start gap-2">
            <Flame className="h-4 w-4 text-[#F97316] mt-1 shrink-0" fill="#F97316" />
            <div>
              <div className="text-[26px] font-bold leading-none text-foreground tabular-nums">{streak}</div>
              <div className="text-[13px] font-semibold text-foreground mt-1">Day Streak</div>
            </div>
          </div>
        </div>
      </div>

      {/* This Week */}
      <div className="mt-3 rounded-[22px] bg-card border border-border/50 p-4 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[15px] font-bold text-foreground">This Week</span>
          <span className="text-[11px] text-muted-foreground">{weekLabel}</span>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {weekDays.map((d) => {
            const selected = isSameDay(d, selectedDate);
            const hasNote = noteDateSet.has(dateKey(d));
            const isTodayDot = isToday(d);
            return (
              <button
                key={d.toISOString()}
                onClick={() => onDateSelect(d)}
                className="flex flex-col items-center gap-1.5"
              >
                <span className="text-[10px] font-semibold tracking-wider text-muted-foreground/70">
                  {format(d, 'EEE').toUpperCase()}
                </span>
                <span
                  className={cn(
                    'h-9 w-9 rounded-full flex items-center justify-center text-[14px] font-semibold tabular-nums',
                    selected
                      ? 'bg-black text-white'
                      : 'bg-muted/60 text-foreground',
                  )}
                >
                  {format(d, 'd')}
                </span>
                <span
                  className={cn(
                    'h-[5px] w-[5px] rounded-full',
                    hasNote
                      ? isTodayDot
                        ? 'bg-[#F97316]'
                        : 'bg-foreground/70'
                      : 'bg-transparent',
                  )}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Notes grid */}
      <div className="mt-4">
        {selectedNotes.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No notes for this date yet.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              {gridNotes.map((n) => {
                const meta = getMeta(n.type);
                const timeLabel = isToday(new Date(n.createdAt))
                  ? format(new Date(n.createdAt), 'h:mm a')
                  : format(new Date(n.createdAt), 'MMM d');
                const tag = (n as any).tags?.[0];
                return (
                  <button
                    key={n.id}
                    onClick={() => onEditNote(n)}
                    className="text-left rounded-[20px] p-3.5 border border-border/40 flex flex-col min-h-[170px]"
                    style={{ backgroundColor: meta.bg }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div
                        className="h-8 w-8 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: meta.chipBg }}
                      >
                        <meta.Icon className="h-4 w-4" style={{ color: meta.fg }} />
                      </div>
                      <span className="text-[10.5px] text-foreground/60 mt-1">{timeLabel}</span>
                    </div>
                    <div className="text-[15px] font-bold leading-snug text-foreground mb-1.5 line-clamp-2">
                      {n.title || 'Untitled'}
                    </div>
                    <div className="text-[12px] leading-snug text-foreground/70 line-clamp-3 flex-1">
                      {(n.content || '').replace(/<[^>]+>/g, '').slice(0, 120)}
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      {tag ? (
                        <span
                          className="text-[11px] font-medium px-2 py-0.5 rounded-md"
                          style={{ backgroundColor: meta.chipBg, color: meta.chipFg }}
                        >
                          #{tag}
                        </span>
                      ) : <span />}
                      <Star className="h-3.5 w-3.5 text-foreground/40" />
                    </div>
                  </button>
                );
              })}
            </div>

            {featured && (
              <div className="mt-3">
                <NoteCard note={featured} onEdit={onEditNote} onDelete={onDeleteNote} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default NotesCalendarDashboard;
