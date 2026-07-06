import { startTransition, useCallback, useState, useEffect } from 'react';
import { Home, Calendar, Settings, BarChart3, User, ListChecks, LayoutGrid, Hourglass } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/utils/haptics';
import { useTranslation } from 'react-i18next';
import { getSetting } from '@/utils/settingsStorage';
import { prefetchRoute } from '@/utils/routePrefetch';

const triggerNavHaptic = () => {
  triggerHaptic('heavy').catch(() => {});
};

export interface TodoNavItem {
  id: string;
  label: string;
  customLabel?: string;
  icon: string;
  path: string;
  visible: boolean;
}

// Icon mapping for todo navigation
const ICON_COMPONENTS: Record<string, React.ComponentType<{ className?: string }>> = {
  Home,
  BarChart3,
  User,
  Calendar,
  Settings,
  ListChecks,
  LayoutGrid,
  Hourglass,
};

export const DEFAULT_TODO_NAV_ITEMS: TodoNavItem[] = [
  { id: 'home', label: 'Home', icon: 'Home', path: '/todo/today', visible: true },
  { id: 'progress', label: 'Progress', icon: 'BarChart3', path: '/todo/progress', visible: true },
  { id: 'profile', label: 'Profile', icon: 'User', path: '/profile', visible: true },
  { id: 'calendar', label: 'Calendar', icon: 'Calendar', path: '/todo/calendar', visible: true },
  { id: 'settings', label: 'Settings', icon: 'Settings', path: '/todo/settings', visible: true },
  { id: 'habits', label: 'Habits', icon: 'ListChecks', path: '/todo/habits', visible: false },
  { id: 'matrix', label: 'Matrix', icon: 'LayoutGrid', path: '/todo/matrix', visible: false },
  { id: 'countdown', label: 'Countdown', icon: 'Hourglass', path: '/todo/countdown', visible: false },
];


// Hook to access todo nav items
export const useTodoNavigation = () => {
  const [navItems, setNavItems] = useState<TodoNavItem[]>(DEFAULT_TODO_NAV_ITEMS);

  useEffect(() => {
    const loadItems = async () => {
      const saved = await getSetting<TodoNavItem[] | null>('customTodoNavItems', null);
      if (saved && saved.length > 0) {
        const savedMap = new Map(saved.map(item => [item.id, item]));
        const merged = DEFAULT_TODO_NAV_ITEMS.map(defaultItem => {
          const savedItem = savedMap.get(defaultItem.id);
          return savedItem ? { ...defaultItem, ...savedItem, path: defaultItem.path } : defaultItem;
        });
        const orderedMerged = saved
          .map(s => merged.find(m => m.id === s.id))
          .filter(Boolean) as TodoNavItem[];
        merged.forEach(item => {
          if (!orderedMerged.find(o => o.id === item.id)) {
            orderedMerged.push(item);
          }
        });
        setNavItems(orderedMerged);
      }
    };
    
    loadItems();
    const handleChange = () => loadItems();
    window.addEventListener('todoNavItemsChanged', handleChange);
    return () => window.removeEventListener('todoNavItemsChanged', handleChange);
  }, []);

  return navItems;
};

export const TodoBottomNavigation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const allNavItems = useTodoNavigation();
  const visibleItems = allNavItems.filter(item => item.visible);
  const [countdownBadge, setCountdownBadge] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const { countUpcomingWithin } = await import('@/utils/countdownStorage');
        const n = await countUpcomingWithin(7);
        if (!cancelled) setCountdownBadge(n);
      } catch {}
    };
    refresh();
    const onUpdate = () => refresh();
    window.addEventListener('countdownsUpdated', onUpdate);
    const onVis = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      window.removeEventListener('countdownsUpdated', onUpdate);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const getDisplayLabel = (item: TodoNavItem) => {
    return item.customLabel || t(`nav.${item.id}`, item.label);
  };

  const handleNavigation = useCallback((path: string) => {
    if (path === location.pathname) return;
    triggerNavHaptic();
    void prefetchRoute(path);
    startTransition(() => {
      navigate(path, { state: { from: location.pathname } });
    });
  }, [navigate, location.pathname]);


  const gridCols = visibleItems.length <= 3 ? 'grid-cols-3' 
    : visibleItems.length === 4 ? 'grid-cols-4' 
    : 'grid-cols-5';

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 bg-background z-40 md:hidden"
      style={{
        paddingBottom: 'var(--safe-bottom, 0px)',
        WebkitTransform: 'translateZ(0)',
        transform: 'translateZ(0)',
      }}
    >
      <div className={cn("grid h-16 max-w-screen-lg mx-auto", gridCols)}>
        {visibleItems.map((item) => {
          const Icon = ICON_COMPONENTS[item.icon] || Home;
          const isActive = location.pathname === item.path;
          const badge = item.id === 'countdown' ? countdownBadge : 0;

          return (
            <button
              key={item.id}
              type="button"
              data-tour={`todo-${item.id}-link`}
              onClick={() => { void handleNavigation(item.path); }}
              onPointerEnter={() => prefetchRoute(item.path)}
              onTouchStart={() => prefetchRoute(item.path)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 transition-colors min-w-0 px-1 touch-manipulation select-none active:scale-95 active:bg-muted/40 rounded-lg",
                "min-h-[52px] min-w-[52px]",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
              aria-label={getDisplayLabel(item) + (badge ? ` (${badge} upcoming)` : '')}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className="relative">
                <Icon className="h-5 w-5 flex-shrink-0" />
                {badge > 0 && (
                  <span
                    className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold leading-[16px] text-center"
                    aria-hidden="true"
                  >
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] sm:text-xs font-medium truncate max-w-full">
                {getDisplayLabel(item)}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
