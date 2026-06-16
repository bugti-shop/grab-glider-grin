import { memo, useEffect, useState, useCallback } from 'react';

interface Particle {
  id: number;
  color: string;
  size: number;
  angle: number;
  speed: number;
  type: 'circle' | 'star' | 'ring' | 'spark';
  delay: number;
}

const COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#ec4899', '#14b8a6', '#f97316'];

const createParticles = (intensity: 'normal' | 'combo' | 'milestone' = 'normal'): Particle[] => {
  const count = intensity === 'milestone' ? 20 : intensity === 'combo' ? 16 : 12;
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const baseSpeed = intensity === 'milestone' ? 30 : intensity === 'combo' ? 25 : 20;
    particles.push({
      id: i,
      color: COLORS[i % COLORS.length],
      size: 2 + Math.random() * (intensity === 'milestone' ? 6 : 4),
      angle: (i / count) * 360 + (Math.random() - 0.5) * 30,
      speed: baseSpeed + Math.random() * 25,
      type: (['circle', 'star', 'ring', 'spark'] as const)[i % 4],
      delay: Math.random() * 50,
    });
  }
  return particles;
};

interface Props {
  onDone: () => void;
  intensity?: 'normal' | 'combo' | 'milestone';
}

/**
 * Duolingo-style particle burst with varied shapes and intensities.
 * CSS-only animation — no canvas, no heavy deps.
 */
export const TaskCompletionBurst = memo(({ onDone, intensity = 'normal' }: Props) => {
  const [particles] = useState(() => createParticles(intensity));
  const duration = intensity === 'milestone' ? 800 : intensity === 'combo' ? 650 : 500;

  useEffect(() => {
    const timer = setTimeout(onDone, duration + 100);
    return () => clearTimeout(timer);
  }, [onDone, duration]);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible z-50">
      {particles.map((p) => {
        const rad = (p.angle * Math.PI) / 180;
        const tx = Math.cos(rad) * p.speed;
        const ty = Math.sin(rad) * p.speed;
        const shape = p.type === 'spark' 
          ? { width: 2, height: p.size * 2, borderRadius: '1px' }
          : p.type === 'star'
          ? { width: p.size, height: p.size, borderRadius: '2px', transform: 'rotate(45deg)' }
          : { width: p.size, height: p.size, borderRadius: '50%' };

        return (
          <div
            key={p.id}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              ...shape,
              marginLeft: -p.size / 2,
              marginTop: -p.size / 2,
              backgroundColor: p.type === 'ring' ? 'transparent' : p.color,
              border: p.type === 'ring' ? `1.5px solid ${p.color}` : 'none',
              animation: `burst-particle-${intensity} ${duration}ms ease-out ${p.delay}ms forwards`,
              opacity: 0,
            } as React.CSSProperties}
            ref={(el) => {
              if (el) {
                el.style.setProperty('--tx', `${tx}px`);
                el.style.setProperty('--ty', `${ty}px`);
              }
            }}
          />
        );
      })}
      <style>{`
        @keyframes burst-particle-normal {
          0% { transform: translate(0, 0) scale(1); opacity: 1; }
          100% { transform: translate(var(--tx), var(--ty)) scale(0); opacity: 0; }
        }
        @keyframes burst-particle-combo {
          0% { transform: translate(0, 0) scale(1.2); opacity: 1; }
          50% { opacity: 0.8; }
          100% { transform: translate(var(--tx), var(--ty)) scale(0); opacity: 0; }
        }
        @keyframes burst-particle-milestone {
          0% { transform: translate(0, 0) scale(1.5); opacity: 1; }
          30% { opacity: 1; }
          100% { transform: translate(var(--tx), var(--ty)) scale(0.3); opacity: 0; }
        }
      `}</style>
    </div>
  );
});

TaskCompletionBurst.displayName = 'TaskCompletionBurst';
