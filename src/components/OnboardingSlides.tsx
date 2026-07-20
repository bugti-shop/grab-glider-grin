import { useState, useCallback, useEffect, useRef } from 'react';
import type React from 'react';
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
 * Pixel-perfect onboarding — each slide image already has step dots and a
 * "Next"/"Get Started" button baked in. So the overlay only provides:
 *  - Skip button (top-right)
 *  - Back button (top-left, small)
 *  - Swipe left/right to navigate
 *  - Tap-to-advance only on the baked-in CTA button area
 * No duplicate dots or Next button in the overlay.
 */
export const OnboardingSlides = ({ onComplete }: Props) => {
  const [index, setIndex] = useState(0);
  const isLast = index >= SLIDES.length - 1;

  useEffect(() => {
    // Lock the overlay to the first visual viewport height. Mobile browser
    // chrome collapsing while the user drags must not stretch/zoom the slide
    // image or make the baked-in button look unusually long.
    const root = document.documentElement;
    const setStableHeight = () => {
      root.style.setProperty('--onboarding-stable-height', `${window.innerHeight}px`);
    };
    setStableHeight();
    window.addEventListener('orientationchange', setStableHeight);

    SLIDES.slice(1).forEach((src) => {
      const img = new Image();
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
      {/* Back button — upper left */}
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

      {/* Skip button — top right */}
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

      {/* Slide image — tap advances, swipe left/right navigates */}
      <SwipeArea onNext={next} onBack={back} onTap={next}>
        <img
          key={index}
          src={SLIDES[index]}
          alt=""
          draggable={false}
          width={1429}
          height={2560}
          decoding="async"
          fetchPriority={index === 0 ? 'high' : 'auto'}
          loading={index === 0 ? 'eager' : 'lazy'}
          className="w-full h-full object-cover animate-in fade-in duration-300 pointer-events-none will-change-transform"
          style={{
            objectPosition: 'center center',
            transform: 'scale(1.055)',
            transformOrigin: 'center center',
          }}
        />
      </SwipeArea>
    </div>
  );
};

export default OnboardingSlides;

interface SwipeAreaProps {
  onNext: () => void;
  onBack: () => void;
  onTap: () => void;
  children: React.ReactNode;
}

const SWIPE_THRESHOLD = 50;
const TAP_MAX_MOVE = 8;

const SwipeArea = ({ onNext, onBack, onTap, children }: SwipeAreaProps) => {
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);
  const locked = useRef<'h' | 'v' | null>(null);
  const moved = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
    startY.current = e.clientY;
    locked.current = null;
    moved.current = false;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (startX.current == null || startY.current == null) return;
    const dx = Math.abs(e.clientX - startX.current);
    const dy = Math.abs(e.clientY - startY.current);
    if (dx > TAP_MAX_MOVE || dy > TAP_MAX_MOVE) moved.current = true;
    if (locked.current) return;
    if (dx > 8 || dy > 8) locked.current = dx > dy ? 'h' : 'v';
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (startX.current == null) return;
    const dx = e.clientX - startX.current;
    if (locked.current === 'h' && Math.abs(dx) > SWIPE_THRESHOLD) {
      if (dx < 0) onNext();
      else onBack();
    } else if (!moved.current && isBottomCtaTap(e)) {
      onTap();
    }
    startX.current = null;
    startY.current = null;
    locked.current = null;
    moved.current = false;
  };

  return (
    <div
      className="flex-1 min-h-0 relative overflow-hidden cursor-pointer"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => { startX.current = null; locked.current = null; moved.current = false; }}
      style={{ touchAction: 'pan-y', overscrollBehavior: 'none' }}
    >
      {children}
    </div>
  );
};

const isBottomCtaTap = (e: React.PointerEvent) => {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;
  return x >= 0.04 && x <= 0.96 && y >= 0.88 && y <= 0.985;
};
