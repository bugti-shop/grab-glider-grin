/**
 * TaskFlatItem — Renders a single task in the flat layout style.
 * Extracted from Today.tsx renderTaskItem function.
 */
import { useState, useRef, memo } from 'react';
import { TodoItem } from '@/types/note';
import { useTranslation } from 'react-i18next';
import { Play, Pause, Repeat, Check, Trash2 as TrashIcon, Plus as PlusIcon, ArrowUpCircle, Pin, FolderIcon, ChevronRight, ChevronDown, Tag, Calendar as CalendarIcon2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ResolvedTaskImage } from '@/components/ResolvedTaskImage';
import { WaveformProgressBar } from '@/components/WaveformProgressBar';
import { TASK_CIRCLE, TASK_CHECK_ICON } from '@/utils/taskItemStyles';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

interface TaskFlatItemProps {
  item: TodoItem;
  compactMode: boolean;
  isSelectionMode: boolean;
  selectedTaskIds: Set<string>;
  pendingCompleteId: string | null;
  expandedTasks: Set<string>;
  hideDetailsOptions: { hideDateTime: boolean; hideStatus: boolean; hideSubtasks: boolean };
  showStatusBadge: boolean;
  allGlobalTags: { id: string; name: string; color: string; icon?: string }[];
  swipeState: { id: string; x: number; isSwiping: boolean; snapped?: 'left' | 'right' } | null;
  voiceState: {
    playingVoiceId: string | null;
    voiceProgress: number;
    voiceCurrentTime: number;
    voiceDuration: Record<string, number>;
    voicePlaybackSpeed: number;
    resolvedVoiceUrls: Record<string, string>;
  };
  getPriorityColor: (priority: string) => string;
  onSelectTask: (taskId: string) => void;
  onToggleComplete: (item: TodoItem) => void;
  onUncomplete: (item: TodoItem) => void;
  onTaskClick: (item: TodoItem) => void;
  onImageClick: (url: string) => void;
  onToggleSubtasks: (taskId: string) => void;
  onSwipeAction: (action: () => void) => void;
  onSwipeComplete: (item: TodoItem) => void;
  onSwipePin: (item: TodoItem) => void;
  onSwipeMove: (itemId: string) => void;
  onSwipeDelete: (itemId: string) => void;
  onSwipeDate: (itemId: string) => void;
  onFlatTouchStart: (itemId: string, e: React.TouchEvent) => void;
  onFlatTouchMove: (itemId: string, e: React.TouchEvent) => void;
  onFlatTouchEnd: (item: TodoItem) => void;
  onFlatVoicePlay: (item: TodoItem, e: React.MouseEvent) => void;
  onCycleVoiceSpeed: (e: React.MouseEvent) => void;
  onVoiceSeek: (e: React.MouseEvent<HTMLDivElement>, item: TodoItem) => void;
  setPendingCompleteId: (id: string | null) => void;
  pendingCompleteTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
  updateItem: (id: string, updates: Partial<TodoItem>) => void;
  requireFeature: (feature: string) => boolean;
}

const SWIPE_ACTION_WIDTH = 60;

