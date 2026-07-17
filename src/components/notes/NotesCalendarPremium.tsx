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

const WEEK_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

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

  return (
    <div className="w-full bg-background" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* ============ Top header: month/year + actions ============ */}
      <div className="flex items-center justify-between px-4 pt-2 pb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            onClick={goPrev}
            className="h-8 w-8 flex items-center justify-center rounded-full active:bg-muted transition-colors -ml-1.5"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-[18px] w-[18px] text-foreground/70" />
          </button>
          <h2 className="text-[20px] leading-none font-semibold text-foreground tracking-tight truncate">
            <span>{format(displayMonth, 'MMMM')} </span>
            <span className="text-muted-foreground/70 font-normal">{format(displayMonth, 'yyyy')}</span>
          </h2>
          <button
            onClick={goNext}
            className="h-8 w-8 flex items-center justify-center rounded-full active:bg-muted transition-colors"
            aria-label="Next month"
          >
            <ChevronRight className="h-[18px] w-[18px] text-foreground/70" />
          </button>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {onSearchClick && (
            <button
              onClick={onSearchClick}
              className="h-9 w-9 flex items-center justify-center rounded-full active:bg-muted transition-colors"
              aria-label={t('common.search', 'Search')}
            >
              <Search className="h-[18px] w-[18px] text-foreground/80" />
            </button>
          )}
          {onAddClick && (
            <button
              onClick={onAddClick}
              className="h-9 w-9 flex items-center justify-center rounded-full active:bg-muted transition-colors"
              aria-label={t('notes.addNote', 'Add note')}
            >
              <Plus className="h-[20px] w-[20px] text-foreground/80" />
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="h-9 w-9 flex items-center justify-center rounded-full active:bg-muted transition-colors"
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

      {/* ============ Weekday header ============ */}
      <div className="px-3 grid grid-cols-7">
        {WEEK_LABELS.map((d, i) => (
          <div
            key={i}
            className="text-center text-[11px] font-semibold tracking-[0.12em] text-muted-foreground/70 py-1.5"
          >
            {d}
          </div>
        ))}
      </div>

      {/* ============ Full month grid ============ */}
      <div className="px-3 pb-3">
        <div className="grid grid-cols-7">
          {monthDays.map((day, i) => {
            const inMonth = isSameMonth(day, displayMonth);
            const isSelected = isSameDay(day, active);
            const isToday = isSameDay(day, today);
            const dot = hasNote(day);
            return (
              <button
                key={`${day.toISOString()}-${i}`}
                onClick={() => onDateSelect?.(day)}
                className="aspect-square flex items-center justify-center relative touch-manipulation"
              >
                <span
                  className={cn(
                    'relative flex items-center justify-center rounded-full text-[15px] transition-all',
                    'h-9 w-9',
                    !inMonth && 'text-muted-foreground/30',
                    inMonth && !isSelected && !isToday && 'text-foreground/90 font-normal',
                    isToday && !isSelected && 'text-primary font-semibold',
                    isSelected && 'bg-foreground text-background font-semibold shadow-[0_4px_14px_-2px_rgba(0,0,0,0.35)] scale-[1.02]',
                  )}
                >
                  {format(day, 'd')}
                </span>
                {dot && (
                  <span
                    className={cn(
                      'absolute h-[4px] w-[4px] rounded-full',
                      isSelected ? 'bottom-[3px] bg-background/80' : 'bottom-[3px] bg-primary/80',
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
