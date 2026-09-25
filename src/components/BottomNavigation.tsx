import { useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Home, FileText, Calendar, User, Settings, Book } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { useCustomNavigation, NavItem } from './CustomizeNavigationSheet';
import { prefetchRoute, prefetchAllOnIdle } from '@/utils/routePrefetch';

// Icon mapping
const ICON_COMPONENTS: Record<string, React.ComponentType<{ className?: string }>> = {
  Home,
  FileText,
  Calendar,
  Settings,
  User,
  Book,
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


  // Instant navigation with eager route prefetching.
  const handleNavigation = useCallback((path: string) => {
    if (location.pathname === path) return;
    void prefetchRoute(path);
    navigate(path);
  }, [navigate, location.pathname]);

  // Calculate grid columns based on visible items
  const gridCols = customNavItems.length <= 3 ? 'grid-cols-3' 
    : customNavItems.length === 4 ? 'grid-cols-4' 
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
        {customNavItems.map((item) => {
          const Icon = ICON_COMPONENTS[item.icon] || Home;
          const isActive = location.pathname === item.path;

          return (
            <button
              key={item.id}
              type="button"
              data-tour={`${item.id}-link`}
              onPointerDown={(e) => {
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                prefetchRoute(item.path);
                handleNavigation(item.path);
              }}
              onClick={(e) => e.preventDefault()}
              onPointerEnter={() => prefetchRoute(item.path)}
              onTouchStart={() => prefetchRoute(item.path)}
              className={cn(
                "flex flex-col items-center justify-center gap-1 min-w-0 px-1 touch-manipulation select-none rounded-lg",
                "min-h-[52px] min-w-[52px]",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
              aria-label={getDisplayLabel(item)}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className={cn(
                "relative flex h-8 min-w-14 items-center justify-center rounded-full",
                isActive ? "text-primary" : "text-muted-foreground active:text-primary"
              )}>
                {isActive && (
                  <motion.span
                    layoutId="flowist-nav-pill"
                    className="absolute inset-0 rounded-full bg-primary/15"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                <Icon className="relative z-10 h-5 w-5 flex-shrink-0" />
              </span>
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
