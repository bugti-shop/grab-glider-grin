import { useEffect, useMemo, useState, useCallback } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Plus,
  Home,
  Calendar,
  ListChecks,
  LayoutGrid,
  Hourglass,
  Hourglass,
  BarChart3,
  User,
  Settings,
  Folder as FolderIcon,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  FileText,
  BookOpen,
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

const TASKS_NAV: NavItem[] = [
  { id: 'today', label: 'Today', icon: Home, path: '/todo/today' },
  { id: 'calendar', label: 'Calendar', icon: Calendar, path: '/todo/calendar' },
  { id: 'habits', label: 'Habits', icon: ListChecks, path: '/todo/habits' },
  { id: 'matrix', label: 'Matrix', icon: LayoutGrid, path: '/todo/matrix' },
  { id: 'countdown', label: 'Countdown', icon: Hourglass, path: '/todo/countdown' },
  { id: 'progress', label: 'Progress', icon: BarChart3, path: '/todo/progress' },
];

const NOTES_NAV: NavItem[] = [
  { id: 'allNotes', label: 'All Notes', icon: FileText, path: '/notes' },
  { id: 'notesCalendar', label: 'Calendar', icon: Calendar, path: '/calendar' },
  { id: 'tasks', label: 'Tasks', icon: ListChecks, path: '/todo/today' },
];

const COLLAPSE_KEY = 'desktop-sidebar-collapsed';
const EXPANDED_WIDTH = '17rem';
const COLLAPSED_WIDTH = '4rem';

const applySidebarWidth = (collapsed: boolean) => {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;
  const isDesktop = window.matchMedia('(min-width: 768px)').matches;
  document.documentElement.style.setProperty(
    '--desktop-sidebar-width',
    isDesktop ? (collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH) : '0px'
  );
};

const isNotesPath = (pathname: string) =>
  pathname.startsWith('/notesdashboard') ||
  pathname.startsWith('/notes') ||
  pathname.startsWith('/calendar');

