import { useTranslation } from 'react-i18next';
import { m as motion } from 'framer-motion';
import { Flame, Trophy, Snowflake, Check, Calendar, Sparkles, Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';

interface WeekDay {
  day: string;
  date: string;
  completed: boolean;
  isToday: boolean;
}

interface StreakDetailSheetProps {
  isOpen: boolean;
  onClose: () => void;
  currentStreak: number;
  longestStreak: number;
  streakFreezes: number;
  totalCompletions: number;
  weekData: WeekDay[];
  completedToday: boolean;
  isPro?: boolean;
  onUpgrade?: () => void;
}

const getMotivationalMessage = (streak: number): string => {
  if (streak === 0) return "Every journey starts with a single step. Complete a task today! 💪";
  if (streak < 3) return "You're just getting started — keep the momentum going! 🚀";
  if (streak < 7) return "A few days in and you're building a real habit! 🌱";
  if (streak < 14) return "One week strong! You're proving consistency wins. 🔥";
  if (streak < 30) return "Two weeks of discipline — you're in the top tier! 💎";
  if (streak < 60) return "A full month! Your future self is thanking you. 👑";
  if (streak < 100) return "Two months of pure dedication. Legendary status incoming! 🏆";
  if (streak < 365) return "Triple digits! You're an unstoppable force of productivity! 🌟";
  return "A FULL YEAR. You are a productivity master. Absolute legend! 🎆";
};

export const StreakDetailSheet = ({
  isOpen,
  onClose,
  currentStreak,
  longestStreak,
  streakFreezes,
  totalCompletions,
  weekData,
  completedToday,
  isPro = false,
  onUpgrade,
}: StreakDetailSheetProps) => {
  const { t } = useTranslation();

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="text-center">
            {t('streak.details', 'Streak Details')}
          </DrawerTitle>
        </DrawerHeader>

        <div className="px-6 pb-8 space-y-6 overflow-y-auto">
          {/* Big Streak Display */}
          <div className="flex flex-col items-center py-4">
            <motion.div
              className="relative"
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            >
              <Flame
                className={cn(
                  "h-16 w-16",
                  completedToday ? "text-streak fill-streak/70" : "text-muted-foreground/40"
                )}
              />
              {currentStreak > 0 && (
                <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-streak-foreground drop-shadow-md mt-1">
                  {currentStreak}
                </span>
              )}
            </motion.div>
            <h2 className={cn(
              "text-4xl font-black mt-3",
              completedToday ? "text-streak" : "text-muted-foreground"
            )}>
              {currentStreak}
            </h2>
            <p className={cn(
              "text-sm font-medium",
              completedToday ? "text-streak" : "text-muted-foreground"
            )}>
              {t('streak.dayStreak', 'day streak')}
            </p>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-muted/50 rounded-xl p-3 text-center">
              <Trophy className="h-4 w-4 mx-auto mb-1 text-warning" />
              <p className="text-lg font-bold">{longestStreak}</p>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                {t('streak.longestStreak', 'Longest')}
              </p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3 text-center relative">
              <Snowflake className="h-4 w-4 mx-auto mb-1 text-info" />
              <p className="text-lg font-bold">{isPro ? streakFreezes : '—'}</p>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                {t('streak.freezes', 'Freezes')}
              </p>
              {!isPro && (
                <button
                  onClick={onUpgrade}
                  className="absolute inset-0 flex items-center justify-center bg-background/60 rounded-xl cursor-pointer"
                >
                  <Crown className="h-4 w-4" fill="#FFD700" color="#FFD700" />
                </button>
              )}
            </div>
            <div className="bg-muted/50 rounded-xl p-3 text-center">
              <Check className="h-4 w-4 mx-auto mb-1 text-success" />
              <p className="text-lg font-bold">{totalCompletions}</p>
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
                {t('streak.totalCompleted', 'Completed')}
              </p>
            </div>
          </div>

          {/* Weekly Calendar */}
          <div className="bg-card rounded-xl border p-4">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">{t('streak.thisWeek', 'This Week')}</span>
            </div>
            <div className="flex justify-between items-center gap-1">
              {weekData.map((day, index) => (
                <div key={day.date} className="flex flex-col items-center gap-2 flex-1">
                  <span className={cn(
                    "text-xs font-medium",
                    day.isToday ? "text-primary" : "text-muted-foreground"
                  )}>
                    {day.day}
                  </span>
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: index * 0.04, type: 'spring', stiffness: 300 }}
                    className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all",
                      day.completed
                        ? "bg-streak border-streak text-streak-foreground"
                        : day.isToday
                          ? "border-primary bg-primary/10"
                          : "border-muted bg-muted/50"
                    )}
                  >
                    {day.completed && <Check className="h-4 w-4" />}
                  </motion.div>
                </div>
              ))}
            </div>
          </div>

          {/* Motivational Message */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-streak/10 border border-streak/20 rounded-xl p-4 flex items-start gap-3"
          >
            <Sparkles className="h-5 w-5 text-streak flex-shrink-0 mt-0.5" />
            <p className="text-sm text-foreground leading-relaxed">
              {getMotivationalMessage(currentStreak)}
            </p>
          </motion.div>

          {/* Streak Freeze Premium Info */}
          {!isPro && (
            <motion.button
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              onClick={onUpgrade}
              className="w-full bg-info/10 border border-info/20 rounded-xl p-4 flex items-start gap-3 text-left cursor-pointer"
            >
              <Snowflake className="h-5 w-5 text-info flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  {t('streak.freezeTitle', 'Streak Freeze')}
                  <Crown className="h-3.5 w-3.5" fill="#FFD700" color="#FFD700" />
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {t('streak.freezeDesc', 'Upgrade to Premium to earn & use streak freezes. Miss a day without losing your streak!')}
                </p>
              </div>
            </motion.button>
          )}

          {isPro && streakFreezes > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-info/10 border border-info/20 rounded-xl p-4 flex items-start gap-3"
            >
              <Snowflake className="h-5 w-5 text-info flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {t('streak.freezeAvailable', '{{count}} Streak Freeze Available', { count: streakFreezes })}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  {t('streak.freezeHint', 'Complete 5 tasks in a day to earn more. Freezes auto-activate when you miss a day.')}
                </p>
              </div>
            </motion.div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
};
