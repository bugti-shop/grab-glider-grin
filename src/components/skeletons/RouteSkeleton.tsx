import { useLocation } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Route-aware skeleton screen used as the global <Suspense> fallback.
 *
 * Skeletons mirror the actual layout of each destination so the UI feels
 * structurally stable while the lazy chunk loads. Reduces perceived latency
 * vs. a blank screen, and prevents CLS when the real page paints.
 */

const BottomBarSkeleton = () => (
  <div className="fixed bottom-0 left-0 right-0 h-16 border-t border-border bg-background flex items-center justify-around px-2">
    {Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="flex flex-col items-center gap-1.5">
        <Skeleton className="h-5 w-5 rounded-md" />
        <Skeleton className="h-2.5 w-8 rounded" />
      </div>
    ))}
  </div>
);

const HeaderSkeleton = () => (
  <div className="flex items-center justify-between px-4 py-3 border-b border-border">
    <Skeleton className="h-7 w-32 rounded-md" />
    <div className="flex items-center gap-2">
      <Skeleton className="h-8 w-8 rounded-full" />
      <Skeleton className="h-8 w-8 rounded-full" />
    </div>
  </div>
);

const ListItemSkeleton = ({ withCheckbox = false }: { withCheckbox?: boolean }) => (
  <div className="flex items-center gap-3 px-4 py-3">
    {withCheckbox && <Skeleton className="h-5 w-5 rounded-md flex-shrink-0" />}
    <div className="flex-1 min-w-0 space-y-2">
      <Skeleton className="h-4 w-3/4 rounded" />
      <Skeleton className="h-3 w-1/2 rounded" />
    </div>
    <Skeleton className="h-4 w-12 rounded" />
  </div>
);

const TodaySkeleton = () => (
  <div className="min-h-screen bg-background pb-20">
    <HeaderSkeleton />
    <div className="px-4 py-4 space-y-3">
      <Skeleton className="h-9 w-40 rounded-lg" />
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-16 rounded-full" />
        ))}
      </div>
    </div>
    <div className="divide-y divide-border">
      {Array.from({ length: 6 }).map((_, i) => (
        <ListItemSkeleton key={i} withCheckbox />
      ))}
    </div>
    <BottomBarSkeleton />
  </div>
);

const NotesSkeleton = () => (
  <div className="min-h-screen bg-background pb-20">
    <HeaderSkeleton />
    <div className="px-4 py-3">
      <Skeleton className="h-10 w-full rounded-xl" />
    </div>
    <div className="grid grid-cols-2 gap-3 px-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-4 w-3/4 rounded" />
          <Skeleton className="h-3 w-1/2 rounded" />
        </div>
      ))}
    </div>
    <BottomBarSkeleton />
  </div>
);

const CalendarSkeleton = () => (
  <div className="min-h-screen bg-background pb-20">
    <HeaderSkeleton />
    <div className="px-4 py-3 flex items-center justify-between">
      <Skeleton className="h-7 w-32 rounded" />
      <div className="flex gap-2">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
    </div>
    <div className="grid grid-cols-7 gap-1 px-3">
      {Array.from({ length: 42 }).map((_, i) => (
        <Skeleton key={i} className="aspect-square rounded-md" />
      ))}
    </div>
    <BottomBarSkeleton />
  </div>
);

const SettingsSkeleton = () => (
  <div className="min-h-screen bg-background pb-20">
    <HeaderSkeleton />
    <div className="px-4 py-4 space-y-6">
      {Array.from({ length: 3 }).map((_, group) => (
        <div key={group} className="space-y-2">
          <Skeleton className="h-3 w-20 rounded" />
          <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <Skeleton className="h-4 flex-1 rounded" />
                <Skeleton className="h-4 w-4 rounded" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
    <BottomBarSkeleton />
  </div>
);

const ProfileSkeleton = () => (
  <div className="min-h-screen bg-background pb-20">
    <HeaderSkeleton />
    <div className="flex flex-col items-center gap-3 px-4 py-8">
      <Skeleton className="h-24 w-24 rounded-full" />
      <Skeleton className="h-5 w-40 rounded" />
      <Skeleton className="h-3 w-56 rounded" />
    </div>
    <div className="grid grid-cols-3 gap-3 px-4 pb-6">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-20 rounded-xl" />
      ))}
    </div>
    <div className="divide-y divide-border">
      {Array.from({ length: 4 }).map((_, i) => (
        <ListItemSkeleton key={i} />
      ))}
    </div>
    <BottomBarSkeleton />
  </div>
);

const GenericPageSkeleton = () => (
  <div className="min-h-screen bg-background pb-20">
    <HeaderSkeleton />
    <div className="px-4 py-4 space-y-3">
      <Skeleton className="h-6 w-2/3 rounded" />
      <Skeleton className="h-4 w-full rounded" />
      <Skeleton className="h-4 w-5/6 rounded" />
    </div>
    <div className="divide-y divide-border">
      {Array.from({ length: 5 }).map((_, i) => (
        <ListItemSkeleton key={i} />
      ))}
    </div>
    <BottomBarSkeleton />
  </div>
);

const pickSkeleton = (path: string) => {
  if (path === '/' || path.startsWith('/todo/today')) return <TodaySkeleton />;
  if (path === '/notes' || path === '/notesdashboard') return <NotesSkeleton />;
  if (path === '/calendar' || path.startsWith('/todo/calendar')) return <CalendarSkeleton />;
  if (path === '/profile') return <ProfileSkeleton />;
  if (path === '/settings' || path.startsWith('/todo/settings')) return <SettingsSkeleton />;
  return <GenericPageSkeleton />;
};

export const RouteSkeleton = () => {
  const location = useLocation();
  return (
    <div aria-busy="true" aria-live="polite" role="status">
      <span className="sr-only">Loading…</span>
      {pickSkeleton(location.pathname)}
    </div>
  );
};

export default RouteSkeleton;