import { TodoItem } from '@/types/note';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { AlertCircle, Sun, Calendar as CalendarIcon2, Clock, CalendarX, CheckCircle2 } from 'lucide-react';
import { isToday, isTomorrow, isThisWeek, isBefore, startOfDay } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { applyTaskOrder, updateSectionOrder } from '@/utils/taskOrderStorage';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ViewModeSectionHeader } from './ViewModeSectionHeader';

interface TimelineViewProps {
  uncompletedItems: TodoItem[];
  completedItems: TodoItem[];
  showCompleted: boolean;
  collapsedViewSections: Set<string>;
  toggleViewSectionCollapse: (id: string) => void;
  renderTaskItem: (item: TodoItem) => React.ReactNode;
  renderSubtasksInline: (item: TodoItem) => React.ReactNode;
  renderCompletedSection: () => React.ReactNode;
  onDragEnd: (taskId: string, destGroup: string, destIndex: number, sourceGroup: string) => void;
  setOrderVersion: React.Dispatch<React.SetStateAction<number>>;
}

export const TimelineView = ({
  uncompletedItems,
  collapsedViewSections,
  toggleViewSectionCollapse,
  renderTaskItem,
  renderSubtasksInline,
  renderCompletedSection,
  onDragEnd,
  setOrderVersion,
}: TimelineViewProps) => {
  const { t } = useTranslation();
  const today = startOfDay(new Date());

  const timelineGroups = [
    { id: 'timeline-overdue', label: t('grouping.overdue'), tasks: uncompletedItems.filter(item => item.dueDate && isBefore(new Date(item.dueDate), today)), color: '#ef4444', icon: <AlertCircle className="h-4 w-4" /> },
    { id: 'timeline-today', label: t('grouping.today'), tasks: uncompletedItems.filter(item => item.dueDate && isToday(new Date(item.dueDate))), color: '#3b82f6', icon: <Sun className="h-4 w-4" /> },
    { id: 'timeline-tomorrow', label: t('grouping.tomorrow'), tasks: uncompletedItems.filter(item => item.dueDate && isTomorrow(new Date(item.dueDate))), color: '#f59e0b', icon: <CalendarIcon2 className="h-4 w-4" /> },
    { id: 'timeline-thisweek', label: t('grouping.thisWeek'), tasks: uncompletedItems.filter(item => item.dueDate && isThisWeek(new Date(item.dueDate)) && !isToday(new Date(item.dueDate)) && !isTomorrow(new Date(item.dueDate))), color: '#10b981', icon: <CalendarIcon2 className="h-4 w-4" /> },
    { id: 'timeline-later', label: t('grouping.later'), tasks: uncompletedItems.filter(item => item.dueDate && !isBefore(new Date(item.dueDate), today) && !isThisWeek(new Date(item.dueDate))), color: '#8b5cf6', icon: <Clock className="h-4 w-4" /> },
    { id: 'timeline-nodate', label: t('grouping.noDate'), tasks: uncompletedItems.filter(item => !item.dueDate), color: '#6b7280', icon: <CalendarX className="h-4 w-4" /> },
  ];

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    onDragEnd(draggableId, destination.droppableId, destination.index, source.droppableId);
    const destGroupTasks = timelineGroups.find(g => g.id === destination.droppableId)?.tasks || [];
    const ordered = applyTaskOrder(destGroupTasks, destination.droppableId);
    const ids = ordered.map(t => t.id);
    const idx = ids.indexOf(draggableId);
    if (idx !== -1) ids.splice(idx, 1);
    ids.splice(destination.index, 0, draggableId);
    updateSectionOrder(destination.droppableId, ids);
    setOrderVersion(v => v + 1);
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="space-y-6">
        {timelineGroups.map((group) => {
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
                            <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} className={cn("bg-card rounded-lg border border-border/50", snapshot.isDragging && "shadow-lg ring-2 ring-primary")}>
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
