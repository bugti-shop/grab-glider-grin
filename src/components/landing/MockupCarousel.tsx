import { useState, useRef, useEffect } from 'react';

interface Slide {
  src: string;
  alt: string;
}

interface Props {
  slides: Slide[];
  tilt?: string;
  accent?: string;
}

/**
 * Horizontally swipeable iPhone-mockup carousel with dot indicators.
 * - Native scroll-snap for smooth touch/trackpad swipes.
 * - Dots update on scroll, and clicking a dot scrolls to that slide.
 */
export function MockupCarousel({ slides, tilt = '', accent = '#3c78f0' }: Props) {
  const [active, setActive] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const i = Math.round(el.scrollLeft / el.clientWidth);
        setActive(Math.max(0, Math.min(slides.length - 1, i)));
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [slides.length]);

  const goTo = (i: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };

  return (
    <div className="flex w-full flex-col items-center">
      <div className="relative h-[360px] w-full sm:h-[420px]">
        {/* Ambient glow, matches hero */}
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-[70%] w-[70%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[70px]"
          style={{ backgroundColor: `${accent}40` }}
          aria-hidden
        />
        <div
          ref={scrollerRef}
          className="no-scrollbar relative flex h-full w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden scroll-smooth"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {slides.map((s, i) => (
            <div
              key={i}
              className="flex h-full w-full flex-shrink-0 snap-center items-center justify-center"
            >
              <img
                src={s.src}
                alt={s.alt}
                loading={i === 0 ? 'eager' : 'lazy'}
                decoding="async"
                draggable={false}
                className={`relative h-full w-auto object-contain drop-shadow-[0_50px_70px_rgba(30,60,140,0.45)] transition-transform duration-700 ${tilt}`}
                style={{ willChange: 'transform', backfaceVisibility: 'hidden' }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Dots */}
      {slides.length > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          {slides.map((_, i) => {
            const isActive = i === active;
            return (
              <button
                key={i}
                type="button"
                onClick={() => goTo(i)}
                aria-label={`Show image ${i + 1}`}
                aria-current={isActive}
                className="h-2 rounded-full transition-all duration-300"
                style={{
                  width: isActive ? 22 : 8,
                  backgroundColor: isActive ? accent : '#cbd5e1',
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
