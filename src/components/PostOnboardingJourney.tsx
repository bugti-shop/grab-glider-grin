import { useState, useEffect } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { MapPin, Compass } from 'lucide-react';
import { getActiveJourney } from '@/utils/virtualJourneyStorage';
import { useTranslation } from 'react-i18next';

interface PostOnboardingJourneyProps {
  onDismiss: () => void;
}

export const PostOnboardingJourney = ({ onDismiss }: PostOnboardingJourneyProps) => {
  const { t } = useTranslation();
  const active = getActiveJourney();
  const [phase, setPhase] = useState(0); // 0=enter, 1=show milestones, 2=exit

  useEffect(() => {
    if (!active) {
      onDismiss();
      return;
    }
    const t1 = setTimeout(() => setPhase(1), 800);
    const t2 = setTimeout(() => setPhase(2), 3500);
    const t3 = setTimeout(onDismiss, 4200);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDismiss, active]);

  if (!active) return null;

  const { journey, progress } = active;
  const firstMilestone = journey.milestones[0];

  return (
    <AnimatePresence>
      {phase < 2 && (
        <motion.div
          className="fixed inset-0 z-[250] flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          onClick={onDismiss}
        >
          {/* Journey emoji */}
          <div className="flex flex-col items-center px-8 text-center">
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', damping: 12, stiffness: 200, delay: 0.2 }}
              className="text-7xl mb-4"
            >
              {journey.emoji}
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="text-2xl font-black text-white font-['Nunito'] tracking-tight"
            >
              {t('journey.yourAdventure', 'Your Adventure Begins!')}
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.5 }}
              className="text-white/60 text-sm font-['Nunito_Sans'] mt-2 mb-6"
            >
              {t(`journey.${journey.id}.name`, journey.name)} — {journey.totalTasks} {t('common.tasks', 'tasks')}
            </motion.p>

            {/* Milestone path preview */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: phase >= 1 ? 1 : 0, scale: phase >= 1 ? 1 : 0.9 }}
              transition={{ delay: 0.1, duration: 0.4 }}
              className="flex items-center gap-2"
            >
              {journey.milestones.slice(0, 5).map((ms, i) => (
                <motion.div
                  key={ms.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.9 + i * 0.12, type: 'spring', damping: 15 }}
                  className="flex flex-col items-center"
                >
                  <div className="w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-lg">
                    {ms.icon}
                  </div>
                  {i < Math.min(4, journey.milestones.length - 1) && (
                    <div className="w-6 h-px bg-white/20 absolute" style={{ transform: 'translateX(23px)' }} />
                  )}
                </motion.div>
              ))}
            </motion.div>

            {/* First milestone hint */}
            {firstMilestone && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: phase >= 1 ? 1 : 0, y: phase >= 1 ? 0 : 10 }}
                transition={{ delay: 0.3, duration: 0.4 }}
                className="mt-6 flex items-center gap-2 text-white/50 text-xs font-['Nunito_Sans']"
              >
                <MapPin className="h-3.5 w-3.5" />
                <span>{t('journey.firstStop', 'First stop')}: {t(`journey.${journey.id}.${firstMilestone.id}`, firstMilestone.name)}</span>
              </motion.div>
            )}

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: phase >= 1 ? 0.4 : 0 }}
              transition={{ delay: 0.5 }}
              className="text-white/30 text-xs mt-8 font-['Nunito_Sans']"
            >
              {t('common.tapToContinue', 'Tap to continue')}
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
