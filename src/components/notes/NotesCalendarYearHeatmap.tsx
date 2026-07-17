import { useMemo, useState } from 'react';
import {
  startOfYear,
  endOfYear,
  addDays,
  format,
  isSameDay,
  getDay,
  getMonth,
  differenceInCalendarDays,
} from 'date-fns';
import { ChevronDown, MoreHorizontal, StickyNote, FileText, BookOpen, FileCode, Mic, Pen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Note, NoteType } from '@/types/note';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Props {
  selectedDate: Date;
  onDateSelect: (d: Date) => void;
  notes: Note[];
  onEditNote: (n: Note) => void;
  onDeleteNote: (id: string) => void;
}

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// GitHub-style green scale (5 buckets)
const SCALE = ['#EBEDF0', '#C6E8C9', '#8FD695', '#4CAF60', '#2E7D3A'];

const typeMeta: Record<NoteType, { Icon: React.ComponentType<any>; bg: string; fg: string; chipBg: string; chipFg: string }> = {
  regular: { Icon: BookOpen,   bg: '#F5F1FB', fg: '#6D4AAE', chipBg: '#EAE0FA', chipFg: '#6D4AAE' },
  sticky:  { Icon: StickyNote, bg: '#FFF7E6', fg: '#B4831E', chipBg: '#FBEBC2', chipFg: '#8A5A2B' },
  lined:   { Icon: FileText,   bg: '#EDF3FE', fg: '#2560D2', chipBg: '#DCE8FC', chipFg: '#1E4B94' },
  code:    { Icon: FileCode,   bg: '#EAF6EE', fg: '#1F7A3A', chipBg: '#D2ECD8', chipFg: '#1F5B33' },
  voice:   { Icon: Mic,        bg: '#FCEDF2', fg: '#B03A67', chipBg: '#F6D6E1', chipFg: '#8B2D4E' },
  sketch:  { Icon: Pen,        bg: '#F1EEFB', fg: '#4B3C8E', chipBg: '#E1DBF4', chipFg: '#4B3C8E' },
} as any;

const getMeta = (t: NoteType) => typeMeta[t] ?? typeMeta.regular;

// dayIndex Mon=0..Sun=6
const mondayIndex = (d: Date) => {
  const js = getDay(d); // Sun=0..Sat=6
  return (js + 6) % 7;
};

