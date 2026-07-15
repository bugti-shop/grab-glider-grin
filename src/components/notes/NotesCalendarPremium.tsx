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
  startOfWeek,
  addDays,
  addWeeks,
  subWeeks,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Search, Plus, MoreHorizontal, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTranslation } from 'react-i18next';

interface NotesCalendarPremiumProps {
  selectedDate?: Date;
  onDateSelect?: (date: Date) => void;
  /** Dates that have notes — used to show a subtle dot indicator. */
  highlightedDates?: Date[];
  onBackgroundSettingsClick?: () => void;
  onAddClick?: () => void;
  onSearchClick?: () => void;
}

const WEEK_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const dateKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export const NotesCalendarPremium = ({
  selectedDate,
  onDateSelect,
  highlightedDates = [],
  onBackgroundSettingsClick,
  onAddClick,
  onSearchClick,
}: NotesCalendarPremiumProps) => {
  const { t } = useTranslation();
  const today = new Date();
  const active = selectedDate || today;
  const [displayMonth, setDisplayMonth] = useState(startOfMonth(active));

  // Keep displayed month in sync when selection jumps outside it
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

  // Week strip (Sun–Sat containing active date)
  const weekDays = useMemo(() => {
    const start = startOfWeek(active, { weekStartsOn: 0 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [active]);

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
    const total = leading.length + days.length;
    const trailingCount = total % 7 === 0 ? 0 : 7 - (total % 7);
    const trailing: Date[] = [];
    const nextStart = addMonths(monthStart, 1);
    for (let i = 0; i < trailingCount; i++) {
      trailing.push(new Date(nextStart.getTime() + i * 86400000));
    }
    return [...leading, ...days, ...trailing];
  }, [displayMonth]);

  const goPrev = () => setDisplayMonth((m) => subMonths(m, 1));
  const goNext = () => setDisplayMonth((m) => addMonths(m, 1));
  const goToday = () => {
    setDisplayMonth(startOfMonth(today));
    onDateSelect?.(today);
  };

  const handleWeekPrev = () => {
    const prev = subWeeks(active, 1);
    onDateSelect?.(prev);
  };
  const handleWeekNext = () => {
    const next = addWeeks(active, 1);
    onDateSelect?.(next);
  };

  return (
    <div className="w-full bg-background" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* ============ Top header: month/year + actions ============ */}
      <div className="flex items-center justify-between px-4 pt-3 pb-3">
        <h2 className="text-[22px] leading-none font-semibold text-foreground tracking-tight">
          <span>{format(active, 'MMMM')} </span>
          <span className="text-muted-foreground/70 font-normal">{format(active, 'yyyy')}</span>
        </h2>
        <div className="flex items-center gap-1">
          {onSearchClick && (
            <button
              onClick={onSearchClick}
              className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
              aria-label={t('common.search', 'Search')}
            >
              <Search className="h-[18px] w-[18px] text-foreground/80" />
            </button>
          )}
          {onAddClick && (
            <button
              onClick={onAddClick}
              className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
              aria-label={t('notes.addNote', 'Add note')}
            >
              <Plus className="h-[20px] w-[20px] text-foreground/80" />
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
                aria-label={t('common.options', 'Options')}
              >
                <MoreHorizontal className="h-[18px] w-[18px] text-foreground/80" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-card">
              <DropdownMenuItem onClick={goToday}>
                {t('calendar.goToToday', 'Go to Today')}
              </DropdownMenuItem>
              {onBackgroundSettingsClick && (
                <DropdownMenuItem onClick={onBackgroundSettingsClick} className="gap-2">
                  <ImageIcon className="h-4 w-4" />
                  {t('calendar.changeBackground', 'Change Background')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ============ Week pill strip ============ */}
      <div className="px-3">
        <div className="flex items-stretch gap-1.5 overflow-x-auto no-scrollbar">
          {weekDays.map((day) => {
            const isSelected = isSameDay(day, active);
            const isToday = isSameDay(day, today);
            const dot = hasNote(day);
            return (
              <button
                key={day.toISOString()}
                onClick={() => onDateSelect?.(day)}
                className={cn(
                  'flex-1 min-w-[42px] rounded-xl py-2 px-1 flex flex-col items-center justify-center gap-0.5 transition-all border',
                  isSelected
                    ? 'bg-foreground text-background border-foreground shadow-sm'
                    : 'bg-card text-foreground border-border/60 hover:border-foreground/40',
                )}
              >
                <span
                  className={cn(
                    'text-[10px] font-medium tracking-wider',
                    isSelected ? 'text-background/70' : 'text-muted-foreground',
                  )}
                >
                  {WEEK_LABELS[getDay(day)]}
                </span>
                <span
                  className={cn(
                    'text-[17px] font-semibold leading-none',
                    !isSelected && isToday && 'text-primary',
                  )}
                >
                  {format(day, 'd')}
                </span>
                <span
                  className={cn(
                    'mt-0.5 h-1 w-1 rounded-full',
                    dot
                      ? isSelected
                        ? 'bg-background/70'
                        : 'bg-foreground/60'
                      : 'bg-transparent',
                  )}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* ============ Full month grid (scroll down to reveal) ============ */}
      <div className="mt-5 px-4 pb-2">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={goPrev}
            className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4 text-foreground/70" />
          </button>
          <div className="text-sm font-medium text-foreground/80">
            {format(displayMonth, 'MMMM yyyy')}
          </div>
          <button
            onClick={goNext}
            className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4 text-foreground/70" />
          </button>
        </div>

        <div className="grid grid-cols-7 mb-1">
          {WEEK_LABELS.map((d) => (
            <div
              key={d}
              className="text-center text-[10px] font-medium tracking-wider text-muted-foreground py-1.5"
            >
              {d}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-1">
          {monthDays.map((day, i) => {
            const inMonth = isSameMonth(day, displayMonth);
            const isSelected = isSameDay(day, active);
            const isToday = isSameDay(day, today);
            const dot = hasNote(day);
            return (
              <button
                key={`${day.toISOString()}-${i}`}
                onClick={() => onDateSelect?.(day)}
                className="h-11 flex flex-col items-center justify-center relative"
              >
                <span
                  className={cn(
                    'h-9 w-9 flex items-center justify-center rounded-full text-[14px] transition-colors',
                    !inMonth && 'text-muted-foreground/40',
                    inMonth && !isSelected && !isToday && 'text-foreground font-normal hover:bg-muted',
                    isToday && !isSelected && 'text-primary font-semibold',
                    isSelected && 'bg-foreground text-background font-semibold',
                  )}
                >
                  {format(day, 'd')}
                </span>
                {dot && (
                  <span
                    className={cn(
                      'absolute bottom-0.5 h-1 w-1 rounded-full',
                      isSelected ? 'bg-background/70' : 'bg-foreground/60',
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
