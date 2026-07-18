import { useMemo, useState } from 'react';
import {
  format,
  startOfWeek,
  addDays,
  addWeeks,
  isSameDay,
  isToday,
} from 'date-fns';
import { Search, Menu, Calendar as CalendarIcon, Pin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Note } from '@/types/note';

interface Props {
  selectedDate: Date;
  onDateSelect: (d: Date) => void;
  notes: Note[];
  onEditNote: (n: Note) => void;
  onDeleteNote: (id: string) => void;
}

const TAG_COLORS = [
  'bg-[#EEE9FF] text-[#5B4BD1]', // Work
  'bg-[#F3E9D8] text-[#8A6B34]', // Strategy
  'bg-[#E4F0DE] text-[#4E7A3E]', // People
  'bg-[#EDECE6] text-[#4A4A4A]', // 1:1
  'bg-[#E6EDFB] text-[#3C64B0]', // Design
  'bg-[#EEE9E1] text-[#5A4B36]', // Audit
  'bg-[#FBE7D6] text-[#B66A2C]', // Research
  'bg-[#DDEDE3] text-[#2F7A5A]', // Personal
];

const hashKey = (k: string) => {
  let h = 0;
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  return h;
};

export const NotesCalendarEditorial = ({
  selectedDate,
  onDateSelect,
  notes,
  onEditNote,
}: Props) => {
  const [weekOffset, setWeekOffset] = useState<0 | 1>(0);
  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set());

  const weekStart = useMemo(() => {
    const base = startOfWeek(selectedDate, { weekStartsOn: 1 });
    return addWeeks(base, weekOffset);
  }, [selectedDate, weekOffset]);

  const days = useMemo(() => {
    const arr: Date[] = [];
    for (let i = 0; i < 7; i++) arr.push(addDays(weekStart, i));
    return arr;
  }, [weekStart]);

  const notesByDay = useMemo(() => {
    const map = new Map<string, Note[]>();
    for (const n of notes) {
      const d = new Date(n.createdAt);
      const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const list = map.get(k);
      if (list) list.push(n);
      else map.set(k, [n]);
    }
    return map;
  }, [notes]);

  const titleMonth = format(weekStart, 'MMMM');
  const titleYear = format(weekStart, 'yyyy');

  const toggleDay = (k: string) => {
    setCollapsedDays((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  return (
    <div className="px-5 pt-3 pb-24 bg-[#F7F3EC] min-h-full">
      {/* Header: Serif month + year + icons */}
      <div className="flex items-start justify-between gap-3 mb-5">
        <h1 className="font-serif text-[42px] leading-[1.02] tracking-tight text-foreground">
          {titleMonth}
          <span className="ml-2 text-[22px] font-normal text-[#B8A88A] align-top">
            {titleYear}
          </span>
        </h1>
        <div className="flex items-center gap-2 flex-shrink-0 pt-2">
          <button
            aria-label="Search"
            className="h-10 w-10 rounded-full border border-[#E5DFD3] bg-transparent flex items-center justify-center active:bg-[#EFE8DA]"
          >
            <Search className="h-[17px] w-[17px] text-foreground/70" />
          </button>
          <button
            aria-label="Menu"
            className="h-10 w-10 rounded-full border border-[#E5DFD3] bg-transparent flex items-center justify-center active:bg-[#EFE8DA]"
          >
            <Menu className="h-[17px] w-[17px] text-foreground/70" />
          </button>
        </div>
      </div>

      {/* Week pills */}
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => setWeekOffset(0)}
          className={cn(
            'inline-flex items-center gap-2 rounded-full h-10 px-4 text-[14px] font-medium transition-colors',
            weekOffset === 0
              ? 'bg-foreground text-background'
              : 'bg-transparent text-foreground border border-[#E5DFD3]',
          )}
        >
          <CalendarIcon className="h-[15px] w-[15px]" />
          This Week
        </button>
        <button
          onClick={() => setWeekOffset(1)}
          className={cn(
            'inline-flex items-center gap-2 rounded-full h-10 px-4 text-[14px] font-medium transition-colors',
            weekOffset === 1
              ? 'bg-foreground text-background'
              : 'bg-transparent text-foreground border border-[#E5DFD3]',
          )}
        >
          <CalendarIcon className="h-[15px] w-[15px]" />
          Next Week
        </button>
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Vertical rail */}
        <div className="absolute left-[5px] top-2 bottom-2 w-px bg-[#E1D9C8]" />

        {days.map((d) => {
          const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          const dayNotes = notesByDay.get(key) || [];
          const collapsed = collapsedDays.has(key);
          const active = isSameDay(d, selectedDate);

          if (dayNotes.length === 0) return null;

          return (
            <section key={key} className={cn('relative pl-6 mb-6', active && '')}>
              {/* Dot */}
              <span
                className={cn(
                  'absolute left-0 top-[6px] h-[11px] w-[11px] rounded-full border-2 border-[#F7F3EC]',
                  active ? 'bg-foreground' : 'bg-[#C9BDA5]',
                )}
              />

              {/* Day header */}
              <button
                onClick={() => {
                  onDateSelect(d);
                  toggleDay(key);
                }}
                className="w-full flex items-center justify-between mb-3"
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px] font-bold tracking-[0.14em] text-foreground uppercase">
                    {format(d, 'EEE')}
                  </span>
                  <span className="text-[13px] font-medium tracking-wide text-[#9E9179] uppercase">
                    {format(d, 'MMM d')}
                  </span>
                  {isToday(d) && (
                    <span className="ml-1 text-[10px] font-semibold uppercase tracking-wider text-[#B8A88A]">
                      Today
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-[13px] text-[#9E9179]">
                  <span>{dayNotes.length}</span>
                  <svg
                    className={cn(
                      'h-3.5 w-3.5 transition-transform',
                      collapsed ? '-rotate-90' : 'rotate-0',
                    )}
                    viewBox="0 0 12 12"
                    fill="none"
                  >
                    <path
                      d="M2.5 4.5L6 8L9.5 4.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </button>

              {/* Note cards */}
              {!collapsed && (
                <div className="flex flex-col gap-3">
                  {dayNotes.map((n, idx) => {
                    const seed = hashKey(n.id);
                    const tagA = TAG_COLORS[seed % TAG_COLORS.length];
                    const tagB = TAG_COLORS[(seed + 3) % TAG_COLORS.length];
                    const created = new Date(n.createdAt);
                    const preview = (n.content || '')
                      .replace(/<[^>]+>/g, ' ')
                      .replace(/\s+/g, ' ')
                      .trim()
                      .slice(0, 110);
                    const pinned = idx === 0 && dayNotes.length > 2;
                    const tags = (n.tags && n.tags.length > 0
                      ? n.tags
                      : ['Note']
                    ).slice(0, 2);

                    return (
                      <button
                        key={n.id}
                        onClick={() => onEditNote(n)}
                        className="w-full text-left rounded-2xl bg-[#FBF8F1] border border-[#EDE5D2] px-4 pt-3.5 pb-3 shadow-[0_1px_1px_rgba(0,0,0,0.02)] active:opacity-90 transition-opacity"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-serif text-[17px] leading-tight text-foreground flex-1">
                            {n.title || 'Untitled note'}
                          </h3>
                          <div className="flex items-center gap-1.5 flex-shrink-0 pt-[2px]">
                            <span className="text-[12px] text-[#9E9179]">
                              {format(created, 'h:mm a')}
                            </span>
                            {pinned && <Pin className="h-3.5 w-3.5 text-[#B8A88A] fill-[#B8A88A]" />}
                          </div>
                        </div>
                        {preview && (
                          <p className="mt-1.5 text-[13.5px] leading-[1.45] text-[#7A7060]">
                            {preview}
                            {preview.length >= 110 && '…'}
                          </p>
                        )}
                        <div className="mt-2.5 flex items-center flex-wrap gap-1.5">
                          {tags.map((tg, i) => (
                            <span
                              key={`${tg}-${i}`}
                              className={cn(
                                'inline-flex items-center rounded-full px-2.5 py-[3px] text-[11px] font-medium',
                                i === 0 ? tagA : tagB,
                              )}
                            >
                              {tg}
                            </span>
                          ))}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}

        {/* Empty state */}
        {days.every((d) => {
          const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          return !(notesByDay.get(k) || []).length;
        }) && (
          <div className="pl-6 py-10 text-center text-sm text-[#9E9179]">
            No notes for this week.
          </div>
        )}
      </div>
    </div>
  );
};
