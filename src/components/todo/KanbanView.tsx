import { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { TodoItem, TaskSection } from '@/types/note';
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
  DragUpdate,
} from '@hello-pangea/dnd';
import { ChevronRight, MoreVertical, Edit, Plus as PlusIcon, Copy, Trash2, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { applyTaskOrder, updateSectionOrder } from '@/utils/taskOrderStorage';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { toast } from 'sonner';

interface KanbanViewProps {
  sortedSections: TaskSection[];
  sections: TaskSection[];
  uncompletedItems: TodoItem[];
  completedItems: TodoItem[];
  showCompleted: boolean;
  collapsedViewSections: Set<string>;
  toggleViewSectionCollapse: (id: string) => void;
  renderTaskItem: (item: TodoItem) => React.ReactNode;
  renderSubtasksInline: (item: TodoItem) => React.ReactNode;
  setItems: React.Dispatch<React.SetStateAction<TodoItem[]>>;
  setOrderVersion: React.Dispatch<React.SetStateAction<number>>;
  handleEditSection: (section: TaskSection) => void;
  handleAddTaskToSection: (sectionId: string) => void;
  handleDuplicateSection: (sectionId: string) => void;
  handleDeleteSection: (sectionId: string) => void;
  handleAddSection: (position: string) => void;
}

const COMPLETED_TAB = '__completed__';
const ACTIVE_TAB_STORAGE_KEY = 'flowist:kanban:active-tab';
const TAB_DROPPABLE_PREFIX = 'kanban-tab-';
const TAB_HOVER_SWITCH_MS = 550;

/* -------------------------------------------------------------------------- */
/* Row — memoized so switching tabs / DnD doesn't re-render every card        */
/* -------------------------------------------------------------------------- */

interface KanbanRowProps {
  item: TodoItem;
  index: number;
  renderTaskItem: (item: TodoItem) => React.ReactNode;
  renderSubtasksInline: (item: TodoItem) => React.ReactNode;
}

const KanbanRow = memo(function KanbanRow({
  item,
  index,
  renderTaskItem,
  renderSubtasksInline,
}: KanbanRowProps) {
  return (
    <Draggable draggableId={item.id} index={index}>
      {(dragProvided, dragSnapshot) => (
        <div
          ref={dragProvided.innerRef}
          {...dragProvided.draggableProps}
          {...dragProvided.dragHandleProps}
          style={{
            ...dragProvided.draggableProps.style,
            // Smooth scrolling: browser can skip painting off-screen cards
            contentVisibility: dragSnapshot.isDragging ? 'visible' : 'auto',
            containIntrinsicSize: '72px',
          }}
          className={cn(
            'bg-card transition-shadow',
            dragSnapshot.isDragging && 'shadow-lg ring-2 ring-primary rounded-lg z-10 relative',
          )}
        >
          <div className="flex items-start">
            <div className="flex-1 min-w-0">
              {renderTaskItem(item)}
              {renderSubtasksInline(item)}
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground mt-4 mr-2 flex-shrink-0" />
          </div>
        </div>
      )}
    </Draggable>
  );
});

/* -------------------------------------------------------------------------- */
/* Skeleton                                                                   */
/* -------------------------------------------------------------------------- */

const KanbanSkeleton = () => (
  <div className="divide-y divide-border/40 animate-pulse">
    {Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="flex items-center gap-3 px-3 py-4">
        <div className="h-6 w-6 rounded-full bg-muted flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-3/4 rounded bg-muted" />
          <div className="h-3 w-1/2 rounded bg-muted/70" />
        </div>
      </div>
    ))}
  </div>
);

/* -------------------------------------------------------------------------- */
/* Kanban view                                                                */
/* -------------------------------------------------------------------------- */

