import { TodoItem } from '@/types/note';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { applyTaskOrder, updateSectionOrder } from '@/utils/taskOrderStorage';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ViewModeSectionHeader } from './ViewModeSectionHeader';
import {
  getUserTimeZone,
  isSameZonedDay,
  startOfZonedDay,
  zonedDayKey,
  zonedDayLabel,
} from '@/utils/zonedDates';

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
  /** Open TaskInputSheet prefilled with the given day. */
  onAddForDate?: (date: Date) => void;
}

/**
 * "Next 7 Days" style timeline.
 * Row 1 = Today, Row 2 = Tomorrow, Rows 3-7 = the next weekdays by name.
 * Each row shows a task count when non-empty and a + button that opens the
 * Task Input Sheet prefilled with that day's due date.
 */
export const TimelineView = ({
  uncompletedItems,
  collapsedViewSections,
  toggleViewSectionCollapse,
  renderTaskItem,
  renderSubtasksInline,
  renderCompletedSection,
  onDragEnd,
  setOrderVersion,
  onAddForDate,
}: TimelineViewProps) => {
  const { t } = useTranslation();
  const today = startOfDay(new Date());

  const dayGroups = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(today, i);
    const id = `timeline-day-${format(date, 'yyyy-MM-dd')}`;
    const label =
      i === 0 ? t('grouping.today', 'Today')
      : i === 1 ? t('grouping.tomorrow', 'Tomorrow')
      : format(date, 'EEEE');
    const tasks = uncompletedItems.filter(item =>
      item.dueDate && isSameDay(new Date(item.dueDate), date)
    );
    const color =
      i === 0 ? '#3b82f6'
      : i === 1 ? '#f59e0b'
      : '#10b981';
    return { id, label, date, tasks, color };
  });

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    onDragEnd(draggableId, destination.droppableId, destination.index, source.droppableId);
    const destGroupTasks = dayGroups.find(g => g.id === destination.droppableId)?.tasks || [];
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
      <div className="divide-y divide-border/40">
        {dayGroups.map((group) => {
          const isCollapsed = collapsedViewSections.has(group.id);
          const orderedTasks = applyTaskOrder(group.tasks, group.id);
          const hasTasks = group.tasks.length > 0;
          return (
            <div key={group.id} className="group">
              <div className="flex items-center gap-2 px-2">
                <button
                  onClick={() => toggleViewSectionCollapse(group.id)}
                  className="flex-1 flex items-center py-4 text-left"
                >
                  <span className="text-lg font-bold tracking-tight">{group.label}</span>
                </button>
                {hasTasks ? (
                  <button
                    onClick={() => toggleViewSectionCollapse(group.id)}
                    className="h-8 min-w-8 px-2 rounded-full border-2 border-primary text-primary text-sm font-semibold flex items-center justify-center"
                    aria-label={`${group.tasks.length} tasks`}
                  >
                    {group.tasks.length}
                  </button>
                ) : null}
                <button
                  onClick={() => {
                    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
                    onAddForDate?.(group.date);
                  }}
                  className="h-9 w-9 flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-95 transition-transform"
                  aria-label={`Add task on ${group.label}`}
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>
              {!isCollapsed && hasTasks && (
                <Droppable droppableId={group.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={cn('pb-2 space-y-1', snapshot.isDraggingOver && 'bg-primary/5')}
                      style={{ borderLeft: `3px solid ${group.color}` }}
                    >
                      {orderedTasks.map((item, index) => (
                        <Draggable key={item.id} draggableId={item.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={cn(
                                'bg-card',
                                snapshot.isDragging && 'shadow-lg ring-2 ring-primary rounded-lg',
                              )}
                            >
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
              )}
            </div>
          );
        })}
        {renderCompletedSection()}
      </div>
    </DragDropContext>
  );
};
