import { useState } from 'react';
import { HelpCircle, X, Check, Sparkles, Crown } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

import { CATEGORY_LABELS, FEATURE_TOURS, type TourCategory } from '@/features/tours/tourRegistry';
import { useFeatureTour } from '@/features/tours/useFeatureTour';

interface FeatureGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORY_ORDER: TourCategory[] = [
  'tasks',
  'notes',
  'notebooks',
  'progress',
  'journeys',
  'settings',
];

export const FeatureGuideModal = ({ isOpen, onClose }: FeatureGuideModalProps) => {
  const { hasSeen, start } = useFeatureTour();
  const [runningId, setRunningId] = useState<string | null>(null);

  const handleShow = (tourId: string) => {
    setRunningId(tourId);
    onClose();
    // Slight delay so the modal is fully unmounted before we spotlight the DOM.
    setTimeout(() => {
      start(tourId).finally(() => setRunningId(null));
    }, 150);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden max-h-[85vh]">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <DialogTitle className="text-lg">What can Flowist do?</DialogTitle>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Tap "Show me" on any feature and we'll walk you through it right on the screen.
          </p>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          <div className="px-5 py-4 space-y-6">
            {CATEGORY_ORDER.map((cat) => {
              const items = FEATURE_TOURS.filter((t) => t.category === cat);
              if (items.length === 0) return null;
              return (
                <section key={cat}>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    {CATEGORY_LABELS[cat]}
                  </h3>
                  <ul className="space-y-2">
                    {items.map((tour) => {
                      const seen = hasSeen(tour.id);
                      return (
                        <li
                          key={tour.id}
                          className={cn(
                            'flex items-start gap-3 rounded-lg border bg-card p-3 transition-colors',
                            'hover:bg-muted/40',
                          )}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-sm font-medium leading-tight truncate">
                                {tour.title}
                              </p>
                              {tour.premium && (
                                <Crown className="h-3 w-3 text-amber-500 flex-shrink-0" />
                              )}
                              {seen ? (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                  <Check className="h-2.5 w-2.5" />
                                  Seen
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                                  New
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                              {tour.shortDescription}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant={seen ? 'outline' : 'default'}
                            onClick={() => handleShow(tour.id)}
                            disabled={runningId === tour.id}
                            className="flex-shrink-0 h-8 text-xs"
                          >
                            Show me
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        </ScrollArea>

        <div className="px-5 py-3 border-t bg-muted/30 flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">
            Tips are per-account and sync across your devices.
          </p>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8">
            <X className="h-4 w-4 mr-1" />
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/** Small header icon button that opens the Feature Guide. */
export const FeatureGuideButton = ({ className }: { className?: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => setOpen(true)}
        className={cn(
          'h-7 w-7 xs:h-8 xs:w-8 sm:h-9 sm:w-9 hover:bg-transparent active:bg-transparent touch-target',
          className,
        )}
        title="Feature guide"
        aria-label="Open feature guide"
      >
        <HelpCircle className="h-4 w-4 xs:h-5 xs:w-5" />
      </Button>
      <FeatureGuideModal isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
};
