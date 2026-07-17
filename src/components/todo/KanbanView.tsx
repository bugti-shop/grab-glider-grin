import { useState, useEffect, useMemo } from 'react';
import { TodoItem, TaskSection } from '@/types/note';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
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
    const base = sortedSections.map((s) => ({ id: s.id, section: s as TaskSection | null }));
    if (showCompleted && completedItems.length > 0) {
      base.push({ id: COMPLETED_TAB, section: null });
    }
    return base;
  }, [sortedSections, showCompleted, completedItems.length]);

  const [activeTab, setActiveTab] = useState<string>(() => sortedSections[0]?.id ?? COMPLETED_TAB);

  // Keep active tab valid if sections change
  useEffect(() => {
    if (!tabs.some((tab) => tab.id === activeTab)) {
      setActiveTab(tabs[0]?.id ?? '');
    }
  }, [tabs, activeTab]);

  const activeSection = sortedSections.find((s) => s.id === activeTab) || null;

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

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    const taskId = draggableId;
    const sourceSectionId = source.droppableId;
    const destSectionId = destination.droppableId;
    if (sourceSectionId === destSectionId && source.index === destination.index) return;
    setItems(prevItems => {
      const taskToMove = prevItems.find(item => item.id === taskId);
      if (!taskToMove) return prevItems;
      const uncompletedList = prevItems.filter(item => !item.completed);
      const completedList = prevItems.filter(item => item.completed);
      const sourceTasks = uncompletedList.filter(item => item.sectionId === sourceSectionId || (!item.sectionId && sourceSectionId === sections[0]?.id));
      const destTasksRaw = uncompletedList.filter(item => item.id !== taskId && (item.sectionId === destSectionId || (!item.sectionId && destSectionId === sections[0]?.id)));
      const currentlyOrderedDestTasks = applyTaskOrder(destTasksRaw, `kanban-${destSectionId}`);
      const currentDestOrderIds = currentlyOrderedDestTasks.map(t => t.id);
      currentDestOrderIds.splice(destination.index, 0, taskId);
      updateSectionOrder(`kanban-${destSectionId}`, currentDestOrderIds);
      const destTasks = [...currentlyOrderedDestTasks];
      const updatedTask = { ...taskToMove, sectionId: destSectionId };
      destTasks.splice(destination.index, 0, updatedTask);
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
  };

  const isCompletedActive = activeTab === COMPLETED_TAB;

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="w-full">
        {/* Segmented tab bar */}
        <div className="relative border-b border-border/60">
          <div className="flex items-stretch overflow-x-auto scrollbar-hide -mx-4 px-4">
            {tabs.map((tab) => {
              const isActive = tab.id === activeTab;
              const isCompleted = tab.id === COMPLETED_TAB;
              const label = isCompleted ? t('common.completed', 'Completed') : tab.section?.name ?? '';
              const count = isCompleted
                ? completedItems.length
                : (sectionTasksMap.get(tab.id)?.length ?? 0);
              const accent = isCompleted ? '#10b981' : tab.section?.color;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'relative flex items-center gap-2 px-4 py-3 flex-shrink-0 transition-colors',
                    'text-sm font-semibold whitespace-nowrap',
                    isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
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
            })}
          </div>
        </div>

        {/* Active tab header actions (edit / add / duplicate / delete) */}
        {activeSection && (
          <div className="flex items-center justify-end px-2 pt-2">
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
        <div className="pt-1 pb-2">
          {isCompletedActive ? (
            <div className="divide-y divide-border/40">
              {completedItems.map((item) => (
                <div key={item.id} className="opacity-70">
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
                      <Draggable key={item.id} draggableId={item.id} index={index}>
                        {(dragProvided, dragSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            {...dragProvided.dragHandleProps}
                            className={cn(
                              'bg-card transition-shadow',
                              dragSnapshot.isDragging && 'shadow-lg ring-2 ring-primary rounded-lg',
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
