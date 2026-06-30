import { useEffect, useRef, useState } from 'react';

// Flip-clock style digit panels matching the reference screenshot.
// Pure CSS — each card has a horizontal divider at mid-height.

const Digit = ({ d }: { d: string }) => {
  const [shown, setShown] = useState(d);
  const [flipping, setFlipping] = useState(false);
  const prev = useRef(d);

  useEffect(() => {
    if (prev.current === d) return;
    setFlipping(true);
    const id = setTimeout(() => {
      setShown(d);
      setFlipping(false);
      prev.current = d;
    }, 280);
    return () => clearTimeout(id);
  }, [d]);

  return (
    <div className="relative bg-neutral-900/95 rounded-2xl overflow-hidden shadow-2xl flex-1 max-w-[18vw] min-w-[80px] aspect-[3/5]">
      <div
        className="absolute inset-0 flex items-center justify-center font-bold tabular-nums text-neutral-300 select-none"
        style={{
          fontSize: 'min(28vw, 30vh)',
          lineHeight: 1,
          fontFamily: '"Helvetica Neue", Arial, sans-serif',
          letterSpacing: '-0.04em',
          transition: 'opacity 220ms',
          opacity: flipping ? 0.6 : 1,
          transform: flipping ? 'scaleY(0.98)' : 'scaleY(1)',
        }}
      >
        {shown}
      </div>
      {/* mid divider */}
      <div className="absolute left-0 right-0 top-1/2 -translate-y-px h-px bg-black/80" />
    </div>
  );
};

interface Props {
  hours: number;
  minutes: number;
  seconds: number;
  showHours: boolean;
}

export const FocusFlipClock = ({ hours, minutes, seconds, showHours }: Props) => {
  const m = String(minutes).padStart(2, '0');
  const s = String(seconds).padStart(2, '0');
  const h = String(hours).padStart(2, '0');
  const digits = showHours
    ? [h[0], h[1], m[0], m[1], s[0], s[1]]
    : [m[0], m[1], s[0], s[1]];

  return (
    <div className="flex items-stretch justify-center gap-2 sm:gap-3 w-full px-4">
      {digits.map((d, i) => <Digit key={i} d={d} />)}
    </div>
  );
};
