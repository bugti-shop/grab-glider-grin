import { startTransition, useCallback, useEffect } from 'react';
import { Home, FileText, Calendar, User, Settings } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/utils/haptics';
import { useTranslation } from 'react-i18next';
import { useCustomNavigation, NavItem } from './CustomizeNavigationSheet';
import { prefetchRoute, prefetchAllOnIdle } from '@/utils/routePrefetch';

const triggerNavHaptic = () => {
  triggerHaptic('heavy').catch(() => {});
};

// Icon mapping
const ICON_COMPONENTS: Record<string, React.ComponentType<{ className?: string }>> = {
  Home,
  FileText,
  Calendar,
  Settings,
  User,
};

// Prefetch all lazy routes when browser is idle
// (runs once per app session)
export const BottomNavigation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const customNavItems = useCustomNavigation();

  // Prefetch all routes on idle after mount
  useEffect(() => { prefetchAllOnIdle(); }, []);

  // Get display label - use custom label if set, otherwise translate
  const getDisplayLabel = (item: NavItem) => {
    return item.customLabel || t(`nav.${item.id}`, item.label);
  };


  // Use startTransition for non-blocking navigation
  const handleNavigation = useCallback((path: string) => {
    triggerNavHaptic();
    void prefetchRoute(path);
    startTransition(() => {
      navigate(path);
    });
  }, [navigate]);

  // Calculate grid columns based on visible items
  const gridCols = customNavItems.length <= 3 ? 'grid-cols-3' 
    : customNavItems.length === 4 ? 'grid-cols-4' 
    : 'grid-cols-5';

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 bg-background z-40"
      style={{
        paddingBottom: 'var(--safe-bottom, 0px)',
        WebkitTransform: 'translateZ(0)',
        transform: 'translateZ(0)',
      }}
    >
      <div className={cn("grid h-16 max-w-screen-lg mx-auto", gridCols)}>
        {customNavItems.map((item) => {
          const Icon = ICON_COMPONENTS[item.icon] || Home;
          const isActive = location.pathname === item.path;

          return (
            <button
              key={item.id}
              type="button"
              data-tour={`${item.id}-link`}
              onClick={() => { void handleNavigation(item.path); }}
              onPointerEnter={() => prefetchRoute(item.path)}
              onTouchStart={() => prefetchRoute(item.path)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 transition-colors min-w-0 px-1 touch-manipulation select-none active:scale-95 active:bg-muted/40 rounded-lg",
                "min-h-[52px] min-w-[52px]",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
              aria-label={getDisplayLabel(item)}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
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
