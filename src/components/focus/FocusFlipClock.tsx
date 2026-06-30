import { useEffect, useRef, useState } from 'react';

// Flip-clock style digit panels. Scales by the smaller viewport axis so it
// never looks "over-zoomed" in landscape OR portrait. A visible colon-gap
// separates minutes from seconds (and hours from minutes) at all zoom levels.

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
    <div
      className="relative bg-neutral-900/95 rounded-xl overflow-hidden shadow-2xl aspect-[3/4]"
      // Scale by the smaller axis so layout is sane in any orientation.
      style={{
        height: 'min(38vh, 32vw)',
        maxHeight: 240,
        minHeight: 96,
      }}
    >
      <div
        className="absolute inset-0 flex items-center justify-center font-bold tabular-nums text-neutral-300 select-none"
        style={{
          fontSize: 'min(26vh, 22vw)',
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

// Visible colon-style separator between digit groups.
const GroupGap = () => (
  <div
    className="flex flex-col items-center justify-center self-stretch select-none"
    style={{ width: 'min(5vw, 36px)', minWidth: 14 }}
    aria-hidden
  >
    <span
      className="rounded-full bg-neutral-500"
      style={{ width: 'min(1.4vw, 10px)', height: 'min(1.4vw, 10px)', minWidth: 5, minHeight: 5 }}
    />
    <span style={{ height: 'min(2vh, 16px)' }} />
    <span
      className="rounded-full bg-neutral-500"
      style={{ width: 'min(1.4vw, 10px)', height: 'min(1.4vw, 10px)', minWidth: 5, minHeight: 5 }}
    />
  </div>
);

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
