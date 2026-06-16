/**
 * Smart Review Prompt Dialog
 * Shows after milestone celebrations at peak happiness moments.
 */

import { useState, useEffect, useCallback } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { Star, X, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { triggerHaptic } from '@/utils/haptics';
import {
  shouldShowReviewPrompt,
  recordPromptShown,
  recordRated,
  recordDismissed,
  openPlayStoreReview,
} from '@/utils/smartReviewPrompt';

export const SmartReviewPrompt = () => {
  const [visible, setVisible] = useState(false);
  const [milestone, setMilestone] = useState<number>(0);

  useEffect(() => {
    const handler = async (e: CustomEvent<{ milestone: number }>) => {
      const m = e.detail.milestone;
      const show = await shouldShowReviewPrompt(m);
      if (show) {
        setMilestone(m);
        // Delay so it appears AFTER the milestone celebration closes
        setTimeout(() => {
          setVisible(true);
          recordPromptShown();
        }, 1500);
      }
    };

    window.addEventListener('reviewPromptCheck', handler as EventListener);
    return () => window.removeEventListener('reviewPromptCheck', handler as EventListener);
  }, []);

  const handleRate = useCallback(async () => {
    triggerHaptic('medium').catch(() => {});
    await recordRated();
    await openPlayStoreReview();
    setVisible(false);
  }, []);

  const handleLater = useCallback(async () => {
    await recordDismissed();
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm px-6"
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0, y: 30 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.8, opacity: 0, y: 30 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          className="bg-background rounded-2xl p-6 w-full max-w-sm shadow-2xl relative overflow-hidden"
        >
          {/* Decorative glow */}
          <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -bottom-16 -left-16 w-32 h-32 rounded-full bg-primary/10 blur-3xl" />

          {/* Close */}
          <button
            onClick={handleLater}
            className="absolute top-3 right-3 p-1.5 rounded-full hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>

          {/* Content */}
          <div className="relative z-10 flex flex-col items-center text-center">
            {/* Stars animation */}
            <motion.div
              className="flex gap-1 mb-3"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', delay: 0.1 }}
            >
              {[1, 2, 3, 4, 5].map((i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + i * 0.08 }}
                >
                  <Star className="h-7 w-7 fill-primary text-primary" />
                </motion.div>
              ))}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Heart className="h-5 w-5 text-destructive fill-destructive mx-auto mb-2" />
              <h3 className="text-lg font-bold text-foreground mb-1">
                Loving Flowist?
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed mb-5">
                You just hit a <span className="font-semibold text-foreground">{milestone}-day streak!</span>
                {' '}Your dedication is amazing. Would you mind leaving a quick review? It really helps us grow! 🙏
              </p>
            </motion.div>

            <motion.div
              className="w-full space-y-2.5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              <Button
                onClick={handleRate}
                className="w-full gap-2"
                size="lg"
              >
                <Star className="h-4 w-4" />
                Rate on Play Store
              </Button>

              <button
                onClick={handleLater}
                className="w-full py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Maybe Later
              </button>
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
