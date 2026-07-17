import { useState, useEffect, useCallback, useMemo } from 'react';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useTranslation } from 'react-i18next';
import { TodoLayout } from './TodoLayout';
import { useStreak } from '@/hooks/useStreak';
import { cn } from '@/lib/utils';
import { Flame, Check, Snowflake, Trophy, Zap, TrendingUp, Calendar, Gift, Clock, Award, CheckSquare, FileText, Sprout } from 'lucide-react';
import { loadTodoItems } from '@/utils/todoItemsStorage';
import { countCompletedTasksInDB } from '@/utils/taskStorage';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

import { startOfWeek, endOfWeek, subDays, format, startOfDay } from 'date-fns';

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
  const [chartData, setChartData] = useState<{ date: string; label: string; value: number }[]>([]);


  
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

        // Build last-30-day completion series for the chart.
        const days: { date: string; label: string; value: number }[] = [];
        const buckets = new Map<string, number>();
        for (let i = 29; i >= 0; i--) {
          const d = startOfDay(subDays(now, i));
          const key = format(d, 'yyyy-MM-dd');
          buckets.set(key, 0);
          days.push({ date: key, label: format(d, 'MMM d'), value: 0 });
        }
        for (const task of tasks) {
          if (!task.completedAt) continue;
          const key = format(startOfDay(new Date(task.completedAt)), 'yyyy-MM-dd');
          if (buckets.has(key)) buckets.set(key, (buckets.get(key) || 0) + 1);
        }
        setChartData(days.map(d => ({ ...d, value: buckets.get(d.date) || 0 })));

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
      <div className="container mx-auto px-4 py-6 space-y-6">
        
        {/* Blue Streak Hero Card */}
        <SafeComponent fallback={null}>
          <button
            onClick={() => setShowStreakDetail(true)}
            className="relative w-full rounded-2xl p-6 text-left overflow-hidden shadow-sm active:scale-[0.99] transition-transform"
            style={{ background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)' }}
          >
            {/* Decorative rings */}
            <div className="absolute -right-8 -bottom-8 w-40 h-40 rounded-full border border-white/15" />
            <div className="absolute -right-2 -bottom-16 w-56 h-56 rounded-full border border-white/10" />

            <div className="relative z-10">
              <p className="text-6xl sm:text-7xl font-extrabold text-white leading-none tracking-tight">
                {data?.currentStreak || 0}
              </p>
              <div className="flex items-center gap-2 mt-3">
                <span className="text-lg font-semibold text-white">
                  {t('streak.dayStreak', 'Day Streak')}
                </span>
                <Flame className="h-5 w-5 text-orange-300 fill-orange-400" />
              </div>
              {(data?.currentStreak || 0) > 0 && (data?.currentStreak || 0) >= (data?.longestStreak || 0) && (
                <p className="text-xs font-medium text-white/90 mt-2">New Personal Best! 🎉</p>
              )}
            </div>
          </button>
        </SafeComponent>

        {/* Week Strip Card */}
        <SafeComponent fallback={null}>
          <div className="bg-card rounded-2xl p-4 sm:p-5 border shadow-sm">
            <div className="flex justify-between items-start gap-1">
              {weekData.map((day) => {
                const dayDate = new Date(day.date);
                const dateNum = dayDate.getDate();
                return (
                  <div key={day.date} className="flex flex-col items-center gap-1.5 min-w-0 flex-1">
                    <span className={cn(
                      "text-xs font-medium",
                      day.isToday ? "text-primary" : "text-muted-foreground"
                    )}>
                      {day.day}
                    </span>
                    <div
                      className={cn(
                        "w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center border-2 transition-all",
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
                      "text-[11px] font-medium",
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

            {status !== 'grace_period' && !data?.freezesEarnedToday && (
              <div className="mt-4 pt-4 border-t">
                <div className="flex items-center gap-2 mb-2">
                  <Gift className="h-4 w-4 text-info flex-shrink-0" />
                  <span className="text-xs text-muted-foreground">
                    {t('streak.earnFreeze', 'Complete {{remaining}} more tasks today to earn a freeze', { remaining: TASKS_FOR_FREEZE - freezeProgress })}
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div
                    className="bg-primary h-1.5 rounded-full transition-all"
                    style={{ width: `${freezeProgressPercent}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[11px] text-muted-foreground">{freezeProgress}/{TASKS_FOR_FREEZE}</span>
                  {data?.streakFreezes !== undefined && data.streakFreezes > 0 && (
                    <span className="text-[11px] text-info flex items-center gap-1">
                      <Snowflake className="h-3 w-3" /> {data.streakFreezes}
                    </span>
                  )}
                </div>
              </div>
            )}

            {data?.freezesEarnedToday && (
              <div className="flex items-center justify-center gap-2 mt-4 pt-4 border-t">
                <Gift className="h-4 w-4 text-success" />
                <span className="text-xs text-success">
                  {t('streak.freezeEarnedToday', 'Freeze earned today! 🎉')}
                </span>
              </div>
            )}
          </div>
        </SafeComponent>

        {/* Stats Grid 2x2 */}
        <SafeComponent fallback={null}>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <div className="bg-card rounded-2xl p-4 border shadow-sm">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <CheckSquare className="h-5 w-5 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground">{t('streak.totalCompleted', 'Tasks Done')}</p>
              <p className="text-2xl font-bold mt-0.5">{lifetimeCompleted}</p>
            </div>

            <div className="bg-card rounded-2xl p-4 border shadow-sm">
              <div className="w-10 h-10 rounded-full bg-success/15 flex items-center justify-center mb-3">
                <Trophy className="h-5 w-5 text-success" />
              </div>
              <p className="text-xs text-muted-foreground">{t('streak.longestStreak', 'Longest Streak')}</p>
              <p className="text-2xl font-bold mt-0.5">{data?.longestStreak || 0}<span className="text-sm font-normal text-muted-foreground ml-1">d</span></p>
            </div>

            <div className="bg-card rounded-2xl p-4 border shadow-sm">
              <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center mb-3">
                <Calendar className="h-5 w-5 text-purple-500" />
              </div>
              <p className="text-xs text-muted-foreground">{t('streak.thisWeek', 'This Week')}</p>
              <p className="text-2xl font-bold mt-0.5">{weekStats.completed}</p>
            </div>

            <div className="bg-card rounded-2xl p-4 border shadow-sm">
              <div className="w-10 h-10 rounded-full bg-info/15 flex items-center justify-center mb-3">
                <Snowflake className="h-5 w-5 text-info" />
              </div>
              <p className="text-xs text-muted-foreground">{t('streak.freezes', 'Freezes')}</p>
              <p className="text-2xl font-bold mt-0.5">{data?.streakFreezes || 0}</p>
            </div>
          </div>
        </SafeComponent>

        {/* Completed Tasks Last 30 Days Chart */}
        <SafeComponent fallback={null}>
          <div className="bg-card rounded-2xl p-4 sm:p-5 border shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold">
                {t('streak.completedLast30', 'Completed Tasks (Last 30 Days)')}
              </h3>
              <span className="text-sm font-bold text-primary">
                {chartData.reduce((s, d) => s + d.value, 0)}
              </span>
            </div>
            <div className="w-full h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="progressChartFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={false}
                    interval={6}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                    tickLine={false}
                    axisLine={false}
                    width={30}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
                    formatter={(v: number) => [v, t('streak.tasks', 'tasks')]}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#3B82F6"
                    strokeWidth={2.5}
                    fill="url(#progressChartFill)"
                    dot={false}
                    activeDot={{ r: 5, fill: '#3B82F6', stroke: '#fff', strokeWidth: 2 }}
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


        {/* Milestones */}
        <SafeComponent fallback={null}>
          <div className="bg-card rounded-xl p-4 border">
            <h3 className="font-semibold mb-4">{t('streak.milestones', 'Milestones')}</h3>
            <div className="grid grid-cols-4 gap-3">
              {milestones.map((milestone) => {
                const achieved = data?.milestones?.includes(milestone.value);
                const Icon = milestone.icon;
                
                return (
                  <div 
                    key={milestone.value}
                    className={cn(
                      "flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all",
                      achieved 
                        ? "border-primary/50 bg-primary/5" 
                        : "border-muted bg-muted/30 opacity-50"
                    )}
                  >
                    <Icon className={cn("h-6 w-6", achieved ? milestone.color : "text-muted-foreground")} />
                    <span className="text-xs font-medium text-center">{milestone.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </SafeComponent>

        {/* Certificates Button */}
        <div>
          <button
            onClick={() => setShowCertificates(true)}
            className="relative w-full bg-warning/10 border border-warning/20 rounded-xl p-3 flex flex-col items-center justify-center gap-1.5 text-warning font-semibold text-[10px] active:scale-[0.98] transition-transform"
          >
            {hasNewCerts && (
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-destructive animate-pulse shadow-sm" />
            )}
            <Award className="h-4 w-4" />
            Certificates
          </button>
        </div>

        {/* Virtual Journey */}
        <SafeComponent fallback={null}>
          <VirtualJourneyCard />
        </SafeComponent>

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
