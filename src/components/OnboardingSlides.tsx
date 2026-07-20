import { useState, useCallback } from 'react';
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
 * Pixel-perfect onboarding — each slide is the user-approved rendered mockup
 * (mockups + copy + step counter + dots + Next button are baked into the image).
 * Mockups appear slightly zoomed via `object-cover`. Whole screen is tappable
 * to advance; last slide completes onboarding.
 */
export const OnboardingSlides = ({ onComplete }: Props) => {
  const [index, setIndex] = useState(0);
  const [preloaded, setPreloaded] = useState(false);

  // Preload remaining slides once first slide has painted.
  if (!preloaded && typeof window !== 'undefined') {
    setPreloaded(true);
    SLIDES.slice(1).forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }

  const advance = useCallback(() => {
    if (index >= SLIDES.length - 1) {
      onComplete();
    } else {
      setIndex((i) => i + 1);
    }
  }, [index, onComplete]);

  return (
    <div
      className="fixed inset-0 z-[400] flex items-stretch justify-center bg-[#f0efe9] select-none touch-manipulation cursor-pointer"
      onClick={advance}
      role="button"
      aria-label="Continue onboarding"
      style={{
        paddingTop: 'var(--safe-top, 0px)',
        paddingBottom: 'var(--safe-bottom, 0px)',
      }}
    >
      <img
        key={index}
        src={SLIDES[index]}
        alt=""
        draggable={false}
        className="w-full h-full object-cover animate-in fade-in duration-300"
        style={{ objectPosition: 'center center' }}
      />
    </div>
  );
};

export default OnboardingSlides;
