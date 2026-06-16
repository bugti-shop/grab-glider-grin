import { useState, useEffect, useRef } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, RotateCcw, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { getSetting, setSetting } from '@/utils/settingsStorage';
import { toast } from 'sonner';
import { useHardwareBackButton } from '@/hooks/useHardwareBackButton';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { DEFAULT_TODO_NAV_ITEMS, TodoNavItem } from './TodoBottomNavigation';
import {
  Home,
  Calendar,
  Settings,
  BarChart3,
  User,
  ClipboardList,
  History,
  CalendarDays,
  CalendarRange,
  ListChecks,
  LayoutGrid,
  Hourglass,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ReactNode> = {
  Home: <Home className="h-5 w-5" />,
  BarChart3: <BarChart3 className="h-5 w-5" />,
  User: <User className="h-5 w-5" />,
  Calendar: <Calendar className="h-5 w-5" />,
  Settings: <Settings className="h-5 w-5" />,
  ClipboardList: <ClipboardList className="h-5 w-5" />,
  History: <History className="h-5 w-5" />,
  CalendarDays: <CalendarDays className="h-5 w-5" />,
  CalendarRange: <CalendarRange className="h-5 w-5" />,
  ListChecks: <ListChecks className="h-5 w-5" />,
  LayoutGrid: <LayoutGrid className="h-5 w-5" />,
  Hourglass: <Hourglass className="h-5 w-5" />,
};

const MAX_VISIBLE = 5;
const MIN_VISIBLE = 2;

interface CustomizeTodoNavigationSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SortableRowProps {
  item: TodoNavItem;
  isEditing: boolean;
  editValue: string;
  setEditValue: (v: string) => void;
  editInputRef: React.RefObject<HTMLInputElement>;
  startEditing: (item: TodoNavItem) => void;
  saveEdit: () => void;
  cancelEdit: () => void;
  toggleVisibility: (id: string) => void;
  getDisplayLabel: (item: TodoNavItem) => string;
  canToggleOff: boolean;
  canToggleOn: boolean;
  reducedMotion: boolean;
}

const SortableRow = ({
  item,
  isEditing,
  editValue,
  setEditValue,
  editInputRef,
  startEditing,
  saveEdit,
  cancelEdit,
  toggleVisibility,
  getDisplayLabel,
  canToggleOff,
  canToggleOn,
  reducedMotion,
}: SortableRowProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: isEditing });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: reducedMotion ? 'none' : (transition ?? undefined),
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0 : 1, // hide original while overlay shows
  };

  const disabledToggle = item.visible ? !canToggleOff : !canToggleOn;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border/50',
        'transition-colors duration-150 select-none',
        !item.visible && 'opacity-60'
      )}
    >
      <button
        type="button"
        aria-label="Drag to reorder"
        className="touch-none cursor-grab active:cursor-grabbing p-1 -m-1 rounded-md hover:bg-muted active:bg-muted/80"
        style={{ touchAction: 'none' }}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-6 w-6 text-muted-foreground" />
      </button>
      <div className="text-foreground flex-shrink-0">{ICON_MAP[item.icon]}</div>
      {isEditing ? (
        <div
          className="flex-1 flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <Input
            ref={editInputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveEdit();
              if (e.key === 'Escape') cancelEdit();
            }}
            className="h-8 text-sm"
            maxLength={20}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              saveEdit();
            }}
          >
            <Check className="h-4 w-4 text-primary" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              cancelEdit();
            }}
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
      ) : (
        <>
          <span className="text-sm font-medium flex-1 truncate">
            {getDisplayLabel(item)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 flex-shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              startEditing(item);
            }}
          >
            <Pencil className="h-4 w-4 text-muted-foreground" />
          </Button>
        </>
      )}
      <Switch
        checked={item.visible}
        disabled={disabledToggle}
        onCheckedChange={() => toggleVisibility(item.id)}
        onClick={(e) => e.stopPropagation()}
        aria-label={`${item.visible ? 'Hide' : 'Show'} ${getDisplayLabel(item)} tab in bottom navigation`}
        className="flex-shrink-0"
      />
    </div>
  );
};