// Match active state for nav items including their nested sub-routes.
const isItemActive = (itemPath: string, pathname: string): boolean => {
  if (pathname === itemPath) return true;
  // Exact-only matches (avoid /todo/today matching /todo/today-something)
  // Prefer prefix match with trailing slash for true children.
  if (pathname.startsWith(itemPath + '/')) return true;

  // Special groupings
  if (itemPath === '/todo/habits' && pathname.startsWith('/todo/habits')) return true;
  if (itemPath === '/todo/matrix' && pathname.startsWith('/todo/matrix')) return true;
  if (itemPath === '/todo/calendar' && pathname.startsWith('/todo/calendar')) return true;
  if (itemPath === '/todo/countdown' && pathname.startsWith('/todo/countdown')) return true;
  if (itemPath === '/todo/progress' && pathname.startsWith('/todo/progress')) return true;
  if (itemPath === '/todo/today' && (pathname === '/' || pathname.startsWith('/todo/today') || pathname.startsWith('/todo/task/'))) return true;
  if (itemPath === '/notesdashboard' && pathname.startsWith('/notesdashboard')) return true;
  if (itemPath === '/notes' && pathname.startsWith('/notes') && !pathname.startsWith('/notesdashboard')) return true;
  return false;
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

  const notesContext = isNotesPath(location.pathname);
  const MAIN_NAV = notesContext ? NOTES_NAV : TASKS_NAV;

  const filteredFolders = useMemo(
    () =>
      folders.filter((f) =>
        notesContext ? f.type === 'notes' || f.type === 'both' : f.type === 'tasks' || f.type === 'both'
      ),
    [folders, notesContext]
  );

  useEffect(() => {
    applySidebarWidth(collapsed);
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
    } catch {}
    const onResize = () => applySidebarWidth(collapsed);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [collapsed]);

  useEffect(() => {
    const onToggle = () => setCollapsed((v) => !v);
    window.addEventListener('desktop-sidebar:toggle', onToggle);
    return () => window.removeEventListener('desktop-sidebar:toggle', onToggle);
  }, []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const f = await loadFolders();
        if (mounted) setFolders(f);
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

  const handlePrimaryAction = useCallback(() => {
    triggerHaptic('light').catch(() => {});
    if (notesContext) {
      navigate('/notesdashboard?new=1');
    } else {
      navigate('/todo/today?add=1');
    }
  }, [navigate, notesContext]);

  const toggleCollapsed = () => {
    triggerHaptic('light').catch(() => {});
    setCollapsed((v) => !v);
  };

  const primaryLabel = notesContext
    ? t('notes.newNote', 'New Note')
    : t('tasks.addTask', 'Add Task');

  const folderLabel = notesContext
    ? t('folders.notesTitle', 'Note Folders')
    : t('folders.title', 'My Folders');

  const handleFolderNav = (folder: Folder) => {
    if (notesContext) {
      navigate(`/notes?folder=${folder.id}`);
    } else {
      navigate(`/todo/today?folder=${folder.id}`);
    }
  };

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col md:fixed md:inset-y-0 md:left-0 z-40 border-r border-border bg-secondary transition-[width] duration-200 ease-out',
        collapsed ? 'w-16' : 'w-60 xl:w-72'
      )}
    >
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
            {notesContext && (
              <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                Notes
              </span>
            )}
          </div>
        )}
        <button
          onClick={toggleCollapsed}
          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <div className={cn('pt-3 pb-2', collapsed ? 'px-2' : 'px-3')}>
        <button
          onClick={handlePrimaryAction}
          className={cn(
            'w-full flex items-center rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 active:scale-[0.98] transition-all',
            collapsed ? 'justify-center p-2.5' : 'gap-3 px-3 py-2.5'
          )}
          title={collapsed ? primaryLabel : undefined}
        >
          {notesContext ? (
            <BookOpen className="h-5 w-5 flex-shrink-0" />
          ) : (
            <Plus className="h-5 w-5 flex-shrink-0" />
          )}
          {!collapsed && <span>{primaryLabel}</span>}
        </button>
      </div>

      <nav className={cn('py-1 flex flex-col gap-0.5 px-2')}>
        {MAIN_NAV.map((item) => {
          const Icon = item.icon;
          const isActive = isItemActive(item.path, location.pathname);
          const isHabitsItem = item.id === 'habits';
          const showHabitChild = isHabitsItem && !collapsed && location.pathname.startsWith('/todo/habits');
          const addHabitActive = location.pathname.startsWith('/todo/habits/gallery') || location.pathname.startsWith('/todo/habits/new');
          return (
            <div key={item.id}>
              <NavLink
                to={item.path}
                end={false}
                title={collapsed ? t(`nav.${item.id}`, item.label) : undefined}
                className={cn(
                  'flex items-center rounded-lg text-sm font-medium transition-colors relative',
                  collapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2',
                  isActive
                    ? 'bg-primary/10 text-primary before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-0.5 before:rounded-r before:bg-primary'
                    : 'text-foreground/80 hover:bg-muted'
                )}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                {!collapsed && <span className="truncate">{t(`nav.${item.id}`, item.label)}</span>}
              </NavLink>
              {showHabitChild && (
                <button
                  onClick={() => {
                    triggerHaptic('light').catch(() => {});
                    navigate('/todo/habits/gallery');
                  }}
                  className={cn(
                    'ml-7 mt-0.5 flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors w-[calc(100%-1.75rem)] text-left',
                    addHabitActive
                      ? 'bg-primary/15 text-primary'
                      : 'text-primary/90 hover:bg-primary/10'
                  )}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{t('habits.addHabit', 'Add Habit')}</span>
                </button>
              )}
            </div>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="mt-3 px-2 flex-1 overflow-y-auto min-h-0">
          <button
            onClick={() => setFoldersOpen((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
          >
            <span>{folderLabel}</span>
            {foldersOpen ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
          {foldersOpen && (
            <div className="flex flex-col gap-0.5 mt-1">
              {/* Always-visible "All Tasks/All Notes" pseudo-folder */}
              <button
                onClick={() => navigate(notesContext ? '/notes' : '/todo/today')}
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-foreground/80 hover:bg-muted transition-colors text-left"
              >
                <FolderIcon className="h-4 w-4 flex-shrink-0 text-primary" />
                <span className="truncate flex-1">
                  {notesContext
                    ? t('notes.allNotes', 'All Notes')
                    : t('tasks.allTasks', 'All Tasks')}
                </span>
              </button>
              {filteredFolders.length === 0 ? (
                <p className="px-3 py-1.5 text-[11px] text-muted-foreground">
                  {t('folders.empty', 'No folders yet')}
                </p>
              ) : (
                filteredFolders.map((folder) => (
                  <button
                    key={folder.id}
                    onClick={() => handleFolderNav(folder)}
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

      <div className={cn('border-t border-border flex flex-col gap-0.5 p-2')}>
        {[
          { to: '/profile', icon: User, key: 'profile', label: 'Profile' },
          { to: '/todo/settings', icon: Settings, key: 'settings', label: 'Settings' },
        ].map(({ to, icon: Icon, key, label }) => {
          const active = isItemActive(to, location.pathname);
          return (
            <NavLink
              key={key}
              to={to}
              title={collapsed ? t(`nav.${key}`, label) : undefined}
              className={cn(
                'flex items-center rounded-lg text-sm font-medium transition-colors relative',
                collapsed ? 'justify-center p-2' : 'gap-3 px-3 py-2',
                active
                  ? 'bg-primary/10 text-primary before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-5 before:w-0.5 before:rounded-r before:bg-primary'
                  : 'text-foreground/80 hover:bg-muted'
              )}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {!collapsed && <span>{t(`nav.${key}`, label)}</span>}
            </NavLink>
          );
        })}
      </div>
    </aside>
  );
};
