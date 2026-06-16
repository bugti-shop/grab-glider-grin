import { useEffect } from 'react';
import { m as motion, AnimatePresence } from 'framer-motion';
import { LazyConfetti } from '@/components/LazyConfetti';
import { triggerHaptic } from '@/utils/haptics';

const ONBOARDING_COLOR = '#3c78f0';

interface FirstStepCelebrationProps {
  userName: string;
  onDismiss: () => void;
}

export const FirstStepCelebration = ({ userName, onDismiss }: FirstStepCelebrationProps) => {
  // Play achievement sound and haptic
  useEffect(() => {
    triggerHaptic();
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const t = ctx.currentTime;
      const play = (freq: number, delay: number, dur: number, type: OscillatorType = 'sine', vol = 0.2) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(freq, t + delay);
        osc.type = type;
        gain.gain.setValueAtTime(0, t + delay);
        gain.gain.linearRampToValueAtTime(vol, t + delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.01, t + delay + dur);
        osc.start(t + delay);
        osc.stop(t + delay + dur);
      };
      // Triumphant ascending arpeggio
      play(523.25, 0, 0.25, 'triangle', 0.18);
      play(659.25, 0.1, 0.25, 'triangle', 0.2);
      play(783.99, 0.2, 0.25, 'triangle', 0.22);
      play(1046.50, 0.3, 0.5, 'sine', 0.25);
      // Final chord
      [523.25, 783.99, 1046.50].forEach(f => play(f, 0.5, 0.8, 'sine', 0.1));
      setTimeout(() => ctx.close(), 2000);
    } catch {}
  }, []);

  const displayName = userName.trim().split(/\s+/)[0] || '';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[350] flex items-center justify-center"
        style={{ background: 'linear-gradient(180deg, #ffffff 0%, #f0f5ff 100%)' }}
      >
        {/* Confetti */}
        <LazyConfetti
          width={window.innerWidth}
          height={window.innerHeight}
          recycle={true}
          numberOfPieces={180}
          gravity={0.12}
          colors={[ONBOARDING_COLOR, '#FFD700', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6']}
          style={{ position: 'fixed', top: 0, left: 0, zIndex: 351 }}
        />

        {/* Glow */}
        <motion.div
          className="absolute rounded-full blur-3xl"
          style={{ width: 300, height: 300, background: ONBOARDING_COLOR, opacity: 0.08, top: '25%', left: '50%', transform: 'translateX(-50%)' }}
          animate={{ scale: [1, 1.3, 1], opacity: [0.06, 0.12, 0.06] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        />

        <div className="relative z-10 flex flex-col items-center text-center px-8 w-full max-w-sm">
          {/* Badge label */}
          <motion.p
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="text-[11px] font-bold tracking-[0.3em] uppercase mb-6"
            style={{ color: ONBOARDING_COLOR }}
          >
            🎉 Achievement Unlocked!
          </motion.p>

          {/* Medal */}
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 140, damping: 12, delay: 0.25 }}
            className="relative mb-5"
          >
            {/* Pulse ring */}
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ boxShadow: `0 0 50px 15px ${ONBOARDING_COLOR}30, 0 0 100px 30px ${ONBOARDING_COLOR}15` }}
              animate={{ scale: [1, 1.15, 1], opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            />
            <div
              className="w-24 h-24 rounded-full flex items-center justify-center relative z-10"
              style={{ background: `${ONBOARDING_COLOR}12`, border: `3px solid ${ONBOARDING_COLOR}35` }}
            >
              <motion.span
                animate={{ y: [0, -5, 0], rotate: [0, -5, 5, 0] }}
                transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                className="text-[52px]"
              >
                🏅
              </motion.span>
            </div>
          </motion.div>

          {/* Title */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 180, delay: 0.45 }}
          >
            <h2 className="text-[34px] font-black text-[#1a1a1a] leading-tight">
              First Step
            </h2>
            <p className="text-[14px] text-[#767b7e] mt-1 font-medium">
              You created your first Task, Note & Sketch!
            </p>
          </motion.div>

          {/* Awarded to user */}
          {displayName && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.65 }}
              className="mt-3 mb-1"
            >
              <span className="text-[12px] text-[#999]">Awarded to </span>
              <span className="text-[13px] font-bold text-[#1a1a1a]">{displayName}</span>
            </motion.div>
          )}

          {/* Achievement items */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.75 }}
            className="flex gap-5 mt-6 mb-8"
          >
            {[
              { emoji: '✅', label: 'Task' },
              { emoji: '📝', label: 'Note' },
              { emoji: '🎨', label: 'Sketch' },
            ].map((item, i) => (
              <motion.div
                key={item.label}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.85 + i * 0.1, type: 'spring', stiffness: 200 }}
                className="flex flex-col items-center gap-1.5"
              >
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{ background: `${ONBOARDING_COLOR}08`, border: `1.5px solid ${ONBOARDING_COLOR}20` }}
                >
                  <span className="text-2xl">{item.emoji}</span>
                </div>
                <span className="text-[10px] font-bold text-[#999] uppercase tracking-wider">{item.label}</span>
              </motion.div>
            ))}
          </motion.div>

          {/* Certificate preview card */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.95 }}
            className="w-full rounded-2xl overflow-hidden mb-8"
            style={{ border: `1.5px solid ${ONBOARDING_COLOR}25`, background: `${ONBOARDING_COLOR}05` }}
          >
            <div className="p-4 text-center">
              <div className="h-0.5 w-12 mx-auto rounded-full mb-2.5" style={{ background: ONBOARDING_COLOR }} />
              <p className="text-[10px] tracking-[0.2em] uppercase font-bold" style={{ color: ONBOARDING_COLOR }}>
                Certificate of Achievement
              </p>
              <p className="text-[12px] mt-2 text-[#767b7e]">
                Created 1 Task · 1 Note · 1 Sketch
              </p>
              <div className="h-0.5 w-12 mx-auto rounded-full mt-2.5" style={{ background: ONBOARDING_COLOR }} />
            </div>
          </motion.div>

          {/* Continue button */}
          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.15 }}
            onClick={onDismiss}
            className="w-full py-4 rounded-2xl text-[17px] font-bold cursor-pointer active:brightness-95"
            style={{
              backgroundColor: '#1a1a1a',
              color: '#ffffff',
              boxShadow: '0 4px 0 0 #000',
              WebkitTapHighlightColor: 'transparent',
            }}
            whileTap={{ scale: 0.97 }}
          >
            Continue
          </motion.button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
