import { useState, useCallback, useEffect, useRef } from 'react';
import type React from 'react';
import { Button } from '@/components/ui/button';
import ob01 from '@/assets/onboarding/ob-01-tasks.webp.asset.json';
import ob02 from '@/assets/onboarding/ob-02-notes.webp.asset.json';
import ob03 from '@/assets/onboarding/ob-03-notebooks.webp.asset.json';
import ob04 from '@/assets/onboarding/ob-04-habits.webp.asset.json';
import ob05 from '@/assets/onboarding/ob-05-matrix.webp.asset.json';
import ob06 from '@/assets/onboarding/ob-06-markdown.webp.asset.json';

interface Props {
  onComplete: () => void;
}

const SLIDES = [ob01, ob02, ob03, ob04, ob05, ob06].map((a) => a.url);

/**
 * Onboarding — image slides with a real Duolingo-style CTA rendered on top of
 * the baked-in button area (which is hidden by cropping the bottom of the image).
 * - Skip (top-right), Back (top-left)
 * - Swipe left/right or tap CTA to advance
 * - Bottom CTA matches the Today "Add Task" button style, narrow width.
 */
export const OnboardingSlides = ({ onComplete }: Props) => {
  const [index, setIndex] = useState(0);
  const isLast = index >= SLIDES.length - 1;

  useEffect(() => {
    const root = document.documentElement;
    const setStableHeight = () => {
      root.style.setProperty('--onboarding-stable-height', `${window.innerHeight}px`);
    };
    setStableHeight();
    window.addEventListener('orientationchange', setStableHeight);

    // Preload ALL remaining slides immediately for instant transitions.
    SLIDES.forEach((src, i) => {
      if (i === 0) return;
      const img = new Image();
      img.decoding = 'async';
      img.src = src;
    });

    return () => {
      root.style.removeProperty('--onboarding-stable-height');
      window.removeEventListener('orientationchange', setStableHeight);
    };
  }, []);

  const next = useCallback(() => {
    if (isLast) onComplete();
    else setIndex((i) => i + 1);
  }, [isLast, onComplete]);

  const back = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  return (
    <div
      className="fixed inset-0 z-[400] flex flex-col select-none touch-manipulation"
      role="dialog"
      aria-label="Onboarding"
      style={{
        height: 'var(--onboarding-stable-height, 100vh)',
        maxHeight: 'var(--onboarding-stable-height, 100vh)',
        overflow: 'hidden',
        overscrollBehavior: 'none',
        background: '#f8f8f6',
        paddingTop: 'var(--safe-top, 0px)',
        paddingBottom: 'var(--safe-bottom, 0px)',
      }}
    >
      {/* Back — upper left */}
      {index > 0 && (
        <div
          className="absolute top-0 left-0 z-20 px-4 py-3"
          style={{ paddingTop: 'calc(var(--safe-top, 0px) + 12px)' }}
        >
          <button
            type="button"
            onClick={back}
            className="rounded-full bg-white/90 backdrop-blur-md border border-black/5 px-4 py-2 text-[13px] font-semibold text-black shadow-md active:scale-95 transition"
            aria-label="Previous slide"
          >
            Back
          </button>
        </div>
      )}

      {/* Skip — top right */}
      <div
        className="absolute top-0 right-0 z-20 px-4 py-3"
        style={{ paddingTop: 'calc(var(--safe-top, 0px) + 12px)' }}
      >
        <button
          type="button"
          onClick={onComplete}
          className="rounded-full bg-black/70 backdrop-blur-md px-4 py-2 text-[13px] font-semibold text-white shadow-lg active:scale-95 transition"
          aria-label="Skip onboarding"
        >
          Skip
        </button>
      </div>

      {/* Image area — swipe to navigate. Bottom is cropped to hide baked-in button. */}
      <SwipeArea onNext={next} onBack={back}>
        <img
          key={index}
          src={SLIDES[index]}
          alt=""
          draggable={false}
          width={1429}
          height={2560}
          decoding="async"
          fetchPriority={index === 0 ? 'high' : 'auto'}
          loading={index === 0 ? 'eager' : 'eager'}
          className="w-full h-full object-cover animate-in fade-in duration-300 pointer-events-none will-change-transform"
          style={{
            // object-position top + stronger over-scale hides the baked-in
            // progress dots + CTA button at the bottom of the mockup.
            objectPosition: 'center top',
            transform: 'scale(1.18)',
            transformOrigin: 'center top',
            imageRendering: 'auto' as any,
          }}
        />
      </SwipeArea>

      {/* Real Duolingo-style CTA — narrow, bold, shadow. Matches Today "Add Task". */}
      <div
        className="relative z-10 flex flex-col items-center gap-3 px-6 pt-3"
        style={{ paddingBottom: 'calc(20px + var(--safe-bottom, 0px))' }}
      >
        <div className="flex items-center gap-1.5">
          {SLIDES.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === index ? 'w-6 bg-black' : 'w-1.5 bg-black/25'
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={next}
          className="w-full max-w-[420px] h-14 rounded-full bg-primary text-primary-foreground font-semibold text-[15px] tracking-tight shadow-lg active:scale-[0.98] transition-transform"
        >
          {isLast ? 'Get Started' : 'Continue'}
        </button>
      </div>
    </div>
  );
};

export default OnboardingSlides;

interface SwipeAreaProps {
  onNext: () => void;
  onBack: () => void;
  children: React.ReactNode;
}

const SWIPE_THRESHOLD = 50;

const SwipeArea = ({ onNext, onBack, children }: SwipeAreaProps) => {
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const locked = useRef<'h' | 'v' | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
    startY.current = e.clientY;
    locked.current = null;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (startX.current == null || startY.current == null || locked.current) return;
    const dx = Math.abs(e.clientX - startX.current);
    const dy = Math.abs(e.clientY - startY.current);
    if (dx > 8 || dy > 8) locked.current = dx > dy ? 'h' : 'v';
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (startX.current == null) return;
    const dx = e.clientX - startX.current;
    if (locked.current === 'h' && Math.abs(dx) > SWIPE_THRESHOLD) {
      if (dx < 0) onNext();
      else onBack();
    }
    startX.current = null;
    startY.current = null;
    locked.current = null;
  };

  return (
    <div
      className="flex-1 min-h-0 relative overflow-hidden"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { startX.current = null; locked.current = null; }}
      style={{ touchAction: 'pan-y', overscrollBehavior: 'none' }}
    >
      {children}
    </div>
  );
};
