/**
 * TaskSubtasksInline — Renders inline subtasks for Kanban/Progress/Timeline views.
 * Extracted from Today.tsx renderSubtasksInline function.
 */
import { TodoItem } from '@/types/note';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';

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

  return (
    <div className="border-t border-border/30 bg-muted/20 p-2 space-y-1">
      {item.subtasks.map((subtask) => (
        <div key={subtask.id} className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/40 transition-colors" style={{ borderLeft: `3px solid ${getPriorityColor(subtask.priority || 'none')}` }}>
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
      ))}
    </div>
  );
};
