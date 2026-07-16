import { useState } from 'react';

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
  const item = items[active];
  if (!item) return null;

  return (
    <div className="w-full">
      <div className="flex flex-col items-center px-5 sm:px-8">
        {/* Image only — no background, no card */}
        <div className="flex w-full items-end justify-center" style={{ minHeight: 380 }}>
          <img
            key={item.image}
            src={item.image}
            alt={item.alt}
            className="h-[360px] w-auto object-contain sm:h-[440px] animate-in fade-in duration-300"
            style={{ background: 'transparent' }}
          />
        </div>

        {/* Small text-only card below */}
        <div className="mt-6 w-full max-w-md rounded-2xl border border-slate-200 bg-white px-6 py-5 text-center shadow-[0_8px_30px_-12px_rgba(15,23,42,0.15)]">
          <h3 className="mb-1.5 text-[18px] font-extrabold tracking-tight text-slate-900 sm:text-[20px]">
            {item.title}
          </h3>
          <p className="text-[13.5px] leading-relaxed text-slate-600 sm:text-[14.5px]">
            {item.desc}
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
