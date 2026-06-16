import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TodoItem } from '@/types/note';
import { useGlobalTags } from '@/hooks/useGlobalTags';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronDown, ChevronRight, Repeat, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ResolvedTaskImage } from '@/components/ResolvedTaskImage';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface SubtaskWithNestedProps {
  subtask: TodoItem;
  parentId: string;
  onUpdateSubtask?: (parentId: string, subtaskId: string, updates: Partial<TodoItem>) => void;
  hasNestedSubtasks: boolean;
  getPriorityColor: (id: string) => string;
}

const SubtaskWithNested = ({ subtask, parentId, onUpdateSubtask, hasNestedSubtasks, getPriorityColor }: SubtaskWithNestedProps) => {
  const [isNestedOpen, setIsNestedOpen] = useState(false);
  const { tags: globalTags } = useGlobalTags();

  return (
    <Collapsible open={isNestedOpen} onOpenChange={setIsNestedOpen}>
      <div
        className="flex items-center gap-3 py-2 px-2 border-l-4 hover:bg-muted/30 transition-colors"
        style={{ borderLeftColor: getPriorityColor(subtask.priority || 'none') }}
      >
        <Checkbox
          checked={subtask.completed}
          onCheckedChange={async (checked) => {
            onUpdateSubtask?.(parentId, subtask.id, { completed: !!checked });
            if (checked && !subtask.completed) {
              try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {}
            }
          }}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "h-5 w-5 transition-all rounded-full border-2",
            subtask.completed && "rounded-sm border-0 bg-muted-foreground/30 data-[state=checked]:bg-muted-foreground/30 data-[state=checked]:text-white"
          )}
          style={{ borderColor: subtask.completed ? undefined : getPriorityColor(subtask.priority || 'none') }}
        />
        <div className="flex-1 min-w-0">
          <p className={cn("text-sm font-medium truncate", subtask.completed && "text-muted-foreground line-through")}>
            {subtask.text}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {subtask.dueDate && (
              <span className="text-xs text-muted-foreground">
                {new Date(subtask.dueDate).toLocaleDateString()}
              </span>
            )}
            {subtask.tagIds && subtask.tagIds.length > 0 && (
              <div className="flex items-center gap-1">
                {subtask.tagIds.slice(0, 2).map((tagId) => {
                  const tag = globalTags.find(t => t.id === tagId);
                  if (!tag) return null;
                  return (
                    <span
                      key={tagId}
                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded-full text-white"
                      style={{ backgroundColor: `hsl(${tag.color})` }}
                    >
                      <Tag className="h-2.5 w-2.5" />
                      {tag.name}
                    </span>
                  );
                })}
              </div>
            )}
            {subtask.repeatType && subtask.repeatType !== 'none' && (
              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-accent-purple/20 text-accent-purple">
                <Repeat className="h-2.5 w-2.5" />
              </span>
            )}
          </div>
        </div>
        {subtask.imageUrl && (
          <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-border flex-shrink-0">
            <ResolvedTaskImage srcRef={subtask.imageUrl} alt="Subtask attachment" className="w-full h-full object-cover" />
          </div>
        )}
        {hasNestedSubtasks && (
          <CollapsibleTrigger asChild>
            <button
              onClick={(e) => { e.stopPropagation(); setIsNestedOpen(!isNestedOpen); }}
              className="p-1 rounded hover:bg-muted transition-colors flex-shrink-0"
            >
              {isNestedOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
          </CollapsibleTrigger>
        )}
      </div>

      {hasNestedSubtasks && (
        <CollapsibleContent>
          <div className="ml-6 space-y-1 pt-1 border-l-2 border-muted-foreground/20">
            {subtask.subtasks!.map((nested) => (
              <div
                key={nested.id}
                className="flex items-center gap-2 py-1.5 px-2 hover:bg-muted/20 transition-colors border-l-2"
                style={{ borderLeftColor: getPriorityColor(nested.priority || 'none') }}
              >
                <Checkbox
                  checked={nested.completed}
                  className={cn(
                    "h-4 w-4 transition-all rounded-full border-2",
                    nested.completed && "rounded-sm border-0 bg-muted-foreground/30"
                  )}
                  style={{ borderColor: nested.completed ? undefined : getPriorityColor(nested.priority || 'none') }}
                  disabled
                />
                <span className={cn("text-xs flex-1 truncate", nested.completed && "text-muted-foreground line-through")}>
                  {nested.text}
                </span>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
};

interface TaskSubtaskListProps {
  subtasks: TodoItem[];
  parentId: string;
  onUpdateSubtask?: (parentId: string, subtaskId: string, updates: Partial<TodoItem>) => void;
  getPriorityColor: (id: string) => string;
}

export const TaskSubtaskList = ({ subtasks, parentId, onUpdateSubtask, getPriorityColor }: TaskSubtaskListProps) => {
  const { t } = useTranslation();

  return (
    <div className="ml-4 space-y-1 pt-1">
      {subtasks.map((subtask) => (
        <SubtaskWithNested
          key={subtask.id}
          subtask={subtask}
          parentId={parentId}
          onUpdateSubtask={onUpdateSubtask}
          hasNestedSubtasks={!!(subtask.subtasks && subtask.subtasks.length > 0)}
          getPriorityColor={getPriorityColor}
        />
      ))}
      <p className="text-xs text-muted-foreground px-2 py-1">
        {subtasks.filter(st => st.completed).length}/{subtasks.length} {t('tasks.completed', 'completed')}
      </p>
    </div>
  );
};
