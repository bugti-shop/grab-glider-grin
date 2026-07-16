import { useRef, useState } from 'react';

export interface IncludeItem {
  image: string;
  alt: string;
  title: string;
  desc: string;
}

interface Props {
  items: IncludeItem[];
  accent?: string;
}

export default function IncludeCarousel({ items, accent = '#0f172a' }: Props) {
  const [active, setActive] = useState(0);
  const [dragX, setDragX] = useState(0);
  const startX = useRef<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const go = (dir: 1 | -1) => {
    setActive((a) => Math.min(items.length - 1, Math.max(0, a + dir)));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (startX.current == null) return;
    setDragX(e.clientX - startX.current);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (startX.current == null) return;
    const dx = e.clientX - startX.current;
    startX.current = null;
    setDragX(0);
    const threshold = (trackRef.current?.offsetWidth || 300) * 0.15;
    if (Math.abs(dx) > threshold) go(dx < 0 ? 1 : -1);
  };

  return (
    <div className="w-full select-none">
      <div
        ref={trackRef}
        className="relative overflow-hidden px-5 sm:px-8"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { startX.current = null; setDragX(0); }}
        style={{ touchAction: 'pan-y', cursor: startX.current != null ? 'grabbing' : 'grab' }}
      >
        {/* Horizontal track: all images side-by-side, translated by active + drag */}
        <div
          className="flex items-end"
          style={{
            transform: `translate3d(calc(${-active * 100}% + ${dragX}px), 0, 0)`,
            transition: startX.current != null ? 'none' : 'transform 300ms cubic-bezier(0.22, 1, 0.36, 1)',
            minHeight: 460,
          }}
        >
          {items.map((it) => (
            <div key={it.image} className="flex w-full shrink-0 items-end justify-center">
              <img
                src={it.image}
                alt={it.alt}
                draggable={false}
                className="h-[440px] w-auto object-contain sm:h-[560px] pointer-events-none"
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
          className="w-full max-w-md rounded-2xl border border-slate-200 bg-white px-6 py-5 text-center shadow-[0_8px_30px_-12px_rgba(15,23,42,0.15)] animate-in fade-in duration-300"
        >
          <h3 className="mb-1.5 text-[18px] font-extrabold tracking-tight text-slate-900 sm:text-[20px]">
            {items[active].title}
          </h3>
          <p className="text-[13.5px] leading-relaxed text-slate-600 sm:text-[14.5px]">
            {items[active].desc}
          </p>
        </div>
      </div>

      {/* Dots — click to swap */}
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
