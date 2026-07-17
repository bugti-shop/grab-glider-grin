import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useTranslation } from 'react-i18next';
import { TodoLayout } from './TodoLayout';
import { useStreak } from '@/hooks/useStreak';
import { cn } from '@/lib/utils';
import { Flame, Check, Snowflake, Trophy, Zap, TrendingUp, Calendar, Gift, Clock, Award, CheckSquare, FileText, Sprout } from 'lucide-react';
import { loadTodoItems } from '@/utils/todoItemsStorage';
import { countCompletedTasksInDB } from '@/utils/taskStorage';
import { AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

import { startOfWeek, endOfWeek, subDays, subHours, subMonths, subYears, format, startOfDay, startOfHour } from 'date-fns';

import { checkDailyReward, loadDailyRewardData } from '@/utils/dailyRewardStorage';
import { SafeComponent } from '@/components/ErrorBoundary';

import { GamificationCertificates, hasNewCertificates } from '@/components/GamificationCertificates';
import { StreakDetailSheet } from '@/components/StreakDetailSheet';
import { VirtualJourneyCard } from '@/components/VirtualJourneyCard';
import { StreakSocietyBadge } from '@/components/StreakSocietyBadge';
import { StreakConsistencyCertificate } from '@/components/StreakConsistencyCertificate';
import { useFirstVisitTour } from '@/features/tours/useFeatureTour';

const Progress = () => {
  const { t } = useTranslation();
  const { openPaywall } = useSubscription();
  const { data, isLoading, completedToday, atRisk, status, weekData, gracePeriodRemaining, isPro } = useStreak();
  useFirstVisitTour('/todo/progress');
  useEffect(() => {
    // Mark Progress tab visit for the onboarding checklist auto-check.
    import('@/utils/settingsStorage').then(({ setSetting }) => {
      setSetting('onboarding-visited-progress', true, { skipCloudSync: true }).catch(() => {});
      window.dispatchEvent(new Event('flowistOnboardingSignalChange'));
    });
  }, []);

  const [weekStats, setWeekStats] = useState({ completed: 0, total: 0 });
  const [lifetimeCompleted, setLifetimeCompleted] = useState(0);
  const [allTasks, setAllTasks] = useState<any[]>([]);
  type ChartRange = 'today' | '24h' | '7d' | '30d' | 'month' | 'year';
  const [chartRange, setChartRange] = useState<ChartRange>('7d');




  
  const [showCertificates, setShowCertificates] = useState(false);
  const [showStreakDetail, setShowStreakDetail] = useState(false);
  const [rewardDay, setRewardDay] = useState(1);
  const [rewardClaimed, setRewardClaimed] = useState(false);
  const [hasNewCerts, setHasNewCerts] = useState(false);
  const [completedCycles, setCompletedCycles] = useState(0);
  const [isPersonalBest, setIsPersonalBest] = useState(false);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const tasks = await loadTodoItems();
        const now = new Date();
        const weekStart = startOfWeek(now, { weekStartsOn: 0 });
        const weekEnd = endOfWeek(now, { weekStartsOn: 0 });

        const thisWeekTasks = tasks.filter(task => {
          if (!task.completedAt) return false;
          const completedDate = new Date(task.completedAt);
          return completedDate >= weekStart && completedDate <= weekEnd;
        });
        setWeekStats({
          completed: thisWeekTasks.length,
          total: tasks.filter(t => t.completed).length,
        });

        setAllTasks(tasks);


        // Lifetime completed task count — the true source of truth,
        // synced instantly with today's tasks via the tasksUpdated event.
        const completedTotal = await countCompletedTasksInDB();
        setLifetimeCompleted(completedTotal);



        const rewardResult = await checkDailyReward();
        setRewardDay(rewardResult.currentDay);
        setRewardClaimed(!rewardResult.canClaim);

        const rewardData = await loadDailyRewardData();
        setCompletedCycles(rewardData.completedCycles || 0);

        const newCerts = await hasNewCertificates(data?.longestStreak || 0);
        setHasNewCerts(newCerts);

        const currentStreak = data?.currentStreak || 0;
        const longestStreak = data?.longestStreak || 0;
        const { getSetting } = await import('@/utils/settingsStorage');
        const lastSharedBest = await getSetting<number>('flowist_last_shared_best_streak', 0);
        setIsPersonalBest(currentStreak > 0 && currentStreak >= longestStreak && currentStreak > lastSharedBest);
      } catch (error) {
        console.error('Failed to load stats:', error);
      }
    };
    loadStats();

    const handler = () => loadStats();
    window.addEventListener('tasksUpdated', handler);
    window.addEventListener('dailyRewardClaimed', handler);
    return () => {
      window.removeEventListener('tasksUpdated', handler);
      window.removeEventListener('dailyRewardClaimed', handler);
    };
  }, []);

  const getMessage = () => {
    if (completedToday) {
      if (data?.currentStreak === 1) {
        return t('streak.firstDayComplete', "Great start! Let's keep going tomorrow.");
      }
      return t('streak.continueMessage', "I knew you'd come back! Let's do this again tomorrow.");
    }
    if (status === 'grace_period') {
      return t('streak.gracePeriodMessage', `You have ${gracePeriodRemaining} hours to save your streak!`);
    }
    if (status === 'lost' || status === 'new') {
      return t('streak.newStreakMessage', 'New streaks start today. Complete one task to begin!');
    }
    if (atRisk) {
      return t('streak.atRiskMessage', 'Complete one task today to keep your streak going!');
    }
    return t('streak.keepGoingMessage', 'You\'re on a roll! Keep it up.');
  };

  const milestones = [
    { value: 3, icon: Zap, label: '3 days', color: 'text-warning' },
    { value: 7, icon: Trophy, label: '1 week', color: 'text-info' },
    { value: 14, icon: TrendingUp, label: '2 weeks', color: 'text-success' },
    { value: 30, icon: Flame, label: '1 month', color: 'text-streak' },
  ];

  const rangeOptions: { key: ChartRange; label: string }[] = [
    { key: 'today', label: t('streak.rangeToday', 'Today') },
    { key: '24h', label: t('streak.range24h', '24h') },
    { key: '7d', label: t('streak.range7d', '7 Days') },
    { key: '30d', label: t('streak.range30d', '30 Days') },
    { key: 'month', label: t('streak.rangeMonth', 'Last Month') },
    { key: 'year', label: t('streak.rangeYear', 'Last Year') },
  ];

  const chartData = useMemo(() => {
    const now = new Date();
    type Bucket = { date: string; label: string; value: number };
    const buckets: Bucket[] = [];
    const map = new Map<string, number>();

    const pushDay = (d: Date, labelFmt: string) => {
      const key = format(startOfDay(d), 'yyyy-MM-dd');
      map.set(key, 0);
      buckets.push({ date: key, label: format(d, labelFmt), value: 0 });
    };
    const pushHour = (d: Date) => {
      const key = format(startOfHour(d), 'yyyy-MM-dd HH');
      map.set(key, 0);
      buckets.push({ date: key, label: format(d, 'ha'), value: 0 });
    };
    const pushMonth = (d: Date) => {
      const key = format(d, 'yyyy-MM');
      map.set(key, 0);
      buckets.push({ date: key, label: format(d, 'MMM'), value: 0 });
    };

    let mode: 'hour' | 'day' | 'month' = 'day';
    if (chartRange === 'today') {
      mode = 'hour';
      const start = startOfDay(now);
      for (let h = 0; h <= now.getHours(); h++) {
        const d = new Date(start); d.setHours(h);
        pushHour(d);
      }
    } else if (chartRange === '24h') {
      mode = 'hour';
      for (let i = 23; i >= 0; i--) pushHour(subHours(now, i));
    } else if (chartRange === '7d') {
      for (let i = 6; i >= 0; i--) pushDay(subDays(now, i), 'EEE');
    } else if (chartRange === '30d') {
      for (let i = 29; i >= 0; i--) pushDay(subDays(now, i), 'MMM d');
    } else if (chartRange === 'month') {
      for (let i = 29; i >= 0; i--) pushDay(subDays(now, i), 'MMM d');
    } else if (chartRange === 'year') {
      mode = 'month';
      for (let i = 11; i >= 0; i--) pushMonth(subMonths(now, i));
    }

    for (const task of allTasks) {
      if (!task.completedAt) continue;
      const dt = new Date(task.completedAt);
      let key = '';
      if (mode === 'hour') key = format(startOfHour(dt), 'yyyy-MM-dd HH');
      else if (mode === 'day') key = format(startOfDay(dt), 'yyyy-MM-dd');
      else key = format(dt, 'yyyy-MM');
      if (map.has(key)) map.set(key, (map.get(key) || 0) + 1);
    }
    return buckets.map(b => ({ ...b, value: map.get(b.date) || 0 }));
  }, [allTasks, chartRange]);

  if (isLoading) {
    return (
      <TodoLayout title={t('nav.progress', 'Progress')}>
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </div>
      </TodoLayout>
    );
  }

  const TASKS_FOR_FREEZE = 5;
  const dailyTaskCount = data?.dailyTaskCount || 0;
  const freezeProgress = Math.min(dailyTaskCount, TASKS_FOR_FREEZE);
  const freezeProgressPercent = (freezeProgress / TASKS_FOR_FREEZE) * 100;

  return (

    <TodoLayout title={t('nav.progress', 'Progress')}>
      <div className="container mx-auto px-1.5 sm:px-3 py-6 sm:py-8 space-y-5 sm:space-y-7 max-w-4xl">
        
        {/* Blue Streak Hero Card */}
        <SafeComponent fallback={null}>
          <button
            onClick={() => setShowStreakDetail(true)}
            className="relative w-full rounded-xl px-6 sm:px-8 py-8 sm:py-10 text-left overflow-hidden active:scale-[0.99] transition-transform min-h-[180px] sm:min-h-[220px]"
            style={{ background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)' }}
          >
            <div className="relative z-10">
              <p className="text-7xl sm:text-8xl font-extrabold text-white leading-none tracking-tight">
                {data?.currentStreak || 0}
              </p>
              <div className="flex items-center gap-2 mt-3 sm:mt-4">
                <span className="text-xl sm:text-2xl font-semibold text-white">
                  {t('streak.dayStreak', 'Day Streak')}
                </span>
                <Flame className="h-6 w-6 sm:h-7 sm:w-7 text-orange-300 fill-orange-400" />
              </div>
            </div>

            {/* Decorative flame illustration on the right */}
            <div className="pointer-events-none absolute right-3 sm:right-6 top-1/2 -translate-y-1/2 opacity-90">
              <svg width="120" height="140" viewBox="0 0 120 140" fill="none" xmlns="http://www.w3.org/2000/svg" className="sm:w-[150px] sm:h-[170px]">
                <defs>
                  <radialGradient id="flameGlow" cx="50%" cy="55%" r="55%">
                    <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.55" />
                    <stop offset="60%" stopColor="#FFFFFF" stopOpacity="0.12" />
                    <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
                  </radialGradient>
                </defs>
                <circle cx="60" cy="72" r="58" fill="url(#flameGlow)" />
                <path
                  d="M60 14c8 14 22 24 22 42 0 20-14 34-22 34S38 76 38 56c0-12 8-20 14-30 2-4 6-8 8-12z"
                  fill="#FFFFFF"
                  fillOpacity="0.28"
                />
                <path
                  d="M60 40c4 8 12 14 12 24 0 12-8 20-12 20s-12-8-12-20c0-7 4-11 8-16 2-2 3-5 4-8z"
                  fill="#FFFFFF"
                  fillOpacity="0.55"
                />
              </svg>
            </div>
          </button>
        </SafeComponent>

        {/* Week Strip Card */}
        <SafeComponent fallback={null}>
          <div className="bg-card rounded-2xl px-3 sm:px-5 py-6 sm:py-7 border shadow-[0_6px_20px_-8px_rgba(15,23,42,0.15)]">
            <div className="flex justify-between items-start gap-2.5 sm:gap-3">
              {weekData.map((day) => {


                const dayDate = new Date(day.date);
                const dateNum = dayDate.getDate();
                return (
                  <div key={day.date} className="flex flex-col items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                    <span className={cn(
                      "text-[12px] sm:text-[13px] font-medium",
                      day.isToday ? "text-primary" : "text-muted-foreground"
                    )}>
                      {day.day}
                    </span>
                    <div
                      className={cn(
                        "w-9 h-9 sm:w-12 sm:h-12 rounded-full flex items-center justify-center border-2 transition-all",
                        day.completed
                          ? "bg-primary border-primary text-primary-foreground"
                          : day.isToday
                            ? "border-primary bg-primary/10"
                            : "border-muted bg-muted/40"
                      )}
                    >
                      {day.completed && <Check className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={3} />}
                    </div>
                    <span className={cn(
                      "text-[13px] sm:text-sm font-medium",
                      day.isToday ? "text-primary font-semibold" : "text-muted-foreground"
                    )}>
                      {dateNum}
                    </span>
                  </div>
                );
              })}
            </div>

            {status === 'grace_period' && gracePeriodRemaining > 0 && (
              <div className="flex items-center gap-2 mt-4 pt-4 border-t">
                <Clock className="h-4 w-4 text-warning flex-shrink-0" />
                <span className="text-xs text-warning font-medium">
                  {t('streak.gracePeriodActive', '{{hours}}h grace period remaining - complete a task to save your streak!', { hours: gracePeriodRemaining })}
                </span>
              </div>
            )}
          </div>
        </SafeComponent>

        {/* Stats Grid 2x2 — icon top-left, label above small number */}
        <SafeComponent fallback={null}>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5">
            <div className="bg-card rounded-xl px-3 py-3 sm:px-3.5 sm:py-2.5 border shadow-[0_6px_20px_-8px_rgba(15,23,42,0.15)]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <CheckSquare className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                </div>
                <p className="text-[11px] sm:text-xs text-muted-foreground truncate">{t('streak.tasksDone', 'Tasks Done')}</p>
              </div>
              <p className="text-lg sm:text-xl font-bold leading-tight mt-2.5 sm:mt-1.5">{lifetimeCompleted}</p>
            </div>

            <div className="bg-card rounded-xl px-3 py-3 sm:px-3.5 sm:py-2.5 border shadow-[0_6px_20px_-8px_rgba(15,23,42,0.15)]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-success/15 flex items-center justify-center flex-shrink-0">
                  <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-success" />
                </div>
                <p className="text-[11px] sm:text-xs text-muted-foreground truncate">{t('streak.focusTime', 'Focus Time')}</p>
              </div>
              <p className="text-lg sm:text-xl font-bold leading-tight mt-2.5 sm:mt-1.5">0h</p>
            </div>

            <div className="bg-card rounded-xl px-3 py-3 sm:px-3.5 sm:py-2.5 border shadow-[0_6px_20px_-8px_rgba(15,23,42,0.15)]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                  <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-purple-500" />
                </div>
                <p className="text-[11px] sm:text-xs text-muted-foreground truncate">{t('streak.notes', 'Notes')}</p>
              </div>
              <p className="text-lg sm:text-xl font-bold leading-tight mt-2.5 sm:mt-1.5">{weekStats.completed}</p>
            </div>

            <div className="bg-card rounded-xl px-3 py-3 sm:px-3.5 sm:py-2.5 border shadow-[0_6px_20px_-8px_rgba(15,23,42,0.15)]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <Sprout className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-600" />
                </div>
                <p className="text-[11px] sm:text-xs text-muted-foreground truncate">{t('streak.habits', 'Habits')}</p>
              </div>
              <p className="text-lg sm:text-xl font-bold leading-tight mt-2.5 sm:mt-1.5">0</p>
            </div>



          </div>
        </SafeComponent>


        {/* Completed Tasks Last 30 Days - Line Chart (reference-matched) */}
        <SafeComponent fallback={null}>
          <div className="bg-white dark:bg-card rounded-3xl p-5 sm:p-6 border border-[#E5E7EB] dark:border-border shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <h3 className="text-[17px] sm:text-[19px] font-semibold text-[#111827] dark:text-foreground leading-tight">
                {t('streak.completedTasks', 'Completed Tasks')}
              </h3>
            </div>
            <div className="flex gap-1.5 mb-5 overflow-x-auto -mx-1 px-1 no-scrollbar">
              {rangeOptions.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setChartRange(opt.key)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors border",
                    chartRange === opt.key
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-transparent text-muted-foreground border-border hover:bg-muted"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="w-full h-64 sm:h-72 md:h-80">
              <ResponsiveContainer width="100%" height="100%" debounce={50}>
                <AreaChart data={chartData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="lovableAreaFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.32} />
                      <stop offset="60%" stopColor="#3B82F6" stopOpacity={0.08} />
                      <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={16}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={false}
                    width={28}
                    allowDecimals={false}
                    tickMargin={4}
                  />
                  <Tooltip
                    cursor={{ stroke: '#3B82F6', strokeWidth: 1, strokeOpacity: 0.5 }}
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 12,
                      fontSize: 13,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                      color: 'hsl(var(--foreground))',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))', fontWeight: 600 }}
                    formatter={(v: number) => [v, t('streak.tasks', 'tasks')]}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#3B82F6"
                    strokeWidth={2.5}
                    fill="url(#lovableAreaFill)"
                    activeDot={{ r: 5, fill: '#3B82F6', stroke: '#FFFFFF', strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </SafeComponent>


        {/* Streak Consistency Certificate - always visible */}
        <SafeComponent fallback={null}>
          <div className="-mx-3 sm:mx-0">
            <StreakConsistencyCertificate
              currentStreak={data?.currentStreak || 0}
              totalCompletions={lifetimeCompleted}
              longestStreak={data?.longestStreak || 0}
            />
          </div>
        </SafeComponent>


        {/* Virtual Journey */}
        <SafeComponent fallback={null}>
          <VirtualJourneyCard />
        </SafeComponent>

        {/* Certificates Button — moved below Virtual Journey */}
        <div>
          <button
            onClick={() => setShowCertificates(true)}
            className="relative w-full rounded-2xl px-5 py-5 flex flex-col items-center justify-center gap-2 active:scale-[0.99] transition-transform"
            style={{ background: '#FEF3C7', border: '1px solid #FDE68A' }}
          >
            {hasNewCerts && (
              <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 rounded-full bg-destructive animate-pulse shadow-sm" />
            )}
            <Award className="h-6 w-6" style={{ color: '#D97706' }} strokeWidth={2.25} />
            <span className="text-sm font-semibold" style={{ color: '#D97706' }}>Certificates</span>
          </button>
        </div>

        {/* Streak card controls (Name + Share/PDF/Copy) — portaled from StreakConsistencyCertificate */}
        <div id="streak-controls-slot" />


        {/* At Risk Warning */}
        {atRisk && !completedToday && (
          <div className="bg-streak/10 border border-streak/30 rounded-xl p-4 flex items-center gap-3">
            <Flame className="h-5 w-5 text-streak flex-shrink-0" />
            <p className="text-sm text-streak">
              {t('streak.atRiskWarning', 'Complete one task today to keep your streak going!')}
            </p>
          </div>
        )}
      </div>

      {/* Certificates Modal */}
      <SafeComponent fallback={null}>
        <GamificationCertificates
          isOpen={showCertificates}
          onClose={() => { setShowCertificates(false); setHasNewCerts(false); }}
          streakData={data}
        />
      </SafeComponent>

      {/* Streak Detail Sheet */}
      <SafeComponent fallback={null}>
        <StreakDetailSheet
          isOpen={showStreakDetail}
          onClose={() => setShowStreakDetail(false)}
          currentStreak={data?.currentStreak || 0}
          longestStreak={data?.longestStreak || 0}
          streakFreezes={data?.streakFreezes || 0}
          totalCompletions={data?.totalCompletions || 0}
          weekData={weekData || []}
          completedToday={completedToday}
          isPro={isPro}
          onUpgrade={() => { setShowStreakDetail(false); openPaywall(); }}
        />
      </SafeComponent>
    </TodoLayout>
  );
};

export default Progress;