export const CustomizeTodoNavigationSheet = ({
  isOpen,
  onClose,
}: CustomizeTodoNavigationSheetProps) => {
  const { t } = useTranslation();
  const [navItems, setNavItems] = useState<TodoNavItem[]>(DEFAULT_TODO_NAV_ITEMS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, []);

  useHardwareBackButton({ onBack: onClose, enabled: isOpen, priority: 'sheet' });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(TouchSensor, {
      // small delay + tolerance prevents accidental drag while scrolling
      activationConstraint: { delay: 120, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (isOpen) loadNavItems();
  }, [isOpen]);

  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  const loadNavItems = async () => {
    try {
      const saved = await getSetting<TodoNavItem[] | null>(
        'customTodoNavItems',
        null
      );
      if (saved && saved.length > 0) {
        const savedMap = new Map(saved.map((item) => [item.id, item]));
        const merged = DEFAULT_TODO_NAV_ITEMS.map((defaultItem) => {
          const savedItem = savedMap.get(defaultItem.id);
          return savedItem
            ? { ...defaultItem, ...savedItem, path: defaultItem.path }
            : defaultItem;
        });
        const orderedMerged = saved
          .map((s) => merged.find((m) => m.id === s.id))
          .filter(Boolean) as TodoNavItem[];
        merged.forEach((item) => {
          if (!orderedMerged.find((o) => o.id === item.id))
            orderedMerged.push(item);
        });
        setNavItems(orderedMerged);
      } else {
        setNavItems([...DEFAULT_TODO_NAV_ITEMS]);
      }
    } catch {
      setNavItems([...DEFAULT_TODO_NAV_ITEMS]);
    }
  };

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingItemsRef = useRef<TodoNavItem[] | null>(null);

  const flushSave = async () => {
    const items = pendingItemsRef.current;
    if (!items) return;
    pendingItemsRef.current = null;
    try {
      await setSetting('customTodoNavItems', items);
      window.dispatchEvent(new CustomEvent('todoNavItemsChanged'));
      toast.success(t('settings.navSaved', 'Navigation saved'), { id: 'nav-save', duration: 1200 });
    } catch {
      toast.error(
        t('settings.saveNavFailed', 'Could not save navigation. Please try again.'),
        { id: 'nav-save' }
      );
    }
  };

  const saveNavItems = (items: TodoNavItem[]) => {
    setNavItems(items);
    pendingItemsRef.current = items;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { flushSave(); }, 400);
  };

  // Flush pending save on unmount/close
  useEffect(() => {
    if (!isOpen && pendingItemsRef.current) {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      flushSave();
    }
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  };

  const handleDragCancel = () => setActiveId(null);

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = navItems.findIndex((i) => i.id === active.id);
    const newIndex = navItems.findIndex((i) => i.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
    const newItems = arrayMove(navItems, oldIndex, newIndex);
    await saveNavItems(newItems);
  };

  const visibleCount = navItems.filter((i) => i.visible).length;
  const canToggleOff = visibleCount > MIN_VISIBLE;
  const canToggleOn = visibleCount < MAX_VISIBLE;

  const toggleVisibility = async (id: string) => {
    const item = navItems.find((i) => i.id === id);
    if (!item) return;

    if (item.visible && visibleCount <= MIN_VISIBLE) {
      toast.error(
        t(
          'settings.minNavItems',
          `At least ${MIN_VISIBLE} navigation items must be visible`
        )
      );
      return;
    }
    if (!item.visible && visibleCount >= MAX_VISIBLE) {
      toast.error(
        t(
          'settings.maxNavItems',
          `Maximum ${MAX_VISIBLE} navigation items allowed`
        )
      );
      return;
    }

    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    const newItems = navItems.map((i) =>
      i.id === id ? { ...i, visible: !i.visible } : i
    );
    await saveNavItems(newItems);
  };

  const startEditing = (item: TodoNavItem) => {
    setEditingId(item.id);
    setEditValue(item.customLabel || item.label);
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const trimmedValue = editValue.trim();
    if (!trimmedValue) {
      cancelEdit();
      return;
    }
    const newItems = navItems.map((item) =>
      item.id === editingId
        ? {
            ...item,
            customLabel: trimmedValue === item.label ? undefined : trimmedValue,
          }
        : item
    );
    await saveNavItems(newItems);
    setEditingId(null);
    setEditValue('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const handleReset = async () => {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {}
    await saveNavItems([...DEFAULT_TODO_NAV_ITEMS]);
    toast.success(t('settings.navigationReset', 'Navigation reset to default'));
  };

  const getDisplayLabel = (item: TodoNavItem) =>
    item.customLabel || t(`nav.${item.id}`, item.label);

  const activeItem = activeId ? navItems.find((i) => i.id === activeId) : null;

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent
        side="bottom"
        className="h-[80vh] rounded-t-2xl p-0 flex flex-col"
      >
        <SheetHeader className="px-4 py-3 border-b">
          <div className="flex items-center justify-between">
            <SheetTitle className="text-lg">
              {t('settings.customizeNavigation', 'Customize Navigation')}
            </SheetTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              {t('common.reset', 'Reset')}
            </Button>
          </div>
        </SheetHeader>

        <p className="px-4 py-2 text-sm text-muted-foreground">
          {t(
            'settings.customizeNavigationDesc',
            'Hold the grip to drag, toggle to show/hide, tap pencil to rename'
          )}
          <span className="ml-1 font-medium text-foreground">
            {visibleCount}/{MAX_VISIBLE}
          </span>
        </p>

        {/* Live preview of the bottom-bar slots */}
        <div className="mx-4 mb-2 rounded-xl border border-border bg-muted/40 p-2">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1 px-1">
            {t('settings.bottomBarPreview', 'Bottom bar preview')}
          </div>
          <div className="grid grid-cols-5 gap-1">
            {Array.from({ length: MAX_VISIBLE }).map((_, i) => {
              const item = navItems.filter((n) => n.visible)[i];
              return (
                <div
                  key={i}
                  className={cn(
                    'flex flex-col items-center justify-center gap-1 h-14 rounded-lg transition-colors',
                    item
                      ? 'bg-background'
                      : 'bg-background/40 border border-dashed border-border'
                  )}
                >
                  {item ? (
                    <>
                      <div className="text-foreground">
                        {ICON_MAP[item.icon]}
                      </div>
                      <span className="text-[10px] font-medium truncate max-w-full px-1">
                        {getDisplayLabel(item)}
                      </span>
                    </>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">
                      {t('settings.emptySlot', 'Empty')}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6" style={{ overscrollBehavior: 'contain' }}>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext
              items={navItems.map((i) => i.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2 pt-1">
                {navItems.map((item) => (
                  <SortableRow
                    key={item.id}
                    item={item}
                    isEditing={editingId === item.id}
                    editValue={editValue}
                    setEditValue={setEditValue}
                    editInputRef={editInputRef}
                    startEditing={startEditing}
                    saveEdit={saveEdit}
                    cancelEdit={cancelEdit}
                    toggleVisibility={toggleVisibility}
                    getDisplayLabel={getDisplayLabel}
                    canToggleOff={canToggleOff}
                    canToggleOn={canToggleOn}
                    reducedMotion={reducedMotion}
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay
              dropAnimation={reducedMotion ? null : {
                duration: 180,
                easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
              }}
            >
              {activeItem ? (
                <div
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-xl bg-card border-2 border-primary shadow-2xl',
                    'select-none'
                  )}
                >
                  <GripVertical className="h-6 w-6 text-primary" />
                  <div className="text-foreground">
                    {ICON_MAP[activeItem.icon]}
                  </div>
                  <span className="text-sm font-medium flex-1 truncate">
                    {getDisplayLabel(activeItem)}
                  </span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      </SheetContent>
    </Sheet>
  );
};
