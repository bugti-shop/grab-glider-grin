import { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { format, isSameDay, startOfWeek, addDays, getHours } from 'date-fns';
import { FileText, MoreHorizontal, SlidersHorizontal } from 'lucide-react';
import { Note } from '@/types/note';

interface Props {
  selectedDate: Date;
  onDateSelect: (d: Date) => void;
  notes: Note[];
  onEditNote: (n: Note) => void;
  onDeleteNote?: (id: string) => void;
}

// Deterministic accent color per note (rail bar + tag icon)
const ACCENTS = ['#A78BFA', '#F59E0B', '#22C55E', '#EF4444', '#3B82F6', '#EC4899', '#14B8A6'];
const accentFor = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
};

const HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
const fmtHour = (h: number) => {
  if (h === 12) return '12PM';
  if (h === 0) return '12AM';
  return h < 12 ? `${h}AM` : `${h - 12}PM`;
};

export function NotesCalendarTimeline({
  selectedDate,
  onDateSelect,
  notes,
  onEditNote,
}: Props) {
  const weekStart = useMemo(() => startOfWeek(selectedDate, { weekStartsOn: 0 }), [selectedDate]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const notesByDay = useMemo(() => {
    const m = new Map<string, Note[]>();
    for (const n of notes) {
      const d = new Date(n.createdAt);
      const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const arr = m.get(k) || [];
      arr.push(n);
      m.set(k, arr);
    }
    return m;
  }, [notes]);

  const countFor = (d: Date) => {
    const k = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    return notesByDay.get(k)?.length || 0;
  };

  const dayNotes = useMemo(() => {
    const list = notes.filter(n => isSameDay(new Date(n.createdAt), selectedDate));
    return list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [notes, selectedDate]);

  // Group notes into their hour slot
  const notesByHour = useMemo(() => {
    const m = new Map<number, Note[]>();
    for (const n of dayNotes) {
      const h = getHours(new Date(n.createdAt));
      const bucket = Math.max(HOURS[0], Math.min(HOURS[HOURS.length - 1], h));
      const arr = m.get(bucket) || [];
      arr.push(n);
      m.set(bucket, arr);
    }
    return m;
  }, [dayNotes]);

  // Auto-scroll selected day into view
  const stripRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLElement>('[data-selected="true"]');
    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [selectedDate]);

  return (
    <div className="px-4 sm:px-6">
      {/* Title */}
      <div className="pt-2">
        <h1 className="text-[clamp(38px,10vw,52px)] font-extrabold tracking-tight text-foreground leading-none">
          {isSameDay(selectedDate, new Date()) ? 'Today' : format(selectedDate, 'EEEE')}
        </h1>
        <p className="mt-1 text-[15px] text-muted-foreground">
          {format(selectedDate, 'MMM d, yyyy')}
        </p>
      </div>

      {/* Week strip */}
      <div
        ref={stripRef}
        className="mt-4 -mx-4 sm:-mx-6 px-4 sm:px-6 flex gap-[10px] overflow-x-auto no-scrollbar snap-x snap-mandatory"
      >
        {days.map((d) => {
          const isSel = isSameDay(d, selectedDate);
          const count = countFor(d);
          return (
            <button
              key={d.toISOString()}
              data-selected={isSel}
              onClick={() => onDateSelect(d)}
              className={[
                'snap-start shrink-0 flex flex-col items-center justify-between',
                'w-[calc((100%-60px)/7)] min-w-[46px] max-w-[64px] h-[112px] rounded-[18px] px-1 py-3',
                'border transition-all duration-150 active:scale-[0.97]',
                isSel
                  ? 'bg-[#0B0B0F] text-white border-[#0B0B0F] shadow-[0_10px_24px_-12px_rgba(0,0,0,0.45)]'
                  : 'bg-card text-foreground border-border/60',
              ].join(' ')}
            >
              <span className={['text-[11px] font-medium', isSel ? 'text-white/80' : 'text-muted-foreground'].join(' ')}>
                {format(d, 'EEEEE')}
              </span>
              <span className="text-[26px] font-semibold leading-none tabular-nums">
                {format(d, 'd')}
              </span>
              <span className={['text-[10px]', isSel ? 'text-white/75' : 'text-muted-foreground'].join(' ')}>
                {count === 0 ? '—' : count === 1 ? '1 note' : `${count} notes`}
              </span>
            </button>
          );
        })}
      </div>

      {/* Timeline header */}
      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-[22px] font-bold tracking-tight text-foreground">Timeline</h2>
        <button
          aria-label="Filter timeline"
          className="h-9 w-9 rounded-full border border-border/60 bg-card flex items-center justify-center active:bg-muted"
        >
          <SlidersHorizontal className="h-[15px] w-[15px] text-foreground/80" />
        </button>
      </div>

      {/* Snapping hour rail */}
      <TimelineRail hours={HOURS} notesByHour={notesByHour} onEditNote={onEditNote} />

      {dayNotes.length === 0 && (
        <div className="py-8 text-center text-sm text-muted-foreground">
          No notes for this day yet.
        </div>
      )}
    </div>
  );
}

function TimelineRail({
  hours,
  notesByHour,
  onEditNote,
}: {
  hours: number[];
  notesByHour: Map<number, Note[]>;
  onEditNote: (n: Note) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [activeHour, setActiveHour] = useState<number>(hours[0]);
  const rafRef = useRef<number | null>(null);

  const setRowRef = useCallback((h: number) => (el: HTMLDivElement | null) => {
    if (el) rowRefs.current.set(h, el);
    else rowRefs.current.delete(h);
  }, []);

  // Track nearest hour to the top guide line
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const compute = () => {
      const containerTop = el.getBoundingClientRect().top;
      // Guide line ~28px below the top of the scroller
      const guide = containerTop + 28;
      let bestHour = hours[0];
      let bestDist = Infinity;
      rowRefs.current.forEach((node, h) => {
        const top = node.getBoundingClientRect().top;
        const dist = Math.abs(top - guide);
        if (dist < bestDist) {
          bestDist = dist;
          bestHour = h;
        }
      });
      setActiveHour(bestHour);
    };

    const onScroll = () => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        compute();
      });
    };

    compute();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [hours]);

  return (
    <div
      ref={scrollerRef}
      className="mt-3 relative max-h-[62vh] overflow-y-auto snap-y snap-mandatory overscroll-contain no-scrollbar rounded-[16px]"
      style={{ scrollPaddingTop: 12 }}
    >
      <div className="grid grid-cols-[46px_1fr] gap-x-2">
        {hours.map((h, idx) => {
          const items = notesByHour.get(h) || [];
          const isActive = h === activeHour;
          return (
            <div
              key={h}
              ref={setRowRef(h)}
              className="contents"
            >
              {/* Hour label */}
              <div className="relative pt-1 snap-start" style={{ scrollSnapAlign: 'start' }}>
                <span
                  className={[
                    'text-[11px] tabular-nums transition-all duration-150',
                    isActive
                      ? 'text-foreground font-semibold text-[12px]'
                      : 'text-muted-foreground font-medium',
                  ].join(' ')}
                >
                  {fmtHour(h)}
                </span>
                <span
                  className={[
                    'absolute right-[-6px] top-[10px] rounded-full transition-all duration-150',
                    isActive
                      ? 'h-[8px] w-[8px] bg-foreground ring-4 ring-foreground/10'
                      : 'h-[6px] w-[6px] bg-muted-foreground/40',
                  ].join(' ')}
                />
              </div>
              {/* Cards column */}
              <div className={['relative snap-start', idx < hours.length - 1 ? 'min-h-[68px]' : 'min-h-[24px]'].join(' ')}>
                <span
                  className={[
                    'absolute left-[-8px] top-0 bottom-0 w-px transition-colors',
                    isActive ? 'bg-foreground/40' : 'bg-border/70',
                  ].join(' ')}
                />
                {items.length > 0 && (
                  <div className="space-y-3 pb-3">
                    {items.map((n) => (
                      <NoteRow key={n.id} note={n} onOpen={() => onEditNote(n)} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}



function NoteRow({ note, onOpen }: { note: Note; onOpen: () => void }) {
  const accent = accentFor(note.id);
  const preview = (note.content || '').replace(/<[^>]+>/g, '').trim();
  const tag = (note as any).folderName || (note as any).folder || note.type || 'Note';
  return (
    <button
      onClick={onOpen}
      className="w-full text-left rounded-[16px] bg-card border border-border/60 shadow-[0_6px_18px_-14px_rgba(0,0,0,0.35)] overflow-hidden active:scale-[0.995] transition-transform"
    >
      <div className="flex">
        <span className="w-[4px] shrink-0" style={{ background: accent }} />
        <div className="flex-1 min-w-0 p-3 pl-3.5">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-[15px] font-semibold text-foreground truncate">
              {note.title || 'Untitled'}
            </h3>
            <MoreHorizontal className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          </div>
          {preview && (
            <p className="mt-1 text-[13px] leading-snug text-muted-foreground line-clamp-2">
              {preview}
            </p>
          )}
          <div className="mt-2 flex items-center gap-1.5 text-[12px] text-muted-foreground">
            <FileText className="h-[13px] w-[13px]" style={{ color: accent }} />
            <span className="truncate capitalize">{String(tag)}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

export default NotesCalendarTimeline;
