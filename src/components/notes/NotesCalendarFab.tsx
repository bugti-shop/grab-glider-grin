import { forwardRef } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NotesCalendarFabProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

/**
 * Dedicated FAB for the Notes Calendar page.
 * Plain <button> (not the shared Button variant) so no border/overlay bleeds through.
 */
export const NotesCalendarFab = forwardRef<HTMLButtonElement, NotesCalendarFabProps>(
  ({ className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label="Add note"
      className={cn(
        'fixed right-4 z-40 h-14 w-14 rounded-full',
        'bg-black text-white flex items-center justify-center',
        'shadow-[0_6px_16px_-6px_rgba(0,0,0,0.35)]',
        'border-0 outline-none focus-visible:ring-2 focus-visible:ring-white/40',
        'transition-transform active:scale-95',
        className,
      )}
      style={{ bottom: 'calc(72px + var(--safe-bottom, 0px))' }}
      {...props}
    >
      <Plus className="h-6 w-6" strokeWidth={2.25} />
    </button>
  ),
);
NotesCalendarFab.displayName = 'NotesCalendarFab';
