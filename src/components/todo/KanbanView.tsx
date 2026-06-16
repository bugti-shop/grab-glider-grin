import { TodoItem, TaskSection } from '@/types/note';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Columns3, ChevronRight, ChevronDown, MoreVertical, Edit, Plus as PlusIcon, Copy, Trash2, CheckCircle2 } from 'lucide-react';
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

export const KanbanView = ({
  sortedSections,
  sections,
  uncompletedItems,
  completedItems,
  showCompleted,
  collapsedViewSections,
  toggleViewSectionCollapse,
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

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="overflow-x-auto pb-4 -mx-4 px-4">
        <div className="flex gap-4" style={{ minWidth: 'max-content' }}>
          {sortedSections.map((section) => {
            const rawSectionTasks = uncompletedItems.filter(item => item.sectionId === section.id || (!item.sectionId && section.id === sections[0]?.id));
            const sectionTasks = applyTaskOrder(rawSectionTasks, `kanban-${section.id}`);
            const kanbanSectionId = `kanban-${section.id}`;
            const isCollapsed = collapsedViewSections.has(kanbanSectionId);
            return (
              <div key={section.id} className="flex-shrink-0 w-72 bg-muted/30 rounded-xl border border-border/30 overflow-hidden">
                <button onClick={() => toggleViewSectionCollapse(kanbanSectionId)} className="w-full flex items-center gap-2 px-3 py-3 border-b border-border/30 hover:bg-muted/20 transition-colors" style={{ borderLeft: `4px solid ${section.color}` }}>
                  <Columns3 className="h-3.5 w-3.5" style={{ color: section.color }} />
                  <span className="text-sm font-semibold flex-1 text-left">{section.name}</span>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{sectionTasks.length}</span>
                  {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <div className="p-1 hover:bg-muted/50 rounded transition-colors"><MoreVertical className="h-4 w-4 text-muted-foreground" /></div>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48 bg-popover border shadow-lg z-50">
                      <DropdownMenuItem onClick={() => handleEditSection(section)} className="cursor-pointer"><Edit className="h-4 w-4 mr-2" />{t('sections.editSection')}</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleAddTaskToSection(section.id)} className="cursor-pointer"><PlusIcon className="h-4 w-4 mr-2" />{t('sections.addTask')}</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleDuplicateSection(section.id)} className="cursor-pointer"><Copy className="h-4 w-4 mr-2" />{t('common.duplicate')}</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDeleteSection(section.id)} className="cursor-pointer text-destructive focus:text-destructive" disabled={sections.length <= 1}><Trash2 className="h-4 w-4 mr-2" />{t('common.delete')}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </button>
                {!isCollapsed && (
                  <>
                    <Droppable droppableId={section.id}>
                      {(provided, snapshot) => (
                        <div ref={provided.innerRef} {...provided.droppableProps} className={cn("min-h-[300px] max-h-[400px] overflow-y-auto p-2 space-y-2", snapshot.isDraggingOver && "bg-primary/5")}>
                          {sectionTasks.length === 0 ? (
                            <div className="py-8 text-center text-sm text-muted-foreground">{t('sections.dropTasksHere')}</div>
                          ) : sectionTasks.map((item, index) => (
                            <Draggable key={item.id} draggableId={item.id} index={index}>
                              {(provided, snapshot) => (
                                <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} className={cn("bg-card rounded-lg border border-border/50 shadow-sm", snapshot.isDragging && "shadow-lg ring-2 ring-primary")}>
                                  {renderTaskItem(item)}
                                  {renderSubtasksInline(item)}
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                    <div className="p-2 border-t border-border/30">
                      <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={() => handleAddTaskToSection(section.id)}>
                        <PlusIcon className="h-4 w-4 mr-2" />{t('sections.addTask')}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
          {showCompleted && completedItems.length > 0 && (
            <div className="flex-shrink-0 w-72 bg-muted/30 rounded-xl border border-border/30 overflow-hidden">
              <button onClick={() => toggleViewSectionCollapse('kanban-completed')} className="w-full flex items-center gap-2 px-3 py-3 border-b border-border/30 hover:bg-muted/20 transition-colors" style={{ borderLeft: `4px solid #10b981` }}>
                <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                <span className="text-sm font-semibold flex-1 text-left text-muted-foreground uppercase tracking-wide">Completed</span>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{completedItems.length}</span>
                {collapsedViewSections.has('kanban-completed') ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>
              {!collapsedViewSections.has('kanban-completed') && (
                <div className="min-h-[100px] max-h-[400px] overflow-y-auto p-2 space-y-2">
                  {completedItems.map((item) => (
                    <div key={item.id} className="bg-card rounded-lg border border-border/50 shadow-sm opacity-70">{renderTaskItem(item)}</div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex-shrink-0 w-72">
            <Button variant="outline" className="w-full h-12 border-dashed" onClick={() => handleAddSection('below')}>
              <PlusIcon className="h-4 w-4 mr-2" />Add Section
            </Button>
          </div>
        </div>
      </div>
    </DragDropContext>
  );
};
