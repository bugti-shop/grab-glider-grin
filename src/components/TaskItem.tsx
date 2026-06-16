import { useState, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { TodoItem } from '@/types/note';
import { useGlobalTags } from '@/hooks/useGlobalTags';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronDown, ChevronRight, Repeat, Tag, Link } from 'lucide-react';
import { cn } from '@/lib/utils';
import { triggerTripleHeavyHaptic } from '@/utils/haptics';
import { playCompletionSound } from '@/utils/taskSounds';
import { recordNudgeCompletion } from '@/utils/smartNudges';
import { getEncouragement } from '@/utils/encouragements';
import { canCompleteTask } from './TaskDependencySheet';
import { getRepeatLabel } from '@/utils/recurringTasks';
import { ResolvedTaskImage } from './ResolvedTaskImage';
import { TaskStatusBadge } from './TaskStatusBadge';
import { usePriorities } from '@/hooks/usePriorities';
import { TaskSwipeActions } from './task/TaskSwipeActions';
import { TaskVoicePlayer } from './task/TaskVoicePlayer';
import { TaskCompletionCircle } from './task/TaskCompletionCircle';
import { TaskSubtaskList } from './task/TaskSubtaskList';
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";

interface TaskItemProps {
  item: TodoItem;
  level?: number;
  onUpdate: (itemId: string, updates: Partial<TodoItem>) => void;
  onDelete: (itemId: string) => void;
  onTaskClick: (item: TodoItem) => void;
  onImageClick: (imageUrl: string) => void;
  isSelected?: boolean;
  isSelectionMode?: boolean;
  onSelect?: (itemId: string) => void;
  expandedTasks?: Set<string>;
  onToggleSubtasks?: (taskId: string) => void;
  onUpdateSubtask?: (parentId: string, subtaskId: string, updates: Partial<TodoItem>) => void;
  hideDetails?: boolean;
  hidePriorityBorder?: boolean;
  showStatusBadge?: boolean;
  allTasks?: TodoItem[];
  onMoveTask?: (taskId: string) => void;
  onSetDate?: (taskId: string) => void;
  onTogglePin?: (taskId: string) => void;
}

