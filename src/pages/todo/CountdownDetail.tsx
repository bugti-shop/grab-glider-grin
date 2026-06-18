import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowLeft, MoreVertical, Trash2, Pencil, CheckCircle2, RotateCcw,
  StickyNote, Shirt, Share2, Smile, Star,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  CountdownEvent,
  deleteCountdown,
  getDaysUntil,
  getNextOccurrence,
  loadCountdowns,
  markCountdownDone,
} from '@/utils/countdownStorage';
import { getCountdownTheme } from './Countdown';
import { cancelCountdownReminders, scheduleCountdownReminders } from '@/utils/countdownReminders';

type UnitMode = 'days' | 'weeks' | 'months';

const CountdownDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [item, setItem] = useState<CountdownEvent | null>(null);
  const [unit, setUnit] = useState<UnitMode>('days');
  const [loading, setLoading] = useState(true);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    const load = async () => {
      const list = await loadCountdowns();
      const found = list.find((c) => c.id === id) || null;
      setItem(found);
      setLoading(false);
    };
    load();
    const onUpdate = () => load();
    window.addEventListener('countdownsUpdated', onUpdate);
    return () => window.removeEventListener('countdownsUpdated', onUpdate);
  }, [id]);

  const next = useMemo(() => (item ? getNextOccurrence(item) : null), [item]);
  const days = useMemo(() => (item ? getDaysUntil(item) : 0), [item]);

  // When it's the same day, tick every second so we can show H:M:S countdown.
  useEffect(() => {
    if (days !== 0 || !next) return;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [days, next]);

  const cycleUnit = () =>
    setUnit((u) => (u === 'days' ? 'weeks' : u === 'weeks' ? 'months' : 'days'));

  const handleDelete = async () => {
    if (!item) return;
    await cancelCountdownReminders(item.id);
    await deleteCountdown(item.id);
    toast.success('Countdown deleted');
    navigate('/todo/countdown');
  };

  const handleToggleDone = async () => {
    if (!item) return;
    const nextDone = !item.completed;
    await markCountdownDone(item.id, nextDone);
    if (nextDone) await cancelCountdownReminders(item.id);
    else await scheduleCountdownReminders({ ...item, completed: false });
    const list = await loadCountdowns();
    setItem(list.find((c) => c.id === item.id) || null);
    toast.success(nextDone ? 'Marked done' : 'Reopened');
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }
  if (!item || !next) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-3">
        <p className="text-muted-foreground">Countdown not found</p>
        <Button onClick={() => navigate('/todo/countdown')}>Back to list</Button>
      </div>
    );
  }

  const absDays = Math.abs(days);
  const isFuture = days >= 0;
  const headerLabel = isFuture ? 'Days until' : 'Days since';
  const datePretty = next.toLocaleDateString(undefined, {
    weekday: 'short',
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });

  // When it's the same day, count down the remaining H:M:S until end of today.
  const showHMS = days === 0 && isFuture;
  const _now = new Date(nowTick);
  const endOfDay = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate() + 1, 0, 0, 0, 0);
  const msLeft = Math.max(0, endOfDay.getTime() - nowTick);
  const hLeft = Math.floor(msLeft / 3600000);
  const mLeft = Math.floor((msLeft % 3600000) / 60000);
  const sLeft = Math.floor((msLeft % 60000) / 1000);

  // Unit decompositions
  const weeks = Math.floor(absDays / 7);
  const weekRem = absDays % 7;
  // Approximate months from days: rough but matches reference's intent
  const months = Math.floor(absDays / 30);
  const monthRem = absDays % 30;

  const theme = getCountdownTheme(item.colorId);

  return (
    <div className={cn('min-h-[100dvh] flex flex-col', theme.cardBg)}>
      {/* Header */}
      <div className="flex items-center justify-between px-2 pt-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/todo/countdown')}
          aria-label="Back"
        >
          <ArrowLeft className="h-6 w-6" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="More">
              <MoreVertical className="h-6 w-6" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={handleToggleDone}>
              {item.completed ? (
                <>
                  <RotateCcw className="h-4 w-4 mr-2" /> Reopen
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" /> Mark done
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleDelete}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Calendar-page card */}
      <div className="flex-1 flex items-center justify-center px-6">
        <div
          className={cn(
            'relative w-full max-w-sm rounded-2xl shadow-xl bg-white dark:bg-card overflow-hidden',
            'aspect-[4/4.4]'
          )}
        >
          {/* Bottom shadow ledge */}
          <div className="absolute -bottom-2 left-3 right-3 h-3 rounded-b-xl bg-black/10 -z-10" />

          {/* Themed header */}
          <div className={cn('h-[26%] relative', theme.headerBg)}>
            <div className="absolute left-[22%] top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-white shadow-inner border border-black/10" />
            <div className="absolute right-[22%] top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-white shadow-inner border border-black/10" />
            {/* Perforation */}
            <div className="absolute bottom-0 left-2 right-2 h-1 border-b border-dashed border-black/20" />
          </div>


          {/* Body */}
          <div className="h-[74%] flex flex-col">
            <div className="flex-1 flex flex-col items-center justify-center px-4 text-center">
              <p className="text-sm text-muted-foreground font-medium mb-3">
                {headerLabel} {datePretty}
              </p>
              <button
                onClick={cycleUnit}
                className="text-foreground dark:text-foreground font-extrabold leading-none select-none"
                aria-label="Toggle unit"
              >
                {unit === 'days' && (
                  showHMS ? (
                    <span className="text-7xl tracking-tight">Today</span>
                  ) : (
                    <span className="text-7xl tracking-tight">{absDays}</span>
                  )
                )}
                {unit === 'weeks' && (
                  <span className="text-6xl tracking-tight">
                    {weeks}
                    <sub className="text-2xl align-baseline ml-0.5">W</sub>
                    {weekRem > 0 && (
                      <>
                        <span className="ml-1">{weekRem}</span>
                        <sub className="text-2xl align-baseline ml-0.5">D</sub>
                      </>
                    )}
                  </span>
                )}
                {unit === 'months' && (
                  <span className="text-6xl tracking-tight">
                    {months}
                    <sub className="text-2xl align-baseline ml-0.5">M</sub>
                    {monthRem > 0 && (
                      <>
                        <span className="ml-1">{monthRem}</span>
                        <sub className="text-2xl align-baseline ml-0.5">D</sub>
                      </>
                    )}
                  </span>
                )}
              </button>
              <p className={cn('mt-6 text-xl font-semibold', theme.accentText)}>
                {item.name}
              </p>

            </div>
            <div className="flex items-center justify-between px-4 pb-3">
              <div className="flex gap-1 text-black/30">
                {Array.from({ length: 6 }).map((_, i) => (
                  <span key={i} className="h-1 w-1 rounded-full bg-current" />
                ))}
              </div>
              <div className="flex gap-2 text-black/30">
                <Smile className="h-4 w-4" />
                <Star className="h-4 w-4" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action row */}
      <div
        className="flex items-center justify-center gap-8 py-6"
        style={{ paddingBottom: 'calc(1.5rem + var(--safe-bottom, 0px))' }}
      >
        <button
          onClick={() => toast.info('Notes coming soon')}
          className="h-12 w-12 rounded-full bg-white/60 flex items-center justify-center"
          aria-label="Note"
        >
          <StickyNote className="h-5 w-5 text-foreground/70" />
        </button>
        <button
          onClick={() => toast.info('More styles coming soon')}
          className="h-12 w-12 rounded-full bg-white/60 flex items-center justify-center"
          aria-label="Style"
        >
          <Shirt className="h-5 w-5 text-foreground/70" />
        </button>
        <button
          onClick={async () => {
            try {
              if (navigator.share) {
                await navigator.share({
                  title: item.name,
                  text: `${absDays} ${headerLabel.toLowerCase()} ${datePretty}`,
                });
              } else {
                toast.info('Sharing not supported');
              }
            } catch {}
          }}
          className="h-12 w-12 rounded-full bg-white/60 flex items-center justify-center"
          aria-label="Share"
        >
          <Share2 className="h-5 w-5 text-foreground/70" />
        </button>
      </div>
    </div>
  );
};

export default CountdownDetail;
