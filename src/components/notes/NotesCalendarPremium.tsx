import { useState, useEffect, useMemo } from 'react';
import {
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  getDay,
  addMonths,
  subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NotesCalendarPremiumProps {
  selectedDate?: Date;
  onDateSelect?: (date: Date) => void;
  /** Dates that have notes — used to show a subtle dot indicator. */
  highlightedDates?: Date[];
  onBackgroundSettingsClick?: () => void;
  onAddClick?: () => void;
  onSearchClick?: () => void;
}

const WEEK_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const dateKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export const NotesCalendarPremium = ({
  selectedDate,
  onDateSelect,
  highlightedDates = [],
}: NotesCalendarPremiumProps) => {
  const today = new Date();
  const active = selectedDate || today;
  const [displayMonth, setDisplayMonth] = useState(startOfMonth(active));

  useEffect(() => {
    if (selectedDate && !isSameMonth(selectedDate, displayMonth)) {
      setDisplayMonth(startOfMonth(selectedDate));
    }
  }, [selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const noteDateSet = useMemo(
    () => new Set(highlightedDates.map(dateKey)),
    [highlightedDates],
  );
  const hasNote = (d: Date) => noteDateSet.has(dateKey(d));

  // Full month grid
  const monthDays = useMemo(() => {
    const monthStart = startOfMonth(displayMonth);
    const monthEnd = endOfMonth(displayMonth);
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const leading: Date[] = [];
    const startDow = getDay(monthStart);
    if (startDow > 0) {
      const prevEnd = endOfMonth(subMonths(monthStart, 1));
      for (let i = startDow - 1; i >= 0; i--) {
        leading.push(new Date(prevEnd.getTime() - i * 86400000));
      }
    }
    return [...leading, ...days];
  }, [displayMonth]);

  const goPrev = () => setDisplayMonth((m) => subMonths(m, 1));
  const goNext = () => setDisplayMonth((m) => addMonths(m, 1));

  return (
    <div className="w-full bg-background" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* ============ Top header: chevron | Month YYYY | chevron ============ */}
      <div className="relative flex items-center justify-center px-4 pt-3 pb-4">
        <button
          onClick={goPrev}
          className="absolute left-3 h-10 w-10 flex items-center justify-center rounded-full active:bg-muted transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-6 w-6 text-foreground" strokeWidth={2.25} />
        </button>
        <h2 className="text-[19px] leading-none font-semibold text-foreground tracking-tight">
          {format(displayMonth, 'MMMM yyyy')}
        </h2>
        <button
          onClick={goNext}
          className="absolute right-3 h-10 w-10 flex items-center justify-center rounded-full active:bg-muted transition-colors"
          aria-label="Next month"
        >
          <ChevronRight className="h-6 w-6 text-foreground" strokeWidth={2.25} />
        </button>
      </div>

      {/* ============ Weekday header ============ */}
      <div className="px-3 grid grid-cols-7">
        {WEEK_LABELS.map((d, i) => (
          <div
            key={i}
            className="text-center text-[13px] font-medium text-muted-foreground/70 pb-2"
          >
            {d}
          </div>
        ))}
      </div>

      {/* ============ Full month grid ============ */}
      <div className="px-3 pb-4">
        <div className="grid grid-cols-7 gap-y-1">
          {monthDays.map((day, i) => {
            const inMonth = isSameMonth(day, displayMonth);
            const isSelected = isSameDay(day, active);
            const dot = hasNote(day);
            return (
              <button
                key={`${day.toISOString()}-${i}`}
                onClick={() => onDateSelect?.(day)}
                className="aspect-square flex flex-col items-center justify-center relative touch-manipulation"
                disabled={!inMonth}
              >
                <span
                  className={cn(
                    'flex items-center justify-center rounded-full text-[17px] transition-colors',
                    'h-10 w-10',
                    !inMonth && 'text-transparent',
                    inMonth && !isSelected && 'text-foreground font-normal',
                    isSelected && 'bg-foreground text-background font-semibold',
                  )}
                >
                  {format(day, 'd')}
                </span>
                {inMonth && dot && (
                  <span
                    className={cn(
                      'absolute h-[5px] w-[5px] rounded-full',
                      'bottom-[3px]',
                      isSelected ? 'bg-[#2563eb]' : 'bg-muted-foreground/40',
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
