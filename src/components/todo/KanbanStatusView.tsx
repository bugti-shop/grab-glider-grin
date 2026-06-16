import { TodoItem, TaskStatus } from '@/types/note';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Circle, Loader2, Clock as ClockIcon, CheckCircle2, ChevronRight, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { applyTaskOrder, updateSectionOrder } from '@/utils/taskOrderStorage';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { toast } from 'sonner';

interface KanbanStatusViewProps {
  items: TodoItem[];
  uncompletedItems: TodoItem[];
  completedItems: TodoItem[];
  collapsedViewSections: Set<string>;
  toggleViewSectionCollapse: (id: string) => void;
  renderTaskItem: (item: TodoItem) => React.ReactNode;
  renderSubtasksInline: (item: TodoItem) => React.ReactNode;
  updateItem: (id: string, updates: Partial<TodoItem>) => void;
  setOrderVersion: React.Dispatch<React.SetStateAction<number>>;
}

export const KanbanStatusView = ({
  items,
  uncompletedItems,
  completedItems,
  collapsedViewSections,
  toggleViewSectionCollapse,
  renderTaskItem,
  renderSubtasksInline,
  updateItem,
  setOrderVersion,
}: KanbanStatusViewProps) => {
  const { t } = useTranslation();

  const statusGroups = [
    { id: 'not_started' as TaskStatus, label: t('grouping.notStarted'), color: '#6b7280', icon: <Circle className="h-3.5 w-3.5" />, tasks: uncompletedItems.filter(item => !item.status || item.status === 'not_started') },
    { id: 'in_progress' as TaskStatus, label: t('grouping.inProgress'), color: '#3b82f6', icon: <Loader2 className="h-3.5 w-3.5" />, tasks: uncompletedItems.filter(item => item.status === 'in_progress') },
    { id: 'almost_done' as TaskStatus, label: t('grouping.almostDone'), color: '#f59e0b', icon: <ClockIcon className="h-3.5 w-3.5" />, tasks: uncompletedItems.filter(item => item.status === 'almost_done') },
    { id: 'completed' as TaskStatus, label: t('grouping.completed'), color: '#10b981', icon: <CheckCircle2 className="h-3.5 w-3.5" />, tasks: completedItems },
  ];

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const { source, destination, draggableId } = result;
    const taskId = draggableId;
    const sourceStatus = source.droppableId.replace('status-', '') as TaskStatus;
    const destStatus = destination.droppableId.replace('status-', '') as TaskStatus;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    if (sourceStatus !== destStatus) {
      updateItem(taskId, { status: destStatus, completed: destStatus === 'completed', completedAt: destStatus === 'completed' ? new Date() : undefined });
      Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
      toast.success(`Task status updated to ${destStatus.replace('_', ' ')}`);
    }
    const destGroupId = destination.droppableId;
    const destTasks = items.filter(item => { const s = item.status || 'not_started'; return destGroupId === `status-${s}` || (destGroupId === 'status-completed' && item.completed); });
    const ordered = applyTaskOrder(destTasks, destGroupId);
    const ids = ordered.map(t => t.id);
    const idx = ids.indexOf(taskId);
    if (idx !== -1) ids.splice(idx, 1);
    ids.splice(destination.index, 0, taskId);
    updateSectionOrder(destGroupId, ids);
    setOrderVersion(v => v + 1);
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="overflow-x-auto pb-4 -mx-4 px-4">
        <div className="flex gap-4" style={{ minWidth: 'max-content' }}>
          {statusGroups.map((group) => {
            const statusSectionId = `status-${group.id}`;
            const isCollapsed = collapsedViewSections.has(statusSectionId);
            const orderedTasks = applyTaskOrder(group.tasks, statusSectionId);
            return (
              <div key={group.id} className="flex-shrink-0 w-72 bg-muted/30 rounded-xl border border-border/30 overflow-hidden">
                <button onClick={() => toggleViewSectionCollapse(statusSectionId)} className="w-full flex items-center gap-2 px-3 py-3 border-b border-border/30 hover:bg-muted/20 transition-colors" style={{ borderLeft: `4px solid ${group.color}` }}>
                  <span style={{ color: group.color }}>{group.icon}</span>
                  <span className="text-sm font-semibold flex-1 text-left">{group.label}</span>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{group.tasks.length}</span>
                  {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </button>
                {!isCollapsed && (
                  <Droppable droppableId={statusSectionId}>
                    {(provided, snapshot) => (
                      <div ref={provided.innerRef} {...provided.droppableProps} className={cn("min-h-[200px] max-h-[400px] overflow-y-auto p-2 space-y-2", snapshot.isDraggingOver && "bg-primary/5")}>
                        {orderedTasks.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">Drop tasks here</div> : orderedTasks.map((item, index) => (
                          <Draggable key={item.id} draggableId={item.id} index={index}>
                            {(provided, snapshot) => (
                              <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} className={cn("bg-card rounded-lg border border-border/50 shadow-sm overflow-hidden", snapshot.isDragging && "shadow-lg ring-2 ring-primary", group.id === 'completed' && "opacity-70")}>
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
        </div>
      </div>
    </DragDropContext>
  );
};
