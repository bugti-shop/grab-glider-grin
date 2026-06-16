import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/utils/haptics';
import { toast } from 'sonner';
import {
  HABIT_CATEGORIES,
  HABIT_TEMPLATES,
  type HabitCategory,
  type HabitTemplate,
} from '@/data/habitTemplates';
import { saveHabit, loadHabits } from '@/utils/habitStorage';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { genId } from '@/utils/genId';
import { DEFAULT_HABIT_SECTION_ID } from '@/utils/habitSectionsStorage';
import { format } from 'date-fns';
import type { Habit } from '@/types/habit';

const HabitGallery = () => {
  const navigate = useNavigate();
  const { requireCapacity } = useSubscription();
  const [active, setActive] = useState<HabitCategory>('Suggested');

  const handleAdd = async (t: HabitTemplate) => {
    triggerHaptic('light').catch(() => {});
    const existing = await loadHabits();
    const activeCount = existing.filter((h) => !h.isArchived).length;
    if (!requireCapacity('habits', activeCount)) return;
    const now = new Date().toISOString();
    const habit: Habit = {
      id: genId(),
      name: t.name,
      emoji: t.emoji,
      color: 'hsl(220, 85%, 59%)',
      quote: t.quote,
      frequency: 'daily',
      weeklyDays: [0, 1, 2, 3, 4, 5, 6],
      goalType: 'all',
      startDate: format(new Date(), 'yyyy-MM-dd'),
      goalDays: 0,
      sectionId: DEFAULT_HABIT_SECTION_ID,
      autoPopupLog: false,
      completions: [],
      currentStreak: 0,
      bestStreak: 0,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    };
    await saveHabit(habit);
    toast.success(`Added “${t.name}”`);
  };

  const list = HABIT_TEMPLATES[active];

  return (
    <div className="min-h-screen bg-muted/30 pb-32">
      <header className="bg-muted/30 px-4 pt-3 pb-2 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold text-foreground">Gallery</h1>
      </header>

      {/* Category tabs */}
      <div className="px-2 mt-2 overflow-x-auto">
        <div className="flex items-center gap-2 px-2 pb-2 min-w-max">
          {HABIT_CATEGORIES.map((c) => {
            const sel = c === active;
            return (
              <button
                key={c}
                onClick={() => setActive(c)}
                className={cn(
                  'px-4 h-9 rounded-full text-sm font-medium whitespace-nowrap',
                  sel ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
                )}
              >
                {c}
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      <div className="px-3 mt-2 space-y-3">
        {list.map((t, i) => (
          <div
            key={`${active}-${i}`}
            role="button"
            tabIndex={0}
            onClick={() => {
              triggerHaptic('light').catch(() => {});
              navigate('/todo/habits/new', {
                state: { name: t.name, emoji: t.emoji, quote: t.quote },
              });
            }}
            className="bg-background rounded-2xl p-3.5 flex items-center gap-3 cursor-pointer active:opacity-80 transition"
          >
            <div
              className={cn(
                'h-12 w-12 rounded-full flex items-center justify-center text-2xl shrink-0',
                t.bgClass
              )}
            >
              {t.emoji}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-foreground truncate">{t.name}</div>
              <div className="text-sm text-muted-foreground line-clamp-2">{t.quote}</div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleAdd(t);
              }}
              className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-muted shrink-0"
              aria-label={`Add ${t.name}`}
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        ))}
      </div>

      {/* Bottom action */}
      <Button
        onClick={async () => {
          const existing = await loadHabits();
          const activeCount = existing.filter((h) => !h.isArchived).length;
          if (!requireCapacity('habits', activeCount)) return;
          navigate('/todo/habits/new');
        }}
        className="fixed left-4 right-4 z-30 h-12 text-base font-semibold"
        style={{ bottom: 'calc(0.75rem + var(--safe-bottom, 0px))' }}
        size="lg"
      >
        Create a new habit
      </Button>
    </div>
  );
};

export default HabitGallery;