export const NotesCalendarYearHeatmap = ({
  selectedDate,
  onDateSelect,
  notes,
  onEditNote,
  onDeleteNote,
}: Props) => {
  const [year, setYear] = useState<number>(selectedDate.getFullYear());

  // Count notes per day for this year
  const countByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of notes) {
      const d = new Date(n.createdAt);
      if (d.getFullYear() !== year) continue;
      const k = `${d.getMonth()}-${d.getDate()}`;
      map.set(k, (map.get(k) ?? 0) + 1);
    }
    return map;
  }, [notes, year]);

  const maxCount = useMemo(() => {
    let m = 0;
    countByDay.forEach((v) => { if (v > m) m = v; });
    return m;
  }, [countByDay]);

  const bucketFor = (count: number): number => {
    if (count <= 0) return 0;
    if (maxCount <= 1) return count > 0 ? 4 : 0;
    const ratio = count / maxCount;
    if (ratio > 0.75) return 4;
    if (ratio > 0.5)  return 3;
    if (ratio > 0.25) return 2;
    return 1;
  };

  // Build 12 monthly columns; each column contains its days grouped by weekday row (0..6, Mon..Sun)
  const monthGrids = useMemo(() => {
    const grids: { month: number; weeks: (Date | null)[][] }[] = [];
    for (let m = 0; m < 12; m++) {
      const first = new Date(year, m, 1);
      const last = new Date(year, m + 1, 0);
      const totalDays = last.getDate();
      // Compute number of week columns needed for this month
      const firstMon = mondayIndex(first);
      const weeksNeeded = Math.ceil((firstMon + totalDays) / 7);
      const weeks: (Date | null)[][] = [];
      for (let w = 0; w < weeksNeeded; w++) {
        const col: (Date | null)[] = new Array(7).fill(null);
        for (let row = 0; row < 7; row++) {
          const dayNum = w * 7 + row - firstMon + 1;
          if (dayNum >= 1 && dayNum <= totalDays) {
            col[row] = new Date(year, m, dayNum);
          }
        }
        weeks.push(col);
      }
      grids.push({ month: m, weeks });
    }
    return grids;
  }, [year]);

  const selectedNotes = useMemo(
    () => notes
      .filter((n) => isSameDay(new Date(n.createdAt), selectedDate))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [notes, selectedDate],
  );

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    return [current - 2, current - 1, current, current + 1];
  }, []);

  return (
    <div className="px-4 pt-2 pb-24">
      {/* Header */}
      <div className="flex items-start justify-between pt-2 pb-5">
        <h1 className="text-[34px] leading-[1.05] font-bold tracking-tight text-foreground">
          Your Year
        </h1>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="h-10 min-w-[90px] px-3.5 rounded-full border border-border/70 bg-card flex items-center justify-between gap-1.5 active:scale-95 transition-transform">
              <span className="text-[15px] font-semibold text-foreground tabular-nums">{year}</span>
              <ChevronDown className="h-4 w-4 text-foreground/70" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-28 bg-card">
            {yearOptions.map((y) => (
              <DropdownMenuItem key={y} onClick={() => setYear(y)} className="justify-center text-[14px] font-medium">
                {y}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Heatmap — horizontally scrollable so mobile can't clip it */}
      <div className="rounded-[20px] bg-card border border-border/50 p-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
        <div className="overflow-x-auto -mx-1 px-1">
          <div className="inline-flex flex-col min-w-full">
            {/* Month header row */}
            <div className="flex pl-[34px]">
              {monthGrids.map(({ month, weeks }) => (
                <div
                  key={month}
                  className="flex-shrink-0 text-center text-[11px] font-medium text-muted-foreground"
                  style={{ width: `calc(${weeks.length} * (var(--cell) + var(--gap)))` }}
                >
                  {MONTH_LABELS[month]}
                </div>
              ))}
            </div>

            {/* Grid + weekday labels */}
            <div
              className="flex mt-2"
              style={{
                // CSS vars scale to viewport so 12 months always fit / scroll nicely
                // 12px cells on small phones, up to ~14 on wider
                ['--cell' as any]: 'clamp(9px, 2.4vw, 14px)',
                ['--gap' as any]: '3px',
              }}
            >
              {/* Weekday labels column */}
              <div className="flex flex-col justify-between pr-2 py-0.5">
                {WEEKDAY_LABELS.map((w, i) => (
                  <div
                    key={w}
                    className={cn(
                      'text-[10.5px] text-muted-foreground leading-none',
                      // Show only Mon / Wed / Fri to reduce clutter on mobile — reference shows all,
                      // but we keep all for parity
                    )}
                    style={{ height: 'var(--cell)' }}
                  >
                    {w}
                  </div>
                ))}
              </div>

              {/* Month columns */}
              <div className="flex gap-[6px]">
                {monthGrids.map(({ month, weeks }) => (
                  <div key={month} className="flex gap-[var(--gap)]">
                    {weeks.map((col, wi) => (
                      <div key={wi} className="flex flex-col gap-[var(--gap)]">
                        {col.map((d, ri) => {
                          if (!d) {
                            return (
                              <div
                                key={ri}
                                style={{ width: 'var(--cell)', height: 'var(--cell)' }}
                              />
                            );
                          }
                          const k = `${d.getMonth()}-${d.getDate()}`;
                          const count = countByDay.get(k) ?? 0;
                          const bucket = bucketFor(count);
                          const selected = isSameDay(d, selectedDate);
                          return (
                            <button
                              key={ri}
                              onClick={() => onDateSelect(d)}
                              aria-label={`${format(d, 'PP')} — ${count} notes`}
                              className={cn(
                                'rounded-[3px] transition-transform active:scale-90',
                                selected && 'ring-2 ring-foreground ring-offset-1 ring-offset-card',
                              )}
                              style={{
                                width: 'var(--cell)',
                                height: 'var(--cell)',
                                backgroundColor: SCALE[bucket],
                              }}
                            />
                          );
                        })}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-2 mt-4 text-[11px] text-muted-foreground">
          <span>Less notes</span>
          <div className="flex items-center gap-1">
            {SCALE.map((c, i) => (
              <span
                key={i}
                className="rounded-[3px]"
                style={{ width: 11, height: 11, backgroundColor: c }}
              />
            ))}
          </div>
          <span>More notes</span>
        </div>
      </div>

      {/* Selected day notes */}
      <div className="mt-6 flex items-end justify-between mb-3">
        <h2 className="text-[26px] font-bold tracking-tight text-foreground">
          {format(selectedDate, 'MMM d')}
        </h2>
        <span className="text-[13px] text-muted-foreground pb-1">
          {selectedNotes.length} {selectedNotes.length === 1 ? 'note' : 'notes'}
        </span>
      </div>

      {selectedNotes.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground rounded-[16px] bg-card border border-border/50">
          No notes for this date yet.
        </div>
      ) : (
        <div className="space-y-3">
          {selectedNotes.map((n) => {
            const meta = getMeta(n.type);
            const preview = (n.content || '').replace(/<[^>]+>/g, '').trim();
            const tag = (n as any).tags?.[0];
            return (
              <button
                key={n.id}
                onClick={() => onEditNote(n)}
                className="w-full text-left rounded-[18px] bg-card border border-border/50 p-3.5 flex items-start gap-3 active:scale-[0.995] transition-transform"
              >
                <div
                  className="h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: meta.bg }}
                >
                  <meta.Icon className="h-5 w-5" style={{ color: meta.fg }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-[15px] font-bold text-foreground leading-tight truncate">
                      {n.title || 'Untitled'}
                    </h3>
                    <span className="text-[11.5px] text-muted-foreground flex-shrink-0 mt-0.5 tabular-nums">
                      {format(new Date(n.createdAt), 'h:mm a')}
                    </span>
                  </div>
                  {preview && (
                    <p className="text-[12.5px] text-muted-foreground leading-snug mt-1 line-clamp-2">
                      {preview}
                    </p>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    {tag ? (
                      <span
                        className="text-[11px] font-medium px-2 py-0.5 rounded-md"
                        style={{ backgroundColor: meta.chipBg, color: meta.chipFg }}
                      >
                        {tag}
                      </span>
                    ) : (
                      <span
                        className="text-[11px] font-medium px-2 py-0.5 rounded-md capitalize"
                        style={{ backgroundColor: meta.chipBg, color: meta.chipFg }}
                      >
                        {n.type}
                      </span>
                    )}
                    <MoreHorizontal className="h-4 w-4 text-muted-foreground/60" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default NotesCalendarYearHeatmap;
