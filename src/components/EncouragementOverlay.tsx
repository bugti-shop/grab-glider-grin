import { useEffect, useState, useCallback } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { triggerNotificationHaptic } from '@/utils/haptics';
import { playMilestoneSound } from '@/utils/gamificationSounds';

interface EncouragementEvent {
  message: string;
  count: number;
}

interface MilestoneEvent {
  count: number;
  title: string;
  subtitle: string;
  icon: string;
}

/**
 * Duolingo-style floating encouragement text + milestone celebration overlay.
 * Mounts once at App level.
 */
export const EncouragementOverlay = () => {
  const [encouragement, setEncouragement] = useState<EncouragementEvent | null>(null);
  const [milestone, setMilestone] = useState<MilestoneEvent | null>(null);
  const [showEnc, setShowEnc] = useState(false);
  const [showMs, setShowMs] = useState(false);

  useEffect(() => {
    const onEnc = (e: CustomEvent<EncouragementEvent>) => {
      // Don't show encouragement if milestone is showing
      if (showMs) return;
      setEncouragement(e.detail);
      setShowEnc(true);
      setTimeout(() => setShowEnc(false), 1200);
    };

    const onMs = (e: CustomEvent<MilestoneEvent>) => {
      setMilestone(e.detail);
      setShowMs(true);
      triggerNotificationHaptic('success');
      playMilestoneSound();
      setTimeout(() => setShowMs(false), 3000);
    };

    window.addEventListener('taskEncouragement', onEnc as EventListener);
    window.addEventListener('taskMilestone', onMs as EventListener);
    return () => {
      window.removeEventListener('taskEncouragement', onEnc as EventListener);
      window.removeEventListener('taskMilestone', onMs as EventListener);
    };
  }, [showMs]);

  return (
    <>
      {/* Floating encouragement text */}
      <AnimatePresence>
        {showEnc && encouragement && !showMs && (
          <motion.div
            key={`enc-${Date.now()}`}
            initial={{ opacity: 0, y: 20, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -30, scale: 0.6 }}
            transition={{ type: 'spring', damping: 15, stiffness: 400 }}
            className="fixed top-16 left-1/2 -translate-x-1/2 z-[85] pointer-events-none"
          >
            <div className="bg-card/95 backdrop-blur-sm border border-border rounded-2xl px-5 py-2.5 shadow-lg">
              <span className="text-base font-bold text-foreground">
                {encouragement.message}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Milestone celebration — Duolingo-style full overlay */}
      <AnimatePresence>
        {showMs && milestone && (
          <motion.div
            key={`ms-${milestone.count}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[95] pointer-events-none flex items-center justify-center"
          >
            {/* Radial glow background */}
            <motion.div
              className="absolute inset-0"
              style={{
                background: 'radial-gradient(circle at center, hsl(var(--primary) / 0.15) 0%, transparent 70%)',
              }}
              animate={{ opacity: [0, 1, 0.5] }}
              transition={{ duration: 2 }}
            />

            {/* Central card */}
            <motion.div
              initial={{ scale: 0, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0.5, opacity: 0, y: -50 }}
              transition={{ type: 'spring', damping: 12, stiffness: 200 }}
              className="relative flex flex-col items-center gap-3"
            >
              {/* Big icon with pulse */}
              <motion.div
                animate={{
                  scale: [1, 1.3, 1],
                }}
                transition={{ duration: 0.6, repeat: 2 }}
                className="text-6xl"
              >
                {milestone.icon}
              </motion.div>

              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-2xl font-black text-foreground text-center"
              >
                {milestone.title}
              </motion.h2>

              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="text-sm text-muted-foreground text-center"
              >
                {milestone.subtitle}
              </motion.p>

              {/* Floating sparkle particles */}
              {Array.from({ length: 8 }).map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-2 h-2 rounded-full bg-primary"
                  initial={{ x: 0, y: 0, opacity: 0.8 }}
                  animate={{
                    x: (Math.cos((i / 8) * Math.PI * 2)) * 120,
                    y: (Math.sin((i / 8) * Math.PI * 2)) * 120,
                    opacity: 0,
                    scale: 0,
                  }}
                  transition={{ duration: 1.2, delay: 0.1 + i * 0.05, ease: 'easeOut' }}
                />
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
