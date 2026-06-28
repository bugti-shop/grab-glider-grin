import { useEffect, useState, useCallback } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Plus,
  Home,
  Calendar,
  ListChecks,
  LayoutGrid,
  Hourglass,
  StickyNote,
  BarChart3,
  User,
  Settings,
  Folder as FolderIcon,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppLogo } from '@/components/AppLogo';
import { loadFolders, Folder } from '@/utils/folderStorage';
import { triggerHaptic } from '@/utils/haptics';
import { useTranslation } from 'react-i18next';

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
}

const MAIN_NAV: NavItem[] = [
  { id: 'today', label: 'Today', icon: Home, path: '/todo/today' },
  { id: 'upcoming', label: 'Upcoming', icon: Calendar, path: '/todo/upcoming' },
  { id: 'calendar', label: 'Calendar', icon: Calendar, path: '/todo/calendar' },
  { id: 'habits', label: 'Habits', icon: ListChecks, path: '/todo/habits' },
  { id: 'matrix', label: 'Matrix', icon: LayoutGrid, path: '/todo/matrix' },
  { id: 'countdown', label: 'Countdown', icon: Hourglass, path: '/todo/countdown' },
  { id: 'progress', label: 'Progress', icon: BarChart3, path: '/todo/progress' },
  { id: 'notes', label: 'Notes', icon: StickyNote, path: '/notesdashboard' },
];

const COLLAPSE_KEY = 'desktop-sidebar-collapsed';
const EXPANDED_WIDTH = '17rem'; // ~ w-64/w-72
const COLLAPSED_WIDTH = '4rem'; // w-16

const applySidebarWidth = (collapsed: boolean) => {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty(
    '--desktop-sidebar-width',
    collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH
  );
};

export const DesktopSidebar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [foldersOpen, setFoldersOpen] = useState(true);
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    applySidebarWidth(collapsed);
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {}
  }, [collapsed]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const f = await loadFolders();
        if (mounted) {
          setFolders(f.filter((x) => x.type === 'tasks' || x.type === 'both'));
        }
      } catch {}
    };
    load();
    const onUpdate = () => load();
    window.addEventListener('foldersUpdated', onUpdate);
    return () => {
      mounted = false;
      window.removeEventListener('foldersUpdated', onUpdate);
    };
  }, []);

  const handleAddTask = useCallback(() => {
    triggerHaptic('light').catch(() => {});
    navigate('/todo/today?add=1');
  }, [navigate]);

  const toggleCollapsed = () => {
    triggerHaptic('light').catch(() => {});
    setCollapsed((v) => !v);
  };

  return (
    <aside
      className={cn(
        'hidden lg:flex flex-col h-screen sticky top-0 border-r border-border bg-secondary/30 transition-[width] duration-200 ease-out',
        collapsed ? 'w-16' : 'w-64 xl:w-72'
      )}
    >
      {/* Brand + Collapse toggle */}
      <div
        className={cn(
          'flex items-center h-14 border-b border-border',
          collapsed ? 'justify-center px-2' : 'justify-between px-4 gap-2'
        )}
      >
        {!collapsed && (
          <div className="flex items-center gap-2 min-w-0">
            <AppLogo />
            <span className="font-bold text-base truncate">Flowist</span>
          </div>
        )}
        <button
          onClick={toggleCollapsed}
          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Add Task */}
      <div className={cn('pt-3 pb-2', collapsed ? 'px-2' : 'px-3')}>
        <button
          onClick={handleAddTask}
          className={cn(
            'w-full flex items-center rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 active:scale-[0.98] transition-all',
            collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'
          )}
          title={collapsed ? t('tasks.addTask', 'Add Task') : undefined}
        >
          <Plus className="h-5 w-5 flex-shrink-0" />
          {!collapsed && <span>{t('tasks.addTask', 'Add Task')}</span>}
        </button>
      </div>

      {/* Main nav */}
      <nav className={cn('py-1 flex flex-col gap-0.5', collapsed ? 'px-2' : 'px-2')}>
        {MAIN_NAV.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <NavLink
              key={item.id}
              to={item.path}
              title={collapsed ? t(`nav.${item.id}`, item.label) : undefined}
              className={cn(
                'flex items-center rounded-lg text-sm font-medium transition-colors',
                collapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-foreground/80 hover:bg-muted'
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {!collapsed && (
                <span className="truncate">{t(`nav.${item.id}`, item.label)}</span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Folders */}
      {!collapsed && (
        <div className="mt-3 px-2 flex-1 overflow-y-auto min-h-0">
          <button
            onClick={() => setFoldersOpen((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            <span>{t('folders.title', 'My Folders')}</span>
            {foldersOpen ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
          {foldersOpen && (
            <div className="flex flex-col gap-0.5 mt-1">
              {folders.length === 0 ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  {t('folders.empty', 'No folders yet')}
                </p>
              ) : (
                folders.map((folder) => (
                  <button
                    key={folder.id}
                    onClick={() => navigate(`/todo/today?folder=${folder.id}`)}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-foreground/80 hover:bg-muted transition-colors text-left"
                  >
                    <FolderIcon
                      className="h-4 w-4 flex-shrink-0"
                      style={{ color: folder.color || 'hsl(var(--muted-foreground))' }}
                    />
                    <span className="truncate flex-1">{folder.name}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}
      {collapsed && <div className="flex-1 min-h-0" />}

      {/* Profile + Settings */}
      <div
        className={cn(
          'border-t border-border flex flex-col gap-0.5',
          collapsed ? 'p-2' : 'p-2'
        )}
      >
        <NavLink
          to="/profile"
          title={collapsed ? t('nav.profile', 'Profile') : undefined}
          className={({ isActive }) =>
            cn(
              'flex items-center rounded-lg text-sm font-medium transition-colors',
              collapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2',
              isActive ? 'bg-primary/10 text-primary' : 'text-foreground/80 hover:bg-muted'
            )
          }
        >
          <User className="h-4 w-4 flex-shrink-0" />
          {!collapsed && <span>{t('nav.profile', 'Profile')}</span>}
        </NavLink>
        <NavLink
          to="/todo/settings"
          title={collapsed ? t('nav.settings', 'Settings') : undefined}
          className={({ isActive }) =>
            cn(
              'flex items-center rounded-lg text-sm font-medium transition-colors',
              collapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2',
              isActive ? 'bg-primary/10 text-primary' : 'text-foreground/80 hover:bg-muted'
            )
          }
        >
          <Settings className="h-4 w-4 flex-shrink-0" />
          {!collapsed && <span>{t('nav.settings', 'Settings')}</span>}
        </NavLink>
      </div>
    </aside>
  );
};