export const TaskItem = memo(({
  item,
  level = 0,
  onUpdate,
  onDelete,
  onTaskClick,
  onImageClick,
  isSelected = false,
  isSelectionMode = false,
  onSelect,
  expandedTasks,
  onToggleSubtasks,
  onUpdateSubtask,
  hideDetails = false,
  hidePriorityBorder = false,
  showStatusBadge = true,
  allTasks = [],
  onMoveTask,
  onSetDate,
  onTogglePin,
}: TaskItemProps) => {
  const { t } = useTranslation();
  const { getPriorityColor } = usePriorities();
  const { tags: globalTags } = useGlobalTags();
  const [localIsOpen, setLocalIsOpen] = useState(false);
  const isOpen = expandedTasks ? expandedTasks.has(item.id) : localIsOpen;
  const setIsOpen = (open: boolean) => {
    if (onToggleSubtasks) {
      onToggleSubtasks(item.id);
    } else {
      setLocalIsOpen(open);
    }
  };

  const hasSubtasks = item.subtasks && item.subtasks.length > 0;
  const indentPx = level * 16;
  const { canComplete, blockedBy } = canCompleteTask(item, allTasks);
  const hasDependencies = item.dependsOn && item.dependsOn.length > 0;
  const isBlocked = hasDependencies && !canComplete;

  const handleComplete = () => {
    triggerTripleHeavyHaptic();
    playCompletionSound();
    getEncouragement(); // fires encouragement + milestone events
    recordNudgeCompletion().catch(() => {});
    onUpdate(item.id, { completed: true });
  };

  return (
    <div className="space-y-1" style={{ paddingLeft: indentPx > 0 ? `${indentPx}px` : undefined }}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <TaskSwipeActions
          isPinned={item.isPinned}
          isCompleted={item.completed}
          isSelectionMode={isSelectionMode}
          onComplete={handleComplete}
          onUncomplete={() => onUpdate(item.id, { completed: false })}
          onDelete={() => onDelete(item.id)}
          onMoveTask={onMoveTask ? () => onMoveTask(item.id) : undefined}
          onSetDate={onSetDate ? () => onSetDate(item.id) : undefined}
          onTogglePin={onTogglePin ? () => onTogglePin(item.id) : undefined}
          onTap={() => onTaskClick(item)}
        >
          <div
            className={cn(
              "flex items-start gap-3 py-2.5 px-2 cursor-pointer select-none bg-background",
              !hidePriorityBorder && "border-l-4",
              isSelected && "bg-primary/5",
              level > 0 && "mr-2",
            )}
            style={{
              ...(hidePriorityBorder ? {} : { borderLeftColor: getPriorityColor(item.priority || 'none') }),
              WebkitUserSelect: 'none',
              userSelect: 'none',
            }}
            onClick={() => !isSelectionMode && onTaskClick(item)}
          >
            {isSelectionMode && (
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onSelect?.(item.id)}
                onClick={(e) => e.stopPropagation()}
                className="h-5 w-5 flex-shrink-0"
              />
            )}

            <TaskCompletionCircle
              completed={item.completed}
              priorityColor={getPriorityColor(item.priority || 'none')}
              isBlocked={!!isBlocked}
              blockedByNames={blockedBy.map(task => task.text)}
              onComplete={handleComplete}
              onUncomplete={() => onUpdate(item.id, { completed: false })}
            />

            <div className="flex-1 min-w-0 overflow-hidden">
              {item.voiceRecording ? (
                <TaskVoicePlayer
                  audioUrl={item.voiceRecording.audioUrl}
                  duration={item.voiceRecording.duration}
                />
              ) : (
                <div className="flex items-center gap-2">
                  <p className={cn("text-sm font-medium truncate transition-all duration-300", item.completed && "text-muted-foreground line-through")}>{item.text}</p>
                </div>
              )}

              {/* Tags */}
              {!hideDetails && item.tagIds && item.tagIds.length > 0 && !item.voiceRecording && (
                <div className="flex items-center gap-1 mt-1 overflow-hidden">
                  {item.tagIds.slice(0, 3).map((tagId) => {
                    const tag = globalTags.find(t => t.id === tagId);
                    if (!tag) return null;
                    return (
                      <span
                        key={tagId}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded-full truncate max-w-[60px] text-white"
                        style={{ backgroundColor: `hsl(${tag.color})` }}
                      >
                        {tag.icon && <span className="flex-shrink-0">{tag.icon}</span>}
                        <Tag className="h-2.5 w-2.5 flex-shrink-0" />
                        <span className="truncate">{tag.name}</span>
                      </span>
                    );
                  })}
                  {item.tagIds.length > 3 && (
                    <span className="text-[10px] text-muted-foreground">+{item.tagIds.length - 3}</span>
                  )}
                </div>
              )}

              {/* Date */}
              {!hideDetails && item.dueDate && !item.voiceRecording && (
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(item.dueDate).toLocaleDateString()}
                </p>
              )}

              {/* Status Badge */}
              {!hideDetails && showStatusBadge && item.status && item.status !== 'not_started' && !item.voiceRecording && (
                <div className="mt-1">
                  <TaskStatusBadge status={item.status} size="sm" />
                </div>
              )}

              {/* Indicators */}
              {((item.repeatType && item.repeatType !== 'none') || hasDependencies || (hasSubtasks && !isOpen)) && (
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {item.repeatType && item.repeatType !== 'none' && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-accent-purple/20 text-accent-purple">
                      <Repeat className="h-2.5 w-2.5" />
                      {getRepeatLabel(item.repeatType, item.repeatDays, item.advancedRepeat)}
                    </span>
                  )}
                  {hasDependencies && (
                    <span className={cn(
                      "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full",
                      isBlocked ? "bg-warning/20 text-warning" : "bg-success/20 text-success"
                    )}>
                      <Link className="h-2.5 w-2.5" />
                      {isBlocked ? `${blockedBy.length} ${t('tasks.blocking', 'blocking')}` : t('tasks.ready', 'Ready')}
                    </span>
                  )}
                  {hasSubtasks && !isOpen && (
                    <p className="text-xs text-muted-foreground">{item.subtasks!.filter(st => st.completed).length}/{item.subtasks!.length} {t('tasks.subtasks', 'subtasks')}</p>
                  )}
                </div>
              )}
            </div>

            {item.imageUrl && (
              <div
                className="w-14 h-14 rounded-full overflow-hidden border-2 border-border flex-shrink-0 ml-1 cursor-pointer hover:border-primary transition-colors"
                onClick={(e) => { e.stopPropagation(); onImageClick(item.imageUrl!); }}
              >
                <ResolvedTaskImage srcRef={item.imageUrl} alt="Task attachment" className="w-full h-full object-cover" />
              </div>
            )}

            {hasSubtasks && (
              <button
                onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
                className="p-1 rounded hover:bg-muted transition-colors flex-shrink-0"
              >
                {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </button>
            )}
          </div>
        </TaskSwipeActions>

        <CollapsibleContent>
          {hasSubtasks && (
            <TaskSubtaskList
              subtasks={item.subtasks!}
              parentId={item.id}
              onUpdateSubtask={onUpdateSubtask}
              getPriorityColor={getPriorityColor}
            />
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
});
