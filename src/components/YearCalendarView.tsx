import { useState } from 'react';
import { addMonths, addYears, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek, startOfYear, subYears } from 'date-fns';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { TodoItem } from '@/types/note';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

interface Props {
  selectedDate: Date;
  onDateSelect: (d: Date) => void;
  tasks: TodoItem[];
}

const WEEK_DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export const YearCalendarView = ({ selectedDate, onDateSelect, tasks }: Props) => {
  const [year, setYear] = useState<Date>(startOfYear(selectedDate));

  const months = Array.from({ length: 12 }, (_, i) => addMonths(startOfYear(year), i));

  const taskDateSet = new Set(
    tasks.filter(t => t.dueDate).map(t => format(new Date(t.dueDate!), 'yyyy-MM-dd'))
  );

  const navYear = (dir: 1 | -1) => {
    setYear(dir > 0 ? addYears(year, 1) : subYears(year, 1));
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  };

  const today = new Date();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 px-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navYear(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <button
          onClick={() => { setYear(startOfYear(today)); onDateSelect(today); }}
          className="flex items-center gap-1.5 text-sm font-medium"
        >
          <CalendarDays className="h-4 w-4 text-primary" />
          {format(year, 'yyyy')}
        </button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navYear(1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {months.map((monthDate) => {
          const monthStart = startOfMonth(monthDate);
          const monthEnd = endOfMonth(monthDate);
          const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
          const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
          const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
          return (
            <div key={monthDate.toISOString()} className="rounded-lg bg-card/40">
              <button
                onClick={() => onDateSelect(monthStart)}
                className="text-sm font-semibold mb-1 text-left w-full"
              >
                {format(monthDate, 'MMM')}
              </button>
              <div className="grid grid-cols-7 text-[8px] text-muted-foreground mb-0.5">
                {WEEK_DAYS.map((d, i) => (
                  <div key={i} className="text-center">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-y-0.5">
                {days.map((d) => {
                  const inMonth = isSameMonth(d, monthDate);
                  const isSel = isSameDay(d, selectedDate);
                  const isToday = isSameDay(d, today);
                  const hasTask = taskDateSet.has(format(d, 'yyyy-MM-dd'));
                  return (
                    <button
                      key={d.toISOString()}
                      onClick={() => onDateSelect(d)}
                      className={cn(
                        'text-[10px] h-5 w-full flex items-center justify-center rounded-sm transition-colors',
                        !inMonth && 'text-muted-foreground/30',
                        inMonth && !isSel && !isToday && hasTask && 'bg-primary/15 text-foreground',
                        inMonth && !isSel && !isToday && !hasTask && 'text-foreground/80 hover:bg-muted',
                        isToday && !isSel && 'text-primary font-semibold',
                        isSel && 'bg-primary text-primary-foreground font-semibold'
                      )}
                    >
                      {format(d, 'd')}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
