import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState } from 'react';
import { triggerHaptic } from '@/utils/haptics';

interface Props {
  current: number;
  goalAmount: number;
  goalUnit?: string;
  color: string;
  onChange: (next: number) => void;
}

/** Amount-based check-in counter shown on HabitDetail when goalType === 'amount'. */
export const HabitAmountCounter = ({ current, goalAmount, goalUnit, color, onChange }: Props) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(current));
  const pct = goalAmount > 0 ? Math.min(100, Math.round((current / goalAmount) * 100)) : 0;

  const bump = (delta: number) => {
    triggerHaptic('light').catch(() => {});
    onChange(Math.max(0, current + delta));
  };

  return (
    <div className="rounded-2xl bg-white shadow-xl p-5">
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={() => bump(-1)}
          className="h-12 w-12 rounded-full bg-muted flex items-center justify-center active:scale-95"
          aria-label="Decrement"
        >
          <Minus className="h-5 w-5" />
        </button>

        <button
          onClick={() => { setDraft(String(current)); setEditing(true); }}
          className="flex-1 text-center"
        >
          <div className="text-4xl font-bold tabular-nums" style={{ color }}>
            {current}
            <span className="text-2xl text-muted-foreground"> / {goalAmount}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {goalUnit || 'units'} • {pct}%
          </div>
        </button>

        <button
          onClick={() => bump(+1)}
          className="h-12 w-12 rounded-full flex items-center justify-center active:scale-95 text-white"
          style={{ backgroundColor: color }}
          aria-label="Increment"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {editing && (
        <div className="mt-4 flex items-center gap-2">
          <Input
            type="number"
            min={0}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-10"
            autoFocus
          />
          <Button
            size="sm"
            onClick={() => {
              const n = Math.max(0, Number(draft) || 0);
              onChange(n);
              setEditing(false);
            }}
          >
            Set
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </div>
      )}

      <div className="mt-4 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full transition-all"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
};
