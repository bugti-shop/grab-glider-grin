import { lazy, Suspense } from 'react';

const ReactConfetti = lazy(() => import('react-confetti'));

interface LazyConfettiProps {
  width?: number;
  height?: number;
  recycle?: boolean;
  numberOfPieces?: number;
  colors?: string[];
  run?: boolean;
  onConfettiComplete?: () => void;
  style?: React.CSSProperties;
  [key: string]: any;
}

export const LazyConfetti = (props: LazyConfettiProps) => (
  <Suspense fallback={null}>
    <ReactConfetti {...props} />
  </Suspense>
);
