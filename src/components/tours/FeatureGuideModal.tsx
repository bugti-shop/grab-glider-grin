import { useState } from 'react';
import { HelpCircle, X, Check, Sparkles, Crown, Rocket } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

import { CATEGORY_LABELS, FEATURE_TOURS, type TourCategory } from '@/features/tours/tourRegistry';
import { useFeatureTour } from '@/features/tours/useFeatureTour';

interface FeatureGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORY_ORDER: TourCategory[] = ['tasks', 'notes', 'personalization'];

interface ReleaseNote {
  version: string;
  date: string;
  latest?: boolean;
  items: string[];
}

const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: 'Latest release',
    date: 'July 2026',
    latest: true,
    items: [
      'Web Clipper',
      'Sign in with Email option',
      'Habit Tracker',
      'Pomodoro Focus Mode',
      'Timeline layout view added',
      'Notebooks added & enhanced',
      'Customize which note types show on Add Note button',
      'App Lock feature added',
    ],
  },
];

export const FeatureGuideModal = ({ isOpen, onClose }: FeatureGuideModalProps) => {
  const { hasSeen, start } = useFeatureTour();
  const [runningId, setRunningId] = useState<string | null>(null);

  const handleShow = (tourId: string) => {
    setRunningId(tourId);
    // Close the modal FIRST so its overlay doesn't sit on top of the coach-mark.
    onClose();
    // Wait for the Dialog exit animation (Radix ~200ms) before driving the tour.
    setTimeout(() => {
      start(tourId).finally(() => setRunningId(null));
    }, 260);
  };


  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={cn(
          // Solid white/background, no transparency, no blur — mobile-first full-height.
          'p-0 gap-0 overflow-hidden bg-background !backdrop-blur-none',
          'w-[calc(100vw-1rem)] max-w-lg',
          'h-[92vh] sm:h-auto sm:max-h-[85vh]',
          'flex flex-col',
        )}
      >
        <DialogHeader className="px-4 sm:px-5 pt-4 sm:pt-5 pb-3 border-b bg-background">
          <div className="flex items-center gap-2 pr-8">
            <Sparkles className="h-5 w-5 text-primary flex-shrink-0" />
            <DialogTitle className="text-base sm:text-lg truncate">What can Flowist do?</DialogTitle>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Tap "Show me" on any feature and we'll walk you through it.
          </p>
        </DialogHeader>

        <Tabs defaultValue="features" className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-4 sm:mx-5 mt-3 grid grid-cols-2 flex-shrink-0">
            <TabsTrigger value="features" className="text-xs sm:text-sm">
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              Features
            </TabsTrigger>
            <TabsTrigger value="releases" className="text-xs sm:text-sm">
              <Rocket className="h-3.5 w-3.5 mr-1.5" />
              What's New
            </TabsTrigger>
          </TabsList>

          {/* Features — native overflow-y-auto for smooth scroll */}
          <TabsContent
            value="features"
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-5 py-4 space-y-5 m-0"
          >
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
                          className="flex items-start gap-2 sm:gap-3 rounded-lg border bg-card p-3"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-sm font-medium leading-tight">
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
                            className="flex-shrink-0 h-8 text-xs px-2.5 sm:px-3"
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
          </TabsContent>

          {/* What's New */}
          <TabsContent
            value="releases"
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-5 py-4 space-y-5 m-0"
          >
            {RELEASE_NOTES.map((rel) => (
              <section key={rel.version} className="rounded-lg border bg-card p-4">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Rocket className="h-4 w-4 text-primary flex-shrink-0" />
                  <h3 className="text-sm font-semibold">{rel.version}</h3>
                  {rel.latest && (
                    <span className="text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                      New
                    </span>
                  )}
                  <span className="text-[11px] text-muted-foreground ml-auto">{rel.date}</span>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {rel.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm">
                      <Check className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                      <span className="leading-snug">{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <p className="text-[11px] text-muted-foreground text-center pb-2">
              More updates land here as we ship them.
            </p>
          </TabsContent>
        </Tabs>

        <div className="px-4 sm:px-5 py-2.5 border-t bg-muted/30 flex items-center justify-between flex-shrink-0">
          <p className="text-[11px] text-muted-foreground truncate pr-2">
            Synced across your devices.
          </p>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-8 flex-shrink-0">
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

  // Listen for global 'feature-guide:open' events so first-launch (or any
  // milestone code) can pop the modal without prop drilling.
  // Every mounted FeatureGuideButton reacts, but the modal is deduped by React.
  if (typeof window !== 'undefined') {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffectOpenListener(setOpen);
  }

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

// Named hook so it plays nice with react-hooks lint rules.
import { useEffect } from 'react';
function useEffectOpenListener(setOpen: (v: boolean) => void) {
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener('feature-guide:open', handler);
    return () => window.removeEventListener('feature-guide:open', handler);
  }, [setOpen]);
}

