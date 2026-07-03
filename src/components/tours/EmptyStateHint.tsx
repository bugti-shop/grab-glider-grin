import { Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { triggerEmptyStateTour } from '@/features/tours/useFeatureTour';

interface EmptyStateHintProps {
  tourId: string;
  message: string;
  ctaLabel?: string;
  className?: string;
}

/**
 * Small secondary hint appended to existing empty states.
 * Example: <EmptyStateHint tourId="note-types" message="Try a Sketch or Code note from the + menu." />
 */
export const EmptyStateHint = ({
  tourId,
  message,
  ctaLabel = 'Show me',
  className,
}: EmptyStateHintProps) => {
  return (
    <div
      className={cn(
        'mx-auto max-w-sm mt-4 flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground',
        className,
      )}
    >
      <Lightbulb className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
      <span className="flex-1 leading-snug">{message}</span>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 px-2 text-[11px] font-semibold"
        onClick={() => triggerEmptyStateTour(tourId)}
      >
        {ctaLabel}
      </Button>
    </div>
  );
};