export const TaskFlatItem = memo(({
  item, compactMode, isSelectionMode, selectedTaskIds, pendingCompleteId,
  expandedTasks, hideDetailsOptions, showStatusBadge, allGlobalTags,
  swipeState: currentSwipeState, voiceState, getPriorityColor,
  onSelectTask, onTaskClick, onImageClick, onToggleSubtasks,
  onSwipeAction, onSwipeMove, onSwipeDelete, onSwipeDate,
  onFlatTouchStart, onFlatTouchMove, onFlatTouchEnd,
  onFlatVoicePlay, onCycleVoiceSpeed, onVoiceSeek,
  setPendingCompleteId, pendingCompleteTimer, updateItem, requireFeature,
}: TaskFlatItemProps) => {
  const { t } = useTranslation();
  const hasSubtasks = item.subtasks && item.subtasks.length > 0;
  const currentSwipe = currentSwipeState?.id === item.id ? currentSwipeState : null;
  const isExpanded = expandedTasks.has(item.id);
  const completedSubtasks = item.subtasks?.filter(st => st.completed).length || 0;
  const totalSubtasks = item.subtasks?.length || 0;
  const { playingVoiceId, voiceProgress, voiceCurrentTime, voiceDuration, voicePlaybackSpeed, resolvedVoiceUrls } = voiceState;

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative perf-contain-item">
      <div className="relative overflow-hidden">
        {/* Swipe action backgrounds */}
        <div className="absolute inset-0 flex">
          <div className="flex items-center justify-start" style={{ opacity: (currentSwipe?.x || 0) > 0 ? 1 : 0 }}>
            <button
              onClick={() => onSwipeAction(() => {
                if (!item.completed) {
                  setPendingCompleteId(item.id);
                  Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
                  pendingCompleteTimer.current = setTimeout(() => {
                    setPendingCompleteId(null);
                    pendingCompleteTimer.current = null;
                    updateItem(item.id, { completed: true });
                  }, 400);
                } else {
                  updateItem(item.id, { completed: false });
                }
              })}
              className="flex flex-col items-center justify-center w-[60px] h-full bg-success text-success-foreground"
            >
              <Check className="h-5 w-5" />
              <span className="text-[10px] font-medium mt-1">{t('swipe.done', 'Done')}</span>
            </button>
            <button
              onClick={() => onSwipeAction(() => { if (!requireFeature('pin_feature')) return; updateItem(item.id, { isPinned: !item.isPinned }); })}
              className="flex flex-col items-center justify-center w-[60px] h-full bg-warning text-warning-foreground"
            >
              <ArrowUpCircle className={cn("h-5 w-5", item.isPinned && "fill-current")} />
              <span className="text-[10px] font-medium mt-1">{t('swipe.pin', 'Pin')}</span>
            </button>
          </div>
          <div className="absolute right-0 inset-y-0 flex items-center justify-end" style={{ opacity: (currentSwipe?.x || 0) < 0 ? 1 : 0, width: SWIPE_ACTION_WIDTH * 3 }}>
            <button onClick={() => onSwipeAction(() => onSwipeMove(item.id))} className="flex flex-col items-center justify-center w-[60px] h-full bg-info text-info-foreground">
              <FolderIcon className="h-5 w-5" />
              <span className="text-[10px] font-medium mt-1">{t('swipe.move', 'Move')}</span>
            </button>
            <button onClick={() => onSwipeAction(() => onSwipeDelete(item.id))} className="flex flex-col items-center justify-center w-[60px] h-full bg-destructive text-destructive-foreground">
              <TrashIcon className="h-5 w-5" />
              <span className="text-[10px] font-medium mt-1">{t('swipe.delete', 'Delete')}</span>
            </button>
            <button onClick={() => onSwipeAction(() => onSwipeDate(item.id))} className="flex flex-col items-center justify-center w-[60px] h-full bg-warning text-warning-foreground">
              <CalendarIcon2 className="h-5 w-5" />
              <span className="text-[10px] font-medium mt-1">{t('swipe.date', 'Date')}</span>
            </button>
          </div>
        </div>

        {/* Main flat item */}
        <div
          className={cn(
            "flex items-start gap-3 border-b border-border/50 bg-background relative z-10",
            compactMode ? "py-1.5 px-1.5 gap-2" : "py-2.5 px-2"
          )}
          style={{
            transform: `translateX(${currentSwipe?.x || 0}px)`,
            transition: currentSwipe?.isSwiping ? 'none' : 'transform 0.3s ease-out'
          }}
          onTouchStart={(e) => onFlatTouchStart(item.id, e)}
          onTouchMove={(e) => onFlatTouchMove(item.id, e)}
          onTouchEnd={() => onFlatTouchEnd(item)}
        >
          {isSelectionMode && (
            <Checkbox checked={selectedTaskIds.has(item.id)} onCheckedChange={() => onSelectTask(item.id)} className={cn(compactMode ? "h-4 w-4" : "h-5 w-5", "mt-0.5")} />
          )}

          <button
            disabled={false}
            onTouchStart={(e) => e.stopPropagation()}
            onTouchMove={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              const isPending = pendingCompleteId === item.id;
              if (item.completed || isPending) {
                if (pendingCompleteTimer.current) {
                  clearTimeout(pendingCompleteTimer.current);
                  pendingCompleteTimer.current = null;
                }
                setPendingCompleteId(null);
                if (item.completed) updateItem(item.id, { completed: false });
                return;
              }
              setPendingCompleteId(item.id);
              Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
              setTimeout(() => { Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {}); }, 100);
              pendingCompleteTimer.current = setTimeout(() => {
                setPendingCompleteId(null);
                pendingCompleteTimer.current = null;
                updateItem(item.id, { completed: true });
              }, 400);
            }}
            className={cn(
              TASK_CIRCLE.base, TASK_CIRCLE.marginTop,
              compactMode ? TASK_CIRCLE.sizeCompact : TASK_CIRCLE.size,
              item.completed && TASK_CIRCLE.completed,
              pendingCompleteId === item.id && TASK_CIRCLE.pending,
            )}
            style={{
              borderColor: (item.completed || pendingCompleteId === item.id) ? undefined : getPriorityColor(item.priority || 'none'),
              backgroundColor: pendingCompleteId === item.id ? getPriorityColor(item.priority || 'none') : undefined,
            }}
          >
            {(item.completed || pendingCompleteId === item.id) && (
              <Check
                className={cn(TASK_CHECK_ICON.base, compactMode ? TASK_CHECK_ICON.sizeCompact : TASK_CHECK_ICON.size, pendingCompleteId === item.id && TASK_CHECK_ICON.pendingAnimation)}
                style={{ color: pendingCompleteId === item.id ? TASK_CHECK_ICON.pendingColor : TASK_CHECK_ICON.completedColor }}
                strokeWidth={TASK_CHECK_ICON.strokeWidth}
              />
            )}
          </button>
          <div className="flex-1 min-w-0" onClick={() => !currentSwipe?.isSwiping && onTaskClick(item)}>
            {item.voiceRecording ? (
              <div className="flex items-center gap-2">
                <button onClick={(e) => onFlatVoicePlay(item, e)} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 hover:bg-primary/20 transition-colors min-w-0 flex-1">
                  {playingVoiceId === item.id ? <Pause className="h-4 w-4 text-primary flex-shrink-0" /> : <Play className="h-4 w-4 text-primary flex-shrink-0" />}
                  <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                    {resolvedVoiceUrls[item.id] ? (
                      <WaveformProgressBar
                        audioUrl={resolvedVoiceUrls[item.id]}
                        progress={playingVoiceId === item.id ? voiceProgress : 0}
                        duration={voiceDuration[item.id] || item.voiceRecording.duration}
                        isPlaying={playingVoiceId === item.id}
                        onSeek={() => {}}
                        height={12}
                      />
                    ) : (
                      <div className="relative h-1.5 bg-primary/20 rounded-full overflow-hidden cursor-pointer" onClick={(e) => onVoiceSeek(e, item)}>
                        <div className="absolute h-full bg-primary rounded-full transition-all duration-100" style={{ width: playingVoiceId === item.id ? `${voiceProgress}%` : '0%' }} />
                      </div>
                    )}
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-primary font-medium">{playingVoiceId === item.id ? formatDuration(Math.round(voiceCurrentTime)) : '0:00'}</span>
                      <span className="text-primary/70">{formatDuration(voiceDuration[item.id] || item.voiceRecording.duration)}</span>
                    </div>
                  </div>
                </button>
                <button onClick={onCycleVoiceSpeed} className="px-2 py-1 text-xs font-semibold rounded-md bg-muted hover:bg-muted/80 transition-colors min-w-[40px]">{voicePlaybackSpeed}x</button>
                {item.repeatType && item.repeatType !== 'none' && <Repeat className="h-3 w-3 text-accent-purple flex-shrink-0" />}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {item.isPinned && <Pin className={cn(compactMode ? "h-3 w-3" : "h-3.5 w-3.5", "text-warning fill-warning flex-shrink-0")} />}
                <span className={cn(compactMode ? "text-xs" : "text-sm", "transition-all duration-300", (item.completed || pendingCompleteId === item.id) && "text-muted-foreground line-through")}>{item.text}</span>
                {item.repeatType && item.repeatType !== 'none' && <Repeat className={cn(compactMode ? "h-2.5 w-2.5" : "h-3 w-3", "text-accent-purple flex-shrink-0")} />}
              </div>
            )}
            {!compactMode && !hideDetailsOptions.hideDateTime && item.tagIds && item.tagIds.length > 0 && (
              <div className="flex items-center gap-1 mt-1 flex-wrap">
                {item.tagIds.slice(0, 4).map((tagId) => {
                  const tag = allGlobalTags.find(t => t.id === tagId);
                  if (!tag) return null;
                  return (
                    <span key={tagId} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded-full text-white" style={{ backgroundColor: `hsl(${tag.color})` }}>
                      {tag.icon && <span>{tag.icon}</span>}
                      <Tag className="h-2.5 w-2.5" />
                      {tag.name}
                    </span>
                  );
                })}
                {item.tagIds.length > 4 && <span className="text-[10px] text-muted-foreground">+{item.tagIds.length - 4}</span>}
              </div>
            )}
            {!hideDetailsOptions.hideDateTime && item.dueDate && (
              <p className={cn("text-muted-foreground", compactMode ? "text-[10px] mt-0.5" : "text-xs mt-1")}>{new Date(item.dueDate).toLocaleDateString()}</p>
            )}
            {!hideDetailsOptions.hideSubtasks && hasSubtasks && !isExpanded && (
              <p className={cn("text-muted-foreground", compactMode ? "text-[10px] mt-0.5" : "text-xs mt-1")}>{completedSubtasks}/{totalSubtasks} subtasks</p>
            )}
            {!compactMode && !hideDetailsOptions.hideStatus && showStatusBadge && !item.completed && item.status && (
              <Badge variant="outline" className={cn(
                "text-[10px] px-1.5 py-0 mt-1",
                item.status === 'not_started' && "border-muted-foreground text-muted-foreground bg-muted/30",
                item.status === 'in_progress' && "border-info text-info bg-info/10",
                item.status === 'almost_done' && "border-warning text-warning bg-warning/10"
              )}>
                {item.status === 'not_started' ? t('grouping.notStarted') : item.status === 'in_progress' ? t('grouping.inProgress') : t('grouping.almostDone')}
              </Badge>
            )}
          </div>
          {item.imageUrl && (
            <div className={cn("rounded-full overflow-hidden border-2 border-border flex-shrink-0 cursor-pointer hover:border-primary transition-colors", compactMode ? "w-7 h-7" : "w-10 h-10")} onClick={(e) => { e.stopPropagation(); onImageClick(item.imageUrl!); }}>
              <ResolvedTaskImage srcRef={item.imageUrl} alt="Task attachment" className="w-full h-full object-cover" />
            </div>
          )}
          {hasSubtasks && (
            <button onClick={(e) => { e.stopPropagation(); onToggleSubtasks(item.id); }} className={cn("rounded hover:bg-muted transition-colors flex-shrink-0", compactMode ? "p-0.5" : "p-1 mt-0.5")}>
              {isExpanded ? <ChevronDown className={cn(compactMode ? "h-3 w-3" : "h-4 w-4", "text-muted-foreground")} /> : <ChevronRight className={cn(compactMode ? "h-3 w-3" : "h-4 w-4", "text-muted-foreground")} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
TaskFlatItem.displayName = 'TaskFlatItem';
