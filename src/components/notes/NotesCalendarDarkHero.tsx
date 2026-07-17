import { useMemo } from 'react';
import { format, addDays, startOfWeek, isSameDay, isToday } from 'date-fns';
import { Menu, Search, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Note, NoteType } from '@/types/note';
import { NoteCard } from '@/components/NoteCard';

interface Props {
  selectedDate: Date;
  onDateSelect: (d: Date) => void;
  notes: Note[];
  onEditNote: (n: Note) => void;
  onDeleteNote: (id: string) => void;
}

const WEEK_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const typeDot: Record<string, string> = {
  sticky: '#F59E0B',
  lined: '#3B82F6',
  regular: '#A855F7',
  code: '#22C55E',
  voice: '#EC4899',
  sketch: '#8B5CF6',
};

export const NotesCalendarDarkHero = ({
  selectedDate,
  onDateSelect,
  notes,
  onEditNote,
  onDeleteNote,
}: Props) => {
  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [selectedDate]);

  const notesByDay = useMemo(() => {
    const map = new Map<string, Note[]>();
    for (const n of notes) {
      const k = format(new Date(n.createdAt), 'yyyy-MM-dd');
      const arr = map.get(k) ?? [];
      arr.push(n);
      map.set(k, arr);
    }
    return map;
  }, [notes]);

  const selectedNotes = notesByDay.get(format(selectedDate, 'yyyy-MM-dd')) ?? [];
  const dotColors = Array.from(
    new Set(selectedNotes.map((n) => typeDot[n.type as NoteType] ?? '#A855F7')),
  ).slice(0, 4);

  return (
    <div className="min-h-full bg-[#0A0A0B] text-white px-4 pb-8">
      {/* Top bar */}
      <div className="flex items-center justify-between pt-2 pb-4">
        <button
          aria-label="Menu"
          className="h-10 w-10 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center active:bg-white/10"
        >
          <Menu className="h-[18px] w-[18px] text-white/80" />
        </button>
        <button
          aria-label="Search"
          className="h-10 w-10 rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center active:bg-white/10"
        >
          <Search className="h-[18px] w-[18px] text-white/80" />
        </button>
      </div>

      {/* Hero card */}
      <div
        className="relative overflow-hidden rounded-[28px] p-5 border border-white/10"
        style={{
          background:
            'radial-gradient(120% 90% at 100% 0%, rgba(168,85,247,0.35) 0%, rgba(88,28,135,0.18) 40%, rgba(20,10,35,0.9) 75%, #0F0A1A 100%)',
        }}
      >
        <div className="flex justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1
              className="font-semibold tracking-tight text-white/95 leading-[0.95]"
              style={{ fontSize: 'clamp(34px, 11vw, 56px)' }}
            >
              {format(selectedDate, 'EEEE')}
            </h1>
            <div
              className="mt-1 font-black leading-[0.85] bg-clip-text text-transparent"
              style={{
                fontSize: 'clamp(80px, 26vw, 140px)',
                backgroundImage:
                  'linear-gradient(180deg, #FFFFFF 0%, #E9D5FF 55%, #A78BFA 100%)',
              }}
            >
              {format(selectedDate, 'd')}
            </div>
            <p className="mt-2 text-[13px] text-purple-200/70 font-medium">
              {format(selectedDate, 'MMMM yyyy')}
            </p>
          </div>

          <div className="flex flex-col items-center justify-center gap-2 pt-2 shrink-0">
            <div className="h-11 w-11 rounded-[12px] bg-purple-500/15 border border-purple-400/25 flex items-center justify-center">
              <FileText className="h-[18px] w-[18px] text-purple-300" />
            </div>
            <div className="text-white text-[15px] font-semibold leading-tight text-center">
              {selectedNotes.length}
              <div className="text-[11px] font-normal text-white/60">
                notes {isToday(selectedDate) ? 'today' : ''}
              </div>
            </div>
            {dotColors.length > 0 && (
              <div className="flex items-center gap-1 mt-1">
                {dotColors.map((c, i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Week strip */}
      <div className="mt-4 grid grid-cols-7 gap-1.5">
        {weekDays.map((d, i) => {
          const isSel = isSameDay(d, selectedDate);
          const hasNotes = (notesByDay.get(format(d, 'yyyy-MM-dd')) ?? []).length > 0;
          return (
            <button
              key={i}
              onClick={() => onDateSelect(d)}
              className={cn(
                'flex flex-col items-center justify-center rounded-[14px] py-2 transition-all',
                'border',
                isSel
                  ? 'bg-purple-500/15 border-purple-400/60'
                  : 'bg-white/[0.04] border-white/10 active:bg-white/[0.08]',
              )}
              style={{ minHeight: 62 }}
            >
              <span
                className={cn(
                  'text-[10px] font-semibold tracking-wider',
                  isSel ? 'text-purple-200' : 'text-white/50',
                )}
              >
                {WEEK_LABELS[i]}
              </span>
              <span
                className={cn(
                  'text-[17px] font-bold mt-0.5',
                  isSel ? 'text-white' : 'text-white/85',
                )}
              >
                {format(d, 'd')}
              </span>
              {hasNotes && (
                <span
                  className={cn(
                    'mt-0.5 h-1 w-1 rounded-full',
                    isSel ? 'bg-purple-300' : 'bg-white/40',
                  )}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Notes list — colorful cards on dark */}
      <div className="mt-5">
        {selectedNotes.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {selectedNotes.map((n) => (
              <div key={n.id} className="[&_*]:!text-inherit">
                <NoteCard note={n} onEdit={onEditNote} onDelete={onDeleteNote} />
              </div>
            ))}
          </div>
        ) : (
          <div className="py-14 text-center text-sm text-white/50">
            No notes for this date yet.
          </div>
        )}
      </div>
    </div>
  );
};

export default NotesCalendarDarkHero;
