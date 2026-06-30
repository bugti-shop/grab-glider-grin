import { useEffect, useRef, useState } from 'react';

// Flip-clock style digit panels. Smaller, with a visible gap between
// the minutes group and the seconds group so users can tell them apart.

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
    }, 220);
    return () => clearTimeout(id);
  }, [d]);

  return (
    <div className="relative bg-neutral-900/95 rounded-xl overflow-hidden shadow-2xl aspect-[3/4] h-[34vh] max-h-[220px] min-h-[120px]">
      <div
        className="absolute inset-0 flex items-center justify-center font-bold tabular-nums text-neutral-300 select-none"
        style={{
          fontSize: 'min(14vw, 22vh)',
          lineHeight: 1,
          fontFamily: '"Helvetica Neue", Arial, sans-serif',
          letterSpacing: '-0.04em',
          transition: 'opacity 200ms',
          opacity: flipping ? 0.6 : 1,
          transform: flipping ? 'scaleY(0.98)' : 'scaleY(1)',
        }}
      >
        {shown}
      </div>
      <div className="absolute left-0 right-0 top-1/2 -translate-y-px h-px bg-black/80" />
    </div>
  );
};

const GroupGap = () => <div className="w-3 sm:w-5" aria-hidden />;

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

  return (
    <div className="flex items-stretch justify-center gap-1.5 sm:gap-2 w-full px-4">
      {showHours && (
        <>
          <Digit d={h[0]} />
          <Digit d={h[1]} />
          <GroupGap />
        </>
      )}
      <Digit d={m[0]} />
      <Digit d={m[1]} />
      <GroupGap />
      <Digit d={s[0]} />
      <Digit d={s[1]} />
    </div>
  );
};
