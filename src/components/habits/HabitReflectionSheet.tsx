import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string; // YYYY-MM-DD
  initialNote?: string;
  readOnly?: boolean;
  onSave?: (note: string) => void;
}

/**
 * Daily reflection / note sheet for a single habit's check-in.
 * Persists the note onto the day's HabitCompletionRecord.
 */
export const HabitReflectionSheet = ({
  open,
  onOpenChange,
  date,
  initialNote,
  readOnly,
  onSave,
}: Props) => {
  const [text, setText] = useState(initialNote ?? '');
  useEffect(() => { setText(initialNote ?? ''); }, [initialNote, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl">
        <DialogHeader>
          <DialogTitle>Reflection — {date}</DialogTitle>
        </DialogHeader>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="How did it go? What did you notice?"
          rows={6}
          readOnly={readOnly}
          className="resize-none"
          autoFocus={!readOnly}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-primary">
            {readOnly ? 'Close' : 'Cancel'}
          </Button>
          {!readOnly && (
            <Button
              onClick={() => {
                onSave?.(text.trim());
                onOpenChange(false);
              }}
            >
              Save
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
