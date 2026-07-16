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
}

export default function IncludeCarousel({ items, accent = '#0f172a' }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const io = new IntersectionObserver(
      (entries) => {
        // pick the entry most in view
        let best = { i: active, ratio: 0 };
        entries.forEach((e) => {
          const i = Number((e.target as HTMLElement).dataset.index);
          if (e.intersectionRatio > best.ratio) best = { i, ratio: e.intersectionRatio };
        });
        if (best.ratio > 0) setActive(best.i);
      },
      { root: scroller, threshold: [0.5, 0.75, 1] },
    );
    cardRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [items.length]);

  const scrollTo = (i: number) => {
    const el = cardRefs.current[i];
    if (el) el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  };

  return (
    <div className="w-full">
      <div
        ref={scrollerRef}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-5 pb-4 sm:gap-6 sm:px-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((item, i) => (
          <div
            key={item.title}
            ref={(el) => (cardRefs.current[i] = el)}
            data-index={i}
            className="flex snap-center shrink-0 basis-[85%] flex-col items-center sm:basis-[420px]"
          >
            <div className="flex w-full flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-gradient-to-b from-[#f7f9fc] to-white shadow-[0_10px_40px_-15px_rgba(15,23,42,0.15)]">
              <div className="flex items-center justify-center px-4 pt-8 pb-2 sm:px-6 sm:pt-10">
                <img
                  src={item.image}
                  alt={item.alt}
                  loading="lazy"
                  className="h-[380px] w-auto object-contain sm:h-[440px]"
                />
              </div>
              <div className="px-6 pb-7 pt-3 text-center sm:px-8 sm:pb-8">
                <h3 className="mb-2 text-[20px] font-extrabold tracking-tight text-slate-900 sm:text-[22px]">
                  {item.title}
                </h3>
                <p className="text-[14px] leading-relaxed text-slate-600 sm:text-[15px]">
                  {item.desc}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Dots */}
      <div className="mt-4 flex items-center justify-center gap-2">
        {items.map((_, i) => (
          <button
            key={i}
            onClick={() => scrollTo(i)}
            aria-label={`Show slide ${i + 1}`}
            className="h-2.5 rounded-full transition-all"
            style={{
              width: active === i ? 22 : 8,
              backgroundColor: active === i ? accent : '#cbd5e1',
            }}
          />
        ))}
      </div>
    </div>
  );
}
