/**
 * TaskSubtasksInline — Renders inline subtasks for Kanban/Progress/Timeline views.
 * Extracted from Today.tsx renderSubtasksInline function.
 */
import { TodoItem } from '@/types/note';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { GripVertical } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

interface TaskSubtasksInlineProps {
  item: TodoItem;
  expandedTasks: Set<string>;
  getPriorityColor: (priority: string) => string;
  updateItem: (id: string, updates: Partial<TodoItem>) => void;
  onSubtaskClick: (subtask: TodoItem, parentId: string) => void;
}

export const TaskSubtasksInline = ({ item, expandedTasks, getPriorityColor, updateItem, onSubtaskClick }: TaskSubtasksInlineProps) => {
  const isExpanded = expandedTasks.has(item.id);
  if (!isExpanded || !item.subtasks || item.subtasks.length === 0) return null;

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination || !item.subtasks) return;
    if (result.destination.index === result.source.index) return;
    const reordered = Array.from(item.subtasks);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    updateItem(item.id, { subtasks: reordered });
    try { Haptics.impact({ style: ImpactStyle.Light }); } catch {}
  };

  return (
    <div className="border-t border-border/30 bg-muted/20 p-2 space-y-1" onClick={(e) => e.stopPropagation()}>
      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId={`inline-subtasks-${item.id}`}>
          {(provided) => (
            <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1">
              {item.subtasks!.map((subtask, index) => (
                <Draggable key={subtask.id} draggableId={subtask.id} index={index}>
                  {(dragProvided, snapshot) => (
                    <div
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                      className={cn(
                        "flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/40 transition-colors",
                        snapshot.isDragging && "bg-muted/60 shadow-md"
                      )}
                      style={{ borderLeft: `3px solid ${getPriorityColor(subtask.priority || 'none')}`, ...dragProvided.draggableProps.style }}
                    >
                      <div
                        {...dragProvided.dragHandleProps}
                        onClick={(e) => e.stopPropagation()}
                        className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground/50 hover:text-muted-foreground flex-shrink-0"
                        aria-label="Drag subtask"
                      >
                        <GripVertical className="h-3.5 w-3.5" />
                      </div>
                      <Checkbox
                        checked={subtask.completed}
                        onCheckedChange={(checked) => {
                          const updatedSubtasks = item.subtasks?.map(st => st.id === subtask.id ? { ...st, completed: !!checked } : st);
                          updateItem(item.id, { subtasks: updatedSubtasks });
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className={cn("h-4 w-4 rounded-sm border-0", subtask.completed ? "bg-muted-foreground/30 data-[state=checked]:bg-muted-foreground/30 data-[state=checked]:text-white" : "border-2")}
                        style={{ borderColor: subtask.completed ? undefined : getPriorityColor(subtask.priority || 'none') }}
                      />
                      <span className={cn("text-xs flex-1", subtask.completed && "text-muted-foreground line-through")} onClick={() => onSubtaskClick(subtask, item.id)}>• {subtask.text}</span>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
};
