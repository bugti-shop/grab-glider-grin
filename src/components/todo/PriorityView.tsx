import { TodoItem, Priority } from '@/types/note';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Flame, Flag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { applyTaskOrder, updateSectionOrder } from '@/utils/taskOrderStorage';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { toast } from 'sonner';
import { ViewModeSectionHeader } from './ViewModeSectionHeader';

interface PriorityViewProps {
  uncompletedItems: TodoItem[];
  collapsedViewSections: Set<string>;
  toggleViewSectionCollapse: (id: string) => void;
  renderTaskItem: (item: TodoItem) => React.ReactNode;
  renderSubtasksInline: (item: TodoItem) => React.ReactNode;
  renderCompletedSection: () => React.ReactNode;
  updateItem: (id: string, updates: Partial<TodoItem>) => void;
  getPriorityColor: (priority: string) => string;
  items: TodoItem[];
  setOrderVersion: React.Dispatch<React.SetStateAction<number>>;
}

export const PriorityView = ({
  uncompletedItems,
  collapsedViewSections,
  toggleViewSectionCollapse,
  renderTaskItem,
  renderSubtasksInline,
  renderCompletedSection,
  updateItem,
  getPriorityColor,
  items,
  setOrderVersion,
}: PriorityViewProps) => {
  const { t } = useTranslation();

  const priorityGroups = [
    { id: 'priority-high', label: t('grouping.highPriority', 'High Priority'), tasks: uncompletedItems.filter(i => i.priority === 'high'), color: getPriorityColor('high'), icon: <Flame className="h-4 w-4" style={{ color: getPriorityColor('high') }} /> },
    { id: 'priority-medium', label: t('grouping.mediumPriority', 'Medium Priority'), tasks: uncompletedItems.filter(i => i.priority === 'medium'), color: getPriorityColor('medium'), icon: <Flag className="h-4 w-4" style={{ color: getPriorityColor('medium') }} /> },
    { id: 'priority-low', label: t('grouping.lowPriority', 'Low Priority'), tasks: uncompletedItems.filter(i => i.priority === 'low'), color: getPriorityColor('low'), icon: <Flag className="h-4 w-4" style={{ color: getPriorityColor('low') }} /> },
    { id: 'priority-none', label: t('grouping.noPriority', 'No Priority'), tasks: uncompletedItems.filter(i => !i.priority || i.priority === 'none'), color: getPriorityColor('none'), icon: <Flag className="h-4 w-4" style={{ color: getPriorityColor('none') }} /> },
  ];

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    const destGroup = destination.droppableId;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    if (source.droppableId !== destGroup) {
      let newPriority: Priority = 'none';
      if (destGroup === 'priority-high') newPriority = 'high';
      else if (destGroup === 'priority-medium') newPriority = 'medium';
      else if (destGroup === 'priority-low') newPriority = 'low';
      updateItem(draggableId, { priority: newPriority });
      Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
      toast.success(t('todayPage.priorityUpdated'));
    }
    const destGroupTasks = items.filter(item => !item.completed).filter(item => {
      if (destGroup === 'priority-high') return item.priority === 'high';
      if (destGroup === 'priority-medium') return item.priority === 'medium';
      if (destGroup === 'priority-low') return item.priority === 'low';
      if (destGroup === 'priority-none') return !item.priority || item.priority === 'none';
      return false;
    });
    const ordered = applyTaskOrder(destGroupTasks, destGroup);
    const ids = ordered.map(t => t.id);
    const idx = ids.indexOf(draggableId);
    if (idx !== -1) ids.splice(idx, 1);
    ids.splice(destination.index, 0, draggableId);
    updateSectionOrder(destGroup, ids);
    setOrderVersion(v => v + 1);
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="space-y-6">
        {priorityGroups.map((group) => {
          const isCollapsed = collapsedViewSections.has(group.id);
          const orderedTasks = applyTaskOrder(group.tasks, group.id);
          return (
            <div key={group.id} className="bg-muted/30 rounded-xl border border-border/30 overflow-hidden">
              <ViewModeSectionHeader
                label={group.label}
                taskCount={group.tasks.length}
                color={group.color}
                icon={group.icon}
                sectionId={group.id}
                isCollapsed={isCollapsed}
                onToggle={toggleViewSectionCollapse}
              />
              {!isCollapsed && (
                <Droppable droppableId={group.id}>
                  {(provided, snapshot) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className={cn("p-2 space-y-2 min-h-[50px]", snapshot.isDraggingOver && "bg-primary/5")}>
                      {orderedTasks.map((item, index) => (
                        <Draggable key={item.id} draggableId={item.id} index={index}>
                          {(provided, snapshot) => (
                            <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} className={cn("bg-card rounded-lg border border-border/50 overflow-hidden", snapshot.isDragging && "shadow-lg ring-2 ring-primary")}>
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
        {renderCompletedSection()}
      </div>
    </DragDropContext>
  );
};
