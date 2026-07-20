import { useState, useCallback, useEffect, useRef } from 'react';
import ob01 from '@/assets/onboarding/ob-01-tasks.png.asset.json';
import ob02 from '@/assets/onboarding/ob-02-notes.png.asset.json';
import ob03 from '@/assets/onboarding/ob-03-notebooks.png.asset.json';
import ob04 from '@/assets/onboarding/ob-04-habits.png.asset.json';
import ob05 from '@/assets/onboarding/ob-05-matrix.png.asset.json';
import ob06 from '@/assets/onboarding/ob-06-markdown.png.asset.json';

interface Props {
  onComplete: () => void;
}

const SLIDES = [ob01, ob02, ob03, ob04, ob05, ob06].map((a) => a.url);

/**
 * Pixel-perfect onboarding — each slide is the user-approved rendered mockup.
 * Explicit Back / Next / Skip controls overlay the artwork (no tap-to-advance),
 * fully mobile-friendly with safe-area padding.
 */
export const OnboardingSlides = ({ onComplete }: Props) => {
  const [index, setIndex] = useState(0);
  const isLast = index >= SLIDES.length - 1;

  // Preload remaining slides once mounted.
  useEffect(() => {
    SLIDES.slice(1).forEach((src) => {
      const img = new Image();
      img.src = src;
    });
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
      className="fixed inset-0 z-[400] flex flex-col bg-[#f0efe9] select-none touch-manipulation"
      role="dialog"
      aria-label="Onboarding"
      style={{
        paddingTop: 'var(--safe-top, 0px)',
        paddingBottom: 'var(--safe-bottom, 0px)',
      }}
    >
      {/* Skip button — top right */}
      <div className="absolute top-0 right-0 z-10 flex items-center gap-2 px-4 py-3"
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

      {/* Slide image — swipe left/right to navigate */}
      <SwipeArea onNext={next} onBack={back}>
        <img
          key={index}
          src={SLIDES[index]}
          alt=""
          draggable={false}
          className="w-full h-full object-cover animate-in fade-in duration-300 pointer-events-none"
          style={{ objectPosition: 'center center' }}
        />
      </SwipeArea>

      {/* Bottom controls: Back / dots / Next */}
      <div
        className="relative z-10 flex items-center justify-between gap-3 px-5 pt-3"
        style={{ paddingBottom: 'calc(var(--safe-bottom, 0px) + 16px)' }}
      >
        <button
          type="button"
          onClick={back}
          disabled={index === 0}
          className="min-w-[80px] rounded-full border border-black/10 bg-white px-5 py-3 text-[15px] font-semibold text-black shadow-sm active:scale-95 transition disabled:opacity-0 disabled:pointer-events-none"
          aria-label="Previous slide"
        >
          Back
        </button>

        <div className="flex items-center gap-1.5" aria-hidden>
          {SLIDES.map((_, i) => (
            <span
              key={i}
              className="rounded-full transition-all duration-200"
              style={{
                width: i === index ? 20 : 6,
                height: 6,
                backgroundColor: i === index ? '#000' : 'rgba(0,0,0,0.25)',
              }}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={next}
          className="min-w-[110px] rounded-full bg-[#2563EB] px-6 py-3 text-[15px] font-semibold text-white shadow-md active:scale-95 transition"
          aria-label={isLast ? 'Finish onboarding' : 'Next slide'}
        >
          {isLast ? 'Get Started' : 'Next'}
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
    if (startX.current == null || startY.current == null) return;
    if (locked.current) return;
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
      style={{ touchAction: 'pan-y' }}
    >
      {children}
    </div>
  );
};
