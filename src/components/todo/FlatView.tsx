import { useEffect, useMemo, useRef } from 'react';
import { TodoItem, TaskSection } from '@/types/note';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { applyTaskOrder, moveTaskInSectionOrder, updateSectionOrder } from '@/utils/taskOrderStorage';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { VirtualizedTaskList, shouldUseVirtualization } from '@/components/VirtualizedTaskList';
import { FlatTaskList } from '@/components/tasks/FlatTaskList';
import { useFlatTaskIndex } from '@/hooks/useFlatTaskIndex';
import { markRenderStart, trackScrollFps } from '@/utils/perfBenchmark';
import { FLAT_ROW_WRAPPER_CLASS, checkFlatRowConsistency } from '@/utils/rowConsistency';
import { useVirtualizationSettings } from '@/utils/virtualizationSettings';

// Keep the exact original row UI, but switch away from DnD before it can choke
// scrolling/navigation. 480 rows was already enough to make @hello-pangea/dnd
// expensive on mobile, so the scalable path starts early while preserving the
// same flat row + separator appearance.
const VIRTUALIZE_THRESHOLD = 120;

interface FlatViewProps {
  sortedSections: TaskSection[];
  sections: TaskSection[];
  uncompletedItems: TodoItem[];
  completedItems: TodoItem[];
  showCompleted: boolean;
  isCompletedOpen: boolean;
  setIsCompletedOpen: (v: boolean) => void;
  compactMode: boolean;
  collapsedViewSections: Set<string>;
  renderTaskItem: (item: TodoItem) => React.ReactNode;
  renderSubtasksInline: (item: TodoItem) => React.ReactNode;
  renderSectionHeader: (section: TaskSection, isDragging: boolean) => React.ReactNode;
  renderVirtualSectionHeader?: (section: TaskSection, isDragging: boolean, taskCountOverride: number) => React.ReactNode;
  updateItem: (id: string, updates: Partial<TodoItem>) => void;
  handleSectionDragEnd: (result: DropResult) => void;
  setOrderVersion: React.Dispatch<React.SetStateAction<number>>;
}

