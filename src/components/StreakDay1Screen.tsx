import { useEffect, useState } from 'react';
import { m as motion } from 'framer-motion';
import { Flame, Check, ArrowRight, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStreak } from '@/hooks/useStreak';
import { StreakSocietyBadge } from '@/components/StreakSocietyBadge';
import { triggerTripleHeavyHaptic } from '@/utils/haptics';
import { useTranslation } from 'react-i18next';

const ONBOARDING_COLOR = '#3c78f0';

interface StreakDay1ScreenProps {
  userName: string;
  onContinue: () => void;
}

export const StreakDay1Screen = ({ userName, onContinue }: StreakDay1ScreenProps) => {
  const { t } = useTranslation();
  const { data, completedToday, weekData, recordTaskCompletion } = useStreak({ autoCheck: true });
  const [streakStarted, setStreakStarted] = useState(false);

  // Auto-start the streak on mount by recording a completion
  useEffect(() => {
    const initStreak = async () => {
      if (!streakStarted) {
        setStreakStarted(true);
        triggerTripleHeavyHaptic();
        await recordTaskCompletion();
      }
    };
    initStreak();
  }, [streakStarted, recordTaskCompletion]);

  // Play a subtle chime
  useEffect(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const t = ctx.currentTime;
      const play = (freq: number, delay: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(freq, t + delay);
        osc.type = 'sine';
        gain.gain.setValueAtTime(0, t + delay);
        gain.gain.linearRampToValueAtTime(0.15, t + delay + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.01, t + delay + dur);
        osc.start(t + delay);
        osc.stop(t + delay + dur);
      };
      play(587.33, 0.1, 0.3);
      play(783.99, 0.25, 0.3);
      play(880, 0.4, 0.5);
      setTimeout(() => ctx.close(), 2000);
    } catch {}
  }, []);

  const displayName = userName.trim().split(/\s+/)[0] || '';
  const currentStreak = data?.currentStreak || 0;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[340] flex flex-col bg-background"
    >
      <div className="flex-1 flex flex-col items-center justify-center px-4 pt-8 overflow-y-auto">

        {/* ===== Real Streak Counter Widget (same as Progress page) ===== */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="w-full max-w-sm bg-card rounded-2xl p-6 border shadow-sm"
        >

          {/* Big Flame — identical to Progress page */}
          <div className="flex flex-col items-center py-6">
            <motion.div
              className="relative"
              animate={{
                scale: completedToday ? [1, 1.12, 1] : [1, 1.04, 1],
                rotate: completedToday ? [0, -2, 2, 0] : 0,
              }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            >
              {completedToday && (
                <motion.div
                  className="absolute inset-0 rounded-full blur-xl bg-streak/30"
                  animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                />
              )}
              <Flame
                className={cn(
                  "h-24 w-24 transition-colors relative z-10",
                  completedToday ? "text-streak fill-streak/80" : "text-muted-foreground/30"
                )}
              />
            </motion.div>

            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              className="text-center mt-4"
            >
              <h2 className={cn(
                "text-5xl font-bold",
                completedToday ? "text-streak" : "text-muted-foreground"
              )}>
                {currentStreak}
              </h2>
              <p className={cn(
                "text-lg font-medium",
                completedToday ? "text-streak" : "text-muted-foreground"
              )}>
                {t('streak.dayStreak', 'day streak')}
              </p>
              <div className="flex justify-center mt-2">
                <StreakSocietyBadge streak={currentStreak} compact />
              </div>
              {currentStreak > 0 && currentStreak >= (data?.longestStreak || 0) && (
                <motion.p
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-xs font-bold text-warning mt-1"
                >
                  {t('streak.newPersonalBest', 'New Personal Best! 🎉')}
                </motion.p>
              )}
            </motion.div>
          </div>
        </motion.div>

        {/* ===== Week Progress Card (same as Progress page) ===== */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="w-full max-w-sm bg-card rounded-2xl p-6 border shadow-sm mt-4"
        >
          <div className="flex justify-between items-center gap-1 overflow-hidden">
            {weekData.map((day, index) => (
              <div key={day.date} className="flex flex-col items-center gap-2 min-w-0 flex-1">
                <span className={cn(
                  "text-xs font-medium truncate",
                  day.isToday ? "text-primary" : "text-muted-foreground"
                )}>
                  {day.day}
                </span>
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.6 + index * 0.05, type: 'spring', stiffness: 300 }}
                  className={cn(
                    "w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center border-2 transition-all flex-shrink-0",
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
        </motion.div>

        {/* Motivational hint */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
          className="flex items-start gap-3 mt-4 px-4 py-3 rounded-xl max-w-sm w-full bg-streak/10 border border-streak/20"
        >
          <Sparkles className="h-5 w-5 text-streak flex-shrink-0 mt-0.5" />
          <p className="text-sm text-foreground leading-relaxed">
            {t('streak.motivationalHint', 'Complete a task every day to build your streak. The longer you go, the more rewards you unlock!')}
          </p>
        </motion.div>
      </div>

      {/* Bottom CTA */}
      <div className="px-6 pb-10 pt-4">
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 }}
          onClick={onContinue}
          className="w-full py-4 rounded-2xl text-[17px] font-bold text-white cursor-pointer active:brightness-95 flex items-center justify-center gap-2"
          style={{ background: ONBOARDING_COLOR, boxShadow: `0 8px 0 0 #2a5cc0` }}
        >
          {t('streak.letsGo', "Let's Go")}
          <ArrowRight className="h-5 w-5" />
        </motion.button>
      </div>
    </motion.div>
  );
};
