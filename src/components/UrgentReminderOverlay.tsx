import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlarmClock } from 'lucide-react';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { playRingtone, stopRingtone, RingtoneType } from '@/utils/urgentRingtones';
import { getSetting } from '@/utils/settingsStorage';
import { loadTodoItems, saveTodoItems } from '@/utils/todoItemsStorage';

interface UrgentReminder {
  id: string;
  taskName: string;
  triggeredAt: Date;
  reminderTime?: string;
}

export const UrgentReminderOverlay = () => {
  const [reminder, setReminder] = useState<UrgentReminder | null>(null);
  const [slideX, setSlideX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const sliderRef = useRef<HTMLDivElement>(null);
  const trackWidth = useRef(0);
  const dismissThreshold = 0.8;

  useEffect(() => {
    const handleUrgentReminder = (e: CustomEvent<UrgentReminder>) => {
      setReminder(e.detail);
      setSlideX(0);
      triggerUrgentHaptics();
      getSetting<RingtoneType>('urgentRingtone', 'alarm').then(tone => {
        playRingtone(tone);
      });
    };

    window.addEventListener('urgentReminderTriggered', handleUrgentReminder as EventListener);
    return () => window.removeEventListener('urgentReminderTriggered', handleUrgentReminder as EventListener);
  }, []);

  const triggerUrgentHaptics = async () => {
    try {
      for (let i = 0; i < 3; i++) {
        await Haptics.impact({ style: ImpactStyle.Heavy });
        await new Promise(r => setTimeout(r, 100));
      }
    } catch {}
  };

  const dismiss = useCallback(() => {
    stopRingtone();
    Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
    setReminder(null);
    setSlideX(0);
  }, []);

  const handleComplete = useCallback(async () => {
    if (!reminder) return;
    try {
      const items = await loadTodoItems();
      const updated = items.map(item =>
        item.id === reminder.id ? { ...item, completed: true, completedAt: new Date() } : item
      );
      await saveTodoItems(updated);
      // Dispatch tasksRestored so Today page reloads its state from storage
      window.dispatchEvent(new CustomEvent('tasksRestored', { detail: updated }));
      // Also notify Firebase sync and other listeners
      window.dispatchEvent(new CustomEvent('tasksUpdated'));
    } catch (e) {
      console.error('[UrgentReminder] Failed to complete task:', e);
    }
    dismiss();
  }, [reminder, dismiss]);

  const handleTouchStart = useCallback(() => {
    setIsDragging(true);
    if (sliderRef.current) {
      trackWidth.current = sliderRef.current.getBoundingClientRect().width - 56;
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging || !sliderRef.current) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const x = e.touches[0].clientX - rect.left - 28;
    const clamped = Math.max(0, Math.min(x, trackWidth.current));
    setSlideX(clamped);
  }, [isDragging]);

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
    const progress = trackWidth.current > 0 ? slideX / trackWidth.current : 0;
    if (progress >= dismissThreshold) {
      dismiss();
    } else {
      setSlideX(0);
    }
  }, [slideX, dismiss]);

  const handleMouseDown = useCallback(() => {
    setIsDragging(true);
    if (sliderRef.current) {
      trackWidth.current = sliderRef.current.getBoundingClientRect().width - 56;
    }
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: MouseEvent) => {
      if (!sliderRef.current) return;
      const rect = sliderRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - 28;
      const clamped = Math.max(0, Math.min(x, trackWidth.current));
      setSlideX(clamped);
    };
    const handleUp = () => {
      setIsDragging(false);
      const progress = trackWidth.current > 0 ? slideX / trackWidth.current : 0;
      if (progress >= dismissThreshold) {
        dismiss();
      } else {
        setSlideX(0);
      }
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging, slideX, dismiss]);

  if (!reminder) return null;

  const displayTime = reminder.reminderTime || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const slideProgress = trackWidth.current > 0 ? slideX / trackWidth.current : 0;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-between py-16 px-6"
      >
        {/* Top section - alarm icon + task name */}
        <div className="flex flex-col items-center gap-3 mt-8">
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          >
            <AlarmClock className="w-10 h-10 text-white/70" />
          </motion.div>
          <p className="text-white/90 text-lg font-medium text-center max-w-xs leading-snug">
            {reminder.taskName}
          </p>
        </div>

        {/* Center - Big time display + Flowist branding */}
        <div className="flex flex-col items-center gap-4">
          <motion.h1
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-white font-bold text-center leading-none"
            style={{ fontSize: 'clamp(5rem, 20vw, 8rem)' }}
          >
            {displayTime}
          </motion.h1>
          <p className="text-white/30 text-sm font-medium tracking-widest uppercase">Flowist</p>
        </div>

        {/* Bottom section - Complete button + Slide to stop */}
        <div className="w-full max-w-sm flex flex-col gap-4">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleComplete}
            className="w-full py-4 rounded-2xl text-white font-semibold text-lg transition-all active:brightness-90"
            style={{ backgroundColor: '#3c78f0' }}
          >
            Complete
          </motion.button>

          <div
            ref={sliderRef}
            className="relative w-full h-14 rounded-full overflow-hidden"
            style={{ backgroundColor: 'rgba(255,255,255,0.1)' }}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-none"
              style={{
                width: slideX + 56,
                backgroundColor: `rgba(239, 68, 68, ${0.2 + slideProgress * 0.4})`,
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span
                className="text-white/40 text-sm font-medium transition-opacity"
                style={{ opacity: 1 - slideProgress }}
              >
                slide to stop
              </span>
            </div>
            <div
              className="absolute top-1 left-1 w-12 h-12 rounded-full bg-white/20 backdrop-blur flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
              style={{
                transform: `translateX(${slideX}px)`,
                transition: isDragging ? 'none' : 'transform 0.3s ease',
              }}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onMouseDown={handleMouseDown}
            >
              <div className="w-6 h-1 rounded-full bg-white/60" />
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
