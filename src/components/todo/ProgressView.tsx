import { TodoItem } from '@/types/note';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { applyTaskOrder, updateSectionOrder } from '@/utils/taskOrderStorage';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ViewModeSectionHeader } from './ViewModeSectionHeader';

interface ProgressViewProps {
  uncompletedItems: TodoItem[];
  collapsedViewSections: Set<string>;
  toggleViewSectionCollapse: (id: string) => void;
  renderTaskItem: (item: TodoItem) => React.ReactNode;
  renderSubtasksInline: (item: TodoItem) => React.ReactNode;
  renderCompletedSection: () => React.ReactNode;
  setOrderVersion: React.Dispatch<React.SetStateAction<number>>;
}

export const ProgressView = ({
  uncompletedItems,
  collapsedViewSections,
  toggleViewSectionCollapse,
  renderTaskItem,
  renderSubtasksInline,
  renderCompletedSection,
  setOrderVersion,
}: ProgressViewProps) => {
  const { t } = useTranslation();

  const notStarted = uncompletedItems.filter(item => !item.subtasks || item.subtasks.length === 0 || item.subtasks.every(st => !st.completed));
  const inProgress = uncompletedItems.filter(item => item.subtasks && item.subtasks.length > 0 && item.subtasks.some(st => st.completed) && item.subtasks.some(st => !st.completed));
  const almostDone = uncompletedItems.filter(item => item.subtasks && item.subtasks.length > 0 && item.subtasks.filter(st => st.completed).length >= item.subtasks.length * 0.75 && item.subtasks.some(st => !st.completed));

  const progressGroups = [
    { id: 'progress-notstarted', label: t('grouping.notStarted'), tasks: notStarted.filter(t => !inProgress.includes(t) && !almostDone.includes(t)), color: '#6b7280', percent: '0%' },
    { id: 'progress-inprogress', label: t('grouping.inProgress'), tasks: inProgress.filter(t => !almostDone.includes(t)), color: '#f59e0b', percent: '25-74%' },
    { id: 'progress-almostdone', label: t('grouping.almostDone'), tasks: almostDone, color: '#10b981', percent: '75%+' },
  ];

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    const destGroup = destination.droppableId;
    const destGroupTasks = progressGroups.find(g => g.id === destGroup)?.tasks || [];
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
        {progressGroups.map((group) => {
          const isCollapsed = collapsedViewSections.has(group.id);
          const orderedTasks = applyTaskOrder(group.tasks, group.id);
          return (
            <div key={group.id} className="bg-muted/30 rounded-xl border border-border/30 overflow-hidden">
              <ViewModeSectionHeader
                label={group.label}
                taskCount={group.tasks.length}
                color={group.color}
                icon={<TrendingUp className="h-4 w-4" />}
                sectionId={group.id}
                isCollapsed={isCollapsed}
                onToggle={toggleViewSectionCollapse}
                extra={<span className="text-xs text-muted-foreground">{group.percent}</span>}
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