export const KanbanView = ({
  sortedSections,
  sections,
  uncompletedItems,
  completedItems,
  showCompleted,
  renderTaskItem,
  renderSubtasksInline,
  setItems,
  setOrderVersion,
  handleEditSection,
  handleAddTaskToSection,
  handleDuplicateSection,
  handleDeleteSection,
  handleAddSection,
}: KanbanViewProps) => {
  const { t } = useTranslation();

  const tabs = useMemo(() => {
    const base: { id: string; section: TaskSection | null }[] = sortedSections.map((s) => ({
      id: s.id,
      section: s,
    }));
    if (showCompleted && completedItems.length > 0) {
      base.push({ id: COMPLETED_TAB, section: null });
    }
    return base;
  }, [sortedSections, showCompleted, completedItems.length]);

  /* ---------- Active tab: persisted per device ---------- */
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window === 'undefined') return sortedSections[0]?.id ?? '';
    try {
      const saved = window.localStorage.getItem(ACTIVE_TAB_STORAGE_KEY);
      if (saved) return saved;
    } catch { /* ignore */ }
    return sortedSections[0]?.id ?? '';
  });

  // Persist on change
  useEffect(() => {
    if (!activeTab) return;
    try {
      window.localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTab);
    } catch { /* ignore */ }
  }, [activeTab]);

  // Keep active tab valid as sections change
  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(tabs[0]?.id ?? '');
    }
  }, [tabs, activeTab]);

  const activeSection = sortedSections.find((s) => s.id === activeTab) || null;

  /* ---------- Precompute tasks per section (memoized) ---------- */
  const sectionTasksMap = useMemo(() => {
    const map = new Map<string, TodoItem[]>();
    for (const section of sortedSections) {
      const raw = uncompletedItems.filter(
        (item) => item.sectionId === section.id || (!item.sectionId && section.id === sections[0]?.id),
      );
      map.set(section.id, applyTaskOrder(raw, `kanban-${section.id}`));
    }
    return map;
  }, [sortedSections, uncompletedItems, sections]);

  const activeTasks = activeSection ? sectionTasksMap.get(activeSection.id) ?? [] : [];

  /* ---------- Skeleton: brief shimmer on first mount / heavy switch ---------- */
  const [isSwitching, setIsSwitching] = useState(false);
  const switchTimer = useRef<number | null>(null);
  const prevTab = useRef(activeTab);
  useEffect(() => {
    if (prevTab.current === activeTab) return;
    prevTab.current = activeTab;
    if (activeTasks.length > 40) {
      setIsSwitching(true);
      if (switchTimer.current) window.clearTimeout(switchTimer.current);
      switchTimer.current = window.setTimeout(() => setIsSwitching(false), 120);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);
  useEffect(() => () => {
    if (switchTimer.current) window.clearTimeout(switchTimer.current);
  }, []);

  /* ---------- Cross-tab DnD: switch tab while hovering a tab header ---------- */
  const hoverTimer = useRef<number | null>(null);
  const hoverTarget = useRef<string | null>(null);
  const clearHover = () => {
    if (hoverTimer.current) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    hoverTarget.current = null;
  };

  const handleDragUpdate = useCallback((update: DragUpdate) => {
    const dest = update.destination?.droppableId;
    if (!dest || !dest.startsWith(TAB_DROPPABLE_PREFIX)) {
      clearHover();
      return;
    }
    const targetTab = dest.slice(TAB_DROPPABLE_PREFIX.length);
    if (targetTab === activeTab || targetTab === COMPLETED_TAB) {
      clearHover();
      return;
    }
    if (hoverTarget.current === targetTab) return;
    clearHover();
    hoverTarget.current = targetTab;
    hoverTimer.current = window.setTimeout(() => {
      setActiveTab(targetTab);
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
      clearHover();
    }, TAB_HOVER_SWITCH_MS);
  }, [activeTab]);

  /* ---------- Drop handler: supports drop-on-tab and drop-in-list ---------- */
  const handleDragEnd = useCallback((result: DropResult) => {
    clearHover();
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    const taskId = draggableId;
    const sourceSectionId = source.droppableId;

    // Resolve real destination section id (tab drop OR list drop)
    let destSectionId = destination.droppableId;
    let destIndex = destination.index;
    if (destSectionId.startsWith(TAB_DROPPABLE_PREFIX)) {
      destSectionId = destSectionId.slice(TAB_DROPPABLE_PREFIX.length);
      destIndex = 0; // top of target list
    }
    if (destSectionId === COMPLETED_TAB) return;
    if (sourceSectionId === destSectionId && source.index === destIndex) return;

    setItems(prevItems => {
      const taskToMove = prevItems.find(item => item.id === taskId);
      if (!taskToMove) return prevItems;
      const uncompletedList = prevItems.filter(item => !item.completed);
      const completedList = prevItems.filter(item => item.completed);
      const sourceTasks = uncompletedList.filter(item => item.sectionId === sourceSectionId || (!item.sectionId && sourceSectionId === sections[0]?.id));
      const destTasksRaw = uncompletedList.filter(item => item.id !== taskId && (item.sectionId === destSectionId || (!item.sectionId && destSectionId === sections[0]?.id)));
      const currentlyOrderedDestTasks = applyTaskOrder(destTasksRaw, `kanban-${destSectionId}`);
      const currentDestOrderIds = currentlyOrderedDestTasks.map(t => t.id);
      currentDestOrderIds.splice(destIndex, 0, taskId);
      updateSectionOrder(`kanban-${destSectionId}`, currentDestOrderIds);
      const destTasks = [...currentlyOrderedDestTasks];
      const updatedTask = { ...taskToMove, sectionId: destSectionId };
      destTasks.splice(destIndex, 0, updatedTask);
      if (sourceSectionId !== destSectionId) {
        const currentlyOrderedSourceTasks = applyTaskOrder(sourceTasks, `kanban-${sourceSectionId}`);
        const sourceOrderIds = currentlyOrderedSourceTasks.map(t => t.id).filter(id => id !== taskId);
        updateSectionOrder(`kanban-${sourceSectionId}`, sourceOrderIds);
      }
      const otherTasks = uncompletedList.filter(item => item.id !== taskId && item.sectionId !== destSectionId && (item.sectionId || destSectionId !== sections[0]?.id));
      return [...otherTasks, ...destTasks, ...completedList];
    });
    setOrderVersion(v => v + 1);
    Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
    toast.success(t('tasks.taskMoved', 'Task moved'));
    // Follow the task to its new tab
    if (sourceSectionId !== destSectionId) setActiveTab(destSectionId);
  }, [sections, setItems, setOrderVersion, t]);

  const isCompletedActive = activeTab === COMPLETED_TAB;

  return (
    <DragDropContext onDragEnd={handleDragEnd} onDragUpdate={handleDragUpdate}>
      <div className="w-full">
        {/* Segmented tab bar — each tab is a Droppable for cross-tab DnD */}
        <div className="relative border-b border-border/60">
          <div
            className="flex items-stretch overflow-x-auto scrollbar-hide -mx-4 px-4"
            style={{ WebkitOverflowScrolling: 'touch', scrollBehavior: 'smooth' }}
          >
            {tabs.map((tab) => {
              const isActive = tab.id === activeTab;
              const isCompleted = tab.id === COMPLETED_TAB;
              const label = isCompleted ? t('common.completed', 'Completed') : tab.section?.name ?? '';
              const count = isCompleted
                ? completedItems.length
                : (sectionTasksMap.get(tab.id)?.length ?? 0);
              const accent = isCompleted ? '#10b981' : tab.section?.color;

              const tabButton = (droppableRef?: (el: HTMLElement | null) => void, extraProps: Record<string, unknown> = {}, isDraggingOver = false) => (
                <button
                  ref={droppableRef as never}
                  {...extraProps}
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'relative flex items-center gap-2 px-4 py-3 flex-shrink-0 transition-colors',
                    'text-sm font-semibold whitespace-nowrap select-none',
                    isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                    isDraggingOver && !isActive && 'bg-primary/5 text-primary',
                  )}
                >
                  {isCompleted && <CheckCircle2 className="h-4 w-4" style={{ color: accent }} />}
                  <span>{label}</span>
                  <span
                    className={cn(
                      'text-[11px] font-medium px-1.5 py-0.5 rounded-full min-w-[20px] text-center',
                      isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {count}
                  </span>
                  {isActive && (
                    <span
                      className="absolute left-3 right-3 -bottom-px h-[3px] rounded-full bg-primary"
                      style={accent && !isCompleted ? { backgroundColor: accent } : undefined}
                    />
                  )}
                </button>
              );

              // Don't allow drop onto completed tab
              if (isCompleted) return tabButton();

              return (
                <Droppable key={tab.id} droppableId={`${TAB_DROPPABLE_PREFIX}${tab.id}`}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="flex items-stretch"
                    >
                      {tabButton(undefined, {}, snapshot.isDraggingOver)}
                      <span style={{ display: 'none' }}>{provided.placeholder}</span>
                    </div>
                  )}
                </Droppable>
              );
            })}
          </div>
        </div>

        {/* Active tab header actions */}
        {activeSection && (
          <div className="flex items-center justify-between px-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-primary font-medium"
              onClick={() => handleAddTaskToSection(activeSection.id)}
            >
              <PlusIcon className="h-4 w-4 mr-1" />
              {t('sections.addTask', 'Add Task')}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48 bg-popover border shadow-lg z-50">
                <DropdownMenuItem onClick={() => handleEditSection(activeSection)} className="cursor-pointer">
                  <Edit className="h-4 w-4 mr-2" />{t('sections.editSection')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleAddTaskToSection(activeSection.id)} className="cursor-pointer">
                  <PlusIcon className="h-4 w-4 mr-2" />{t('sections.addTask')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleDuplicateSection(activeSection.id)} className="cursor-pointer">
                  <Copy className="h-4 w-4 mr-2" />{t('common.duplicate')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleDeleteSection(activeSection.id)}
                  className="cursor-pointer text-destructive focus:text-destructive"
                  disabled={sections.length <= 1}
                >
                  <Trash2 className="h-4 w-4 mr-2" />{t('common.delete')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleAddSection('below')} className="cursor-pointer">
                  <PlusIcon className="h-4 w-4 mr-2" />Add Section
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Active tab content */}
        <div
          className="pt-1 pb-2"
          style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain' }}
        >
          {isSwitching ? (
            <KanbanSkeleton />
          ) : isCompletedActive ? (
            <div className="divide-y divide-border/40">
              {completedItems.map((item) => (
                <div
                  key={item.id}
                  className="opacity-70"
                  style={{ contentVisibility: 'auto', containIntrinsicSize: '72px' }}
                >
                  {renderTaskItem(item)}
                </div>
              ))}
            </div>
          ) : activeSection ? (
            <Droppable droppableId={activeSection.id}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={cn(
                    'min-h-[300px] divide-y divide-border/40 transition-colors',
                    snapshot.isDraggingOver && 'bg-primary/5',
                  )}
                >
                  {activeTasks.length === 0 ? (
                    <div className="py-16 text-center text-sm text-muted-foreground">
                      {t('sections.dropTasksHere')}
                    </div>
                  ) : (
                    activeTasks.map((item, index) => (
                      <KanbanRow
                        key={item.id}
                        item={item}
                        index={index}
                        renderTaskItem={renderTaskItem}
                        renderSubtasksInline={renderSubtasksInline}
                      />
                    ))
                  )}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          ) : null}
        </div>
      </div>
    </DragDropContext>
  );
};
