import { useEffect, useRef, useState } from 'react';

export interface IncludeItem {
  image: string;
  alt: string;
  title: string;
  desc: string;
}

interface Props {
  items: IncludeItem[];
  accent?: string;
  autoplay?: boolean;
  autoplayMs?: number;
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function IncludeCarousel({
  items,
  accent = '#0f172a',
  autoplay = true,
  autoplayMs = 4500,
}: Props) {
  const [active, setActive] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const startX = useRef<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);

  // Autoplay
  useEffect(() => {
    if (!autoplay || paused || dragging || reduced || items.length < 2) return;
    const id = window.setInterval(() => {
      setActive((a) => (a + 1) % items.length);
    }, autoplayMs);
    return () => clearInterval(id);
  }, [autoplay, autoplayMs, paused, dragging, reduced, items.length]);

  const go = (dir: 1 | -1) => {
    setActive((a) => {
      const n = a + dir;
      if (n < 0) return items.length - 1;
      if (n >= items.length) return 0;
      return n;
    });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
    setDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (startX.current == null) return;
    setDragX(e.clientX - startX.current);
  };
  const finishDrag = () => {
    if (startX.current == null) return;
    const dx = dragX;
    startX.current = null;
    setDragging(false);
    setDragX(0);
    const width = trackRef.current?.offsetWidth || 300;
    // Sensitivity: 12% of width OR 60px absolute — whichever is smaller
    const threshold = Math.min(width * 0.12, 60);
    if (Math.abs(dx) > threshold) go(dx < 0 ? 1 : -1);
  };

  const transition = reduced
    ? 'none'
    : dragging
      ? 'none'
      : 'transform 420ms cubic-bezier(0.22, 1, 0.36, 1)';

  return (
    <div
      className="w-full select-none"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        ref={trackRef}
        className="relative overflow-hidden px-5 sm:px-8"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        style={{ touchAction: 'pan-y', cursor: dragging ? 'grabbing' : 'grab' }}
      >
        <div
          className="flex items-end will-change-transform"
          style={{
          transform: `translate3d(calc(${-active * 100}% + ${dragX}px), 0, 0)`,
            transition,
            minHeight: 560,
          }}
        >
          {items.map((it) => (
            <div key={it.image} className="flex w-full shrink-0 items-end justify-center">
              <img
                src={it.image}
                alt={it.alt}
                draggable={false}
                loading="lazy"
                className="pointer-events-none h-[540px] w-auto object-contain sm:h-[680px]"
                style={{ background: 'transparent' }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Text card below — swaps to active */}
      <div className="mt-6 flex justify-center px-5 sm:px-8">
        <div
          key={active}
          className={`w-full max-w-md rounded-2xl border border-slate-200 bg-white px-6 py-5 text-center shadow-[0_8px_30px_-12px_rgba(15,23,42,0.15)] ${reduced ? '' : 'animate-in fade-in duration-300'}`}
        >
          <h3 className="mb-1.5 text-[18px] font-extrabold tracking-tight text-slate-900 sm:text-[20px]">
            {items[active].title}
          </h3>
          <p className="text-[13.5px] leading-relaxed text-slate-600 sm:text-[14.5px]">
            {items[active].desc}
          </p>
        </div>
      </div>

      {/* Dots */}
      <div className="mt-6 flex items-center justify-center gap-2">
        {items.map((_, i) => (
          <button
            key={i}
            onClick={() => setActive(i)}
            aria-label={`Show slide ${i + 1}`}
            className="h-2.5 rounded-full transition-all"
            style={{
              width: active === i ? 24 : 8,
              backgroundColor: active === i ? accent : '#cbd5e1',
            }}
          />
        ))}
      </div>
    </div>
  );
}