export const FlatView = ({
  sortedSections,
  sections,
  uncompletedItems,
  completedItems,
  showCompleted,
  isCompletedOpen,
  setIsCompletedOpen,
  compactMode,
  collapsedViewSections,
  renderTaskItem,
  renderSubtasksInline,
  renderSectionHeader,
  renderVirtualSectionHeader,
  updateItem,
  handleSectionDragEnd,
  setOrderVersion,
}: FlatViewProps) => {
  const { t } = useTranslation();
  const [virtualizationSettings] = useVirtualizationSettings();
  const useVirtualizedList = false;

  // Big-list path: when there are many uncompleted tasks, drop DnD + per-section
  // nesting and render through the shared virtualized FlatTaskList. This scales
  // to 100k+ rows with constant memory and steady 60fps scroll.
  const visibleTaskCount = uncompletedItems.length + (showCompleted ? completedItems.length : 0);
  const useFlatVirtualized = visibleTaskCount >= VIRTUALIZE_THRESHOLD;
  const virtualOrderedItems = useMemo(
    () => useFlatVirtualized ? applyTaskOrder(uncompletedItems, 'flat-virtual') : uncompletedItems,
    [useFlatVirtualized, uncompletedItems],
  );
  const flatIndex = useFlatTaskIndex(useFlatVirtualized ? virtualOrderedItems : undefined);
  const virtualHeaderSection = useMemo<TaskSection>(() => {
    const base = sortedSections[0] ?? sections[0] ?? { id: 'default', name: t('grouping.tasks'), color: '#3b82f6', isCollapsed: false, order: 0 };
    return { ...base, name: base.name || t('grouping.tasks'), order: base.order ?? 0 } as TaskSection;
  }, [sections, sortedSections, t]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!useFlatVirtualized) return;
    const done = markRenderStart('Today.FlatTaskList');
    done({ itemCount: virtualOrderedItems.length });
    const el = scrollContainerRef.current?.querySelector<HTMLDivElement>('[data-flat-scroll]');
    if (el) {
      const stop = trackScrollFps(el, 'Today.FlatTaskList');
      // Sample row layout after paint to catch any drift between paths.
      const raf = requestAnimationFrame(() => checkFlatRowConsistency(scrollContainerRef.current, `virtualized(${uncompletedItems.length})`));
      return () => { stop?.(); cancelAnimationFrame(raf); };
    }
  }, [useFlatVirtualized, virtualOrderedItems.length]);

  // Also sample the non-virtualized path so the baseline is captured from
  // small lists and reused to validate the big-list path.
  const dndRootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (useFlatVirtualized) return;
    const raf = requestAnimationFrame(() => checkFlatRowConsistency(dndRootRef.current, `dnd(${uncompletedItems.length})`));
    return () => cancelAnimationFrame(raf);
  }, [useFlatVirtualized, uncompletedItems.length]);

  if (useFlatVirtualized) {
    return (
      <div ref={scrollContainerRef}>
        <div className="bg-background">
          {renderVirtualSectionHeader
            ? renderVirtualSectionHeader(virtualHeaderSection, false, virtualOrderedItems.length)
            : renderSectionHeader(virtualHeaderSection, false)}
          {collapsedViewSections.has(`flat-${virtualHeaderSection.id}`) ? null : (
            <div data-flat-scroll>
              <FlatTaskList
                index={flatIndex}
                rowHeight={compactMode ? virtualizationSettings.tasks.compactRowHeight : virtualizationSettings.tasks.rowHeight}
                overscan={virtualizationSettings.tasks.overscan}
                useWindow={virtualizationSettings.tasks.windowing}
                onReorder={(from, to) => {
                  if (from === to) return;
                  const ids = virtualOrderedItems.map(i => i.id);
                  moveTaskInSectionOrder('flat-virtual', ids, from, to);
                  // Persist new order for every section bucket touched so the
                  // flat view stays consistent at scale (sections are merged
                  // into one virtual list when virtualized).
                  setOrderVersion(v => v + 1);
                  try { Haptics.impact({ style: ImpactStyle.Light }); } catch {}
                }}
                renderRow={(row) => (
                  <div data-flat-row className={FLAT_ROW_WRAPPER_CLASS}>
                    {renderTaskItem(row.task)}
                  </div>
                )}
                emptyState={
                  <div className="text-center py-20">
                    <p className="text-muted-foreground">{t('emptyStates.noTasks')}</p>
                  </div>
                }
              />
            </div>
          )}
        </div>

        {showCompleted && completedItems.length > 0 && (
          <Collapsible open={isCompletedOpen} onOpenChange={setIsCompletedOpen}>
            <div className="bg-muted/50 rounded-xl p-3 border border-border/30">
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between px-2 py-2 hover:bg-muted/60 rounded-lg transition-colors">
                  <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t('grouping.completed')}</span>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="text-sm font-medium">{completedItems.length}</span>
                    {isCompletedOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </div>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className={cn("mt-2", compactMode && "mt-1")}>
                <FlatTaskList
                  items={completedItems}
                    rowHeight={compactMode ? virtualizationSettings.tasks.compactRowHeight : virtualizationSettings.tasks.rowHeight}
                    overscan={virtualizationSettings.tasks.overscan}
                    useWindow={virtualizationSettings.tasks.windowing}
                  disableKeyboard
                  renderRow={(row) => (
                    <div className="border-b border-border/50">
                      {renderTaskItem(row.task)}
                    </div>
                  )}
                />
              </CollapsibleContent>
            </div>
          </Collapsible>
        )}
      </div>
    );
  }


  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { source, destination, draggableId, type } = result;
    if (type === 'SECTION') { handleSectionDragEnd(result); return; }
    const taskId = draggableId;
    const sourceSectionId = source.droppableId.replace('flat-section-', '');
    const destSectionId = destination.droppableId.replace('flat-section-', '');
    const destIndex = destination.index;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    if (sourceSectionId !== destSectionId) {
      const actualDestSectionId = destSectionId === 'default' ? sections[0]?.id : destSectionId;
      updateItem(taskId, { sectionId: actualDestSectionId });
    }
    const destSectionTasks = uncompletedItems.filter(item => {
      const actualDestId = destSectionId === 'default' ? sections[0]?.id : destSectionId;
      return item.sectionId === actualDestId || (!item.sectionId && actualDestId === sections[0]?.id);
    });
    const currentlyOrderedTasks = applyTaskOrder(destSectionTasks, `flat-section-${destSectionId}`);
    const currentOrderIds = currentlyOrderedTasks.map(t => t.id);
    const taskCurrentIndex = currentOrderIds.indexOf(taskId);
    if (taskCurrentIndex !== -1) currentOrderIds.splice(taskCurrentIndex, 1);
    currentOrderIds.splice(destIndex, 0, taskId);
    updateSectionOrder(`flat-section-${destSectionId}`, currentOrderIds);
    setOrderVersion(v => v + 1);
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  };

  if (useVirtualizedList) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-border/30 bg-muted/20 overflow-hidden">
          <VirtualizedTaskList
            items={uncompletedItems}
            sections={sortedSections}
            expandedTasks={new Set()}
            onReorder={(updatedItems) => {
              sortedSections.forEach((section) => {
                const sectionId = section.id === sections[0]?.id ? 'default' : section.id;
                const sectionTaskIds = updatedItems
                  .filter((item) => item.sectionId === section.id || (!item.sectionId && section.id === sections[0]?.id))
                  .map((item) => item.id);

                updateSectionOrder(`flat-section-${sectionId}`, sectionTaskIds);
              });
              setOrderVersion((v) => v + 1);
            }}
            renderTask={(item) => (
              <div className="bg-card rounded-lg border border-border/50">
                {renderTaskItem(item)}
                {renderSubtasksInline(item)}
              </div>
            )}
            renderSectionHeader={(section) => renderSectionHeader(section, false)}
            compactMode={compactMode}
            className="max-h-[70vh]"
          />
        </div>

        {showCompleted && completedItems.length > 0 && (
          <Collapsible open={isCompletedOpen} onOpenChange={setIsCompletedOpen}>
            <div className="bg-muted/50 rounded-xl p-3 border border-border/30">
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between px-2 py-2 hover:bg-muted/60 rounded-lg transition-colors">
                  <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t('grouping.completed')}</span>
                  <div className="flex items-center gap-2 text-muted-foreground"><span className="text-sm font-medium">{completedItems.length}</span>{isCompletedOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</div>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className={cn("space-y-2 mt-2", compactMode && "space-y-1 mt-1")}>
                {completedItems.slice(0, 100).map(renderTaskItem)}
                {completedItems.length > 100 && (
                  <div className="px-2 py-1 text-xs text-muted-foreground text-center">
                    {t('grouping.completed')} {completedItems.length}
                  </div>
                )}
              </CollapsibleContent>
            </div>
          </Collapsible>
        )}
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div ref={dndRootRef}>
        {sortedSections.map((section) => {
          const sectionTasks = uncompletedItems.filter(item => item.sectionId === section.id || (!item.sectionId && section.id === sections[0]?.id));
          const sectionId = section.id === sections[0]?.id ? 'default' : section.id;
          const isCollapsed = collapsedViewSections.has(`flat-${section.id}`);
          const orderedTasks = applyTaskOrder(sectionTasks, `flat-section-${sectionId}`);
          return (
            <div key={section.id}>
              {renderSectionHeader(section, false)}
              {!isCollapsed && (
                <Droppable droppableId={`flat-section-${sectionId}`}>
                  {(provided, snapshot) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className={cn("min-h-[40px]", snapshot.isDraggingOver && "bg-primary/5")}>
                      {orderedTasks.length === 0 ? (
                        <div className={cn("text-center text-sm text-muted-foreground", compactMode ? "py-2 px-2" : "py-4 px-4")}>{t('emptyStates.noTasksInSection')}</div>
                      ) : orderedTasks.map((item, index) => (
                        <Draggable key={item.id} draggableId={item.id} index={index}>
                          {(provided, snapshot) => (
                            <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} data-flat-row className={cn(FLAT_ROW_WRAPPER_CLASS, snapshot.isDragging && "shadow-lg ring-2 ring-primary bg-card")}>
                              {renderTaskItem(item)}{renderSubtasksInline(item)}
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              )}
            </div>
          );
        })}

        {showCompleted && completedItems.length > 0 && (
          <Collapsible open={isCompletedOpen} onOpenChange={setIsCompletedOpen}>
            <div className="bg-muted/50 rounded-xl p-3 border border-border/30">
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-between px-2 py-2 hover:bg-muted/60 rounded-lg transition-colors">
                  <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{t('grouping.completed')}</span>
                  <div className="flex items-center gap-2 text-muted-foreground"><span className="text-sm font-medium">{completedItems.length}</span>{isCompletedOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</div>
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className={cn("space-y-2 mt-2", compactMode && "space-y-1 mt-1")}>{completedItems.map((item) => <div key={item.id} className="cv-auto">{renderTaskItem(item)}</div>)}</CollapsibleContent>
            </div>
          </Collapsible>
        )}
      </div>
    </DragDropContext>
  );
};
