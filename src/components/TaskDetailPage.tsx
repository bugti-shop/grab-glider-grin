import { useState, useRef, useEffect, useCallback } from 'react';
import { genId } from '@/utils/genId';
import { saveTaskMedia, makeTaskMediaRef, deleteTaskMedia, parseTaskMediaRef } from '@/utils/taskMediaStorage';
import { useTranslation } from 'react-i18next';
import { TodoItem, Priority, Folder, Note, RepeatType, ColoredTag, TimeTracking, TaskStatus, LocationReminder, TaskAttachment, EscalationTiming } from '@/types/note';
import { TaskComments } from '@/components/TaskComments';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { useHardwareBackButton } from '@/hooks/useHardwareBackButton';
import { usePriorities } from '@/hooks/usePriorities';
import { getSetting, setSetting } from '@/utils/settingsStorage';
import { logActivity } from '@/utils/activityLogger';
import { TaskStatusBadge, TASK_STATUS_OPTIONS, getStatusConfig } from './TaskStatusBadge';
import {
  FolderIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  MoreHorizontal,
  Share,
  MessageSquare,
  Target,
  ListChecks,
  FileEdit,
  Check,
  Flag,
  Copy,
  Pin,
  Trash2,
  Plus,
  Calendar as CalendarIcon,
  FileText,
  Tag,
  X,
  MapPin,
  Link,
  Clock,
  GripVertical,
  Circle,
  Hourglass,
  AlertTriangle,
  Paperclip,
  File,
  Download,
  Crown
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';

import { escalationTimingLabel } from '@/utils/deadlineEscalation';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { WaveformProgressBar } from './WaveformProgressBar';
import { Play, Pause } from 'lucide-react';
import { TaskDateTimePage, RepeatSettings } from './TaskDateTimePage';
import { TaskTimeTracker } from './TaskTimeTracker';
import { TaskDependencySheet, canCompleteTask } from './TaskDependencySheet';

import { ResolvedTaskImage } from './ResolvedTaskImage';
import { resolveTaskMediaUrl } from '@/utils/todoItemsStorage';
import { TaskInputSheet } from './TaskInputSheet';
import { SubtaskDetailSheet } from './SubtaskDetailSheet';
import { TaskCommentsSection } from './TaskCommentsSection';
import { TaskComment } from '@/types/note';
import { TaskReminderSheet, ExtraReminderValue } from './TaskReminderSheet';
import { Bell } from 'lucide-react';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { MentionDescriptionEditor, descriptionToDisplayHtml } from './richtext/MentionDescriptionEditor';
import { RICH_TEXT_EDITOR_STYLES } from './richtext/richTextStyles';
import { FocusMode } from './FocusMode';
import PdfViewer from './PdfViewer';
import { getPomodoroStats, formatPomodoroDuration } from '@/utils/pomodoroStorage';
import { Timer as TimerIcon } from 'lucide-react';
import { PremiumCrown } from './PremiumCrown';
import { ReminderCountdown } from './reminders/ReminderCountdown';

interface TaskDetailPageProps {
  isOpen: boolean;
  task: TodoItem | null;
  folders: Folder[];
  allTasks?: TodoItem[];
  onClose: () => void;
  onUpdate: (task: TodoItem) => void;
  onDelete: (taskId: string) => void;
  onDuplicate: (task: TodoItem) => void;
  onConvertToNote: (task: TodoItem) => void;
  onMoveToFolder: (taskId: string, folderId: string | null) => void;
}

const TAG_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', 
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'
];


export const TaskDetailPage = ({
  isOpen,
  task,
  folders,
  allTasks = [],
  onClose,
  onUpdate,
  onDelete,
  onDuplicate,
  onConvertToNote,
  onMoveToFolder
}: TaskDetailPageProps) => {
  const { t } = useTranslation();
  const { getPriorityColor: getPriorityHex, getPriorityName } = usePriorities();
  const { requireFeature, isPro, isRecurringSubscriber, requireCapacity, requireProFeature } = useSubscription();
  const [title, setTitle] = useState('');
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [showSubtaskInput, setShowSubtaskInput] = useState(false);
  const [isSubtaskInputSheetOpen, setIsSubtaskInputSheetOpen] = useState(false);
  const [showDateTimePage, setShowDateTimePage] = useState(false);
  const [showDependencySheet, setShowDependencySheet] = useState(false);
  const [showExtraReminderSheet, setShowExtraReminderSheet] = useState(false);
  const [showTagInput, setShowTagInput] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const [voiceProgress, setVoiceProgress] = useState(0);
  const [voiceCurrentTime, setVoiceCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [voicePlaybackSpeed, setVoicePlaybackSpeed] = useState(1);
  const [resolvedAudioUrl, setResolvedAudioUrl] = useState<string | null>(null);
  const VOICE_PLAYBACK_SPEEDS = [0.5, 1, 1.5, 2];
  const [reminderOffset, setReminderOffset] = useState<string>('');
  const [repeatSettings, setRepeatSettings] = useState<RepeatSettings | undefined>();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const subtaskInputRef = useRef<HTMLInputElement>(null);
  
  // Subtask detail sheet state
  const [selectedSubtask, setSelectedSubtask] = useState<TodoItem | null>(null);
  const [showSubtaskDetailSheet, setShowSubtaskDetailSheet] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewAttachment, setPreviewAttachment] = useState<{ url: string; name: string; type: string } | null>(null);
  const [showPomodoro, setShowPomodoro] = useState(false);
  const [showHistoryPage, setShowHistoryPage] = useState(false);
  const [pomodoroStats, setPomodoroStats] = useState(() => getPomodoroStats(task?.id));
  useEffect(() => {
    setPomodoroStats(getPomodoroStats(task?.id));
    const onSession = () => setPomodoroStats(getPomodoroStats(task?.id));
    window.addEventListener('pomodoro:session', onSession);
    return () => window.removeEventListener('pomodoro:session', onSession);
  }, [task?.id, showPomodoro]);
  const [descText, setDescText] = useState(task?.description || '');
  const [isEditingDesc, setIsEditingDesc] = useState(false);


  useEffect(() => {
    if (task) {
      setTitle(task.text);
      setDescText(task.description || '');
      // Resolve audio URL
      if (task.voiceRecording?.audioUrl) {
        resolveTaskMediaUrl(task.voiceRecording.audioUrl).then(url => {
          if (url) setResolvedAudioUrl(url);
        });
      } else {
        setResolvedAudioUrl(null);
      }
      
      // Initialize repeat settings from task's repeatType and advancedRepeat
      if (task.repeatType && task.repeatType !== 'none') {
        const frequencyMap: Record<string, RepeatSettings['frequency']> = {
          'hourly': 'hour',
          'daily': 'daily',
          'weekly': 'weekly',
          'weekdays': 'weekly',
          'weekends': 'weekly',
          'monthly': 'monthly',
          'yearly': 'yearly',
          'custom': 'weekly',
        };
        
        const frequency = task.advancedRepeat?.frequency 
          ? (frequencyMap[task.advancedRepeat.frequency] || 'daily')
          : (frequencyMap[task.repeatType] || 'daily');
        
        setRepeatSettings({
          frequency,
          interval: task.advancedRepeat?.interval || 1,
          endsType: 'never',
          weeklyDays: task.repeatDays || task.advancedRepeat?.weeklyDays,
          monthlyDay: task.advancedRepeat?.monthlyDay,
        });
      } else {
        setRepeatSettings(undefined);
      }
    }
  }, [task]);

  useEffect(() => {
    if (showSubtaskInput && subtaskInputRef.current) {
      subtaskInputRef.current.focus();
    }
  }, [showSubtaskInput]);

  // Handle hardware back button on Android
  const handleBack = useCallback(() => {
    onClose();
  }, [onClose]);

  useHardwareBackButton({
    onBack: handleBack,
    enabled: isOpen && !showDateTimePage && !showDependencySheet,
    priority: 'sheet',
  });

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    const closeForTour = () => {
      setShowSubtaskInput(false);
      setIsSubtaskInputSheetOpen(false);
      setShowDateTimePage(false);
      setShowDependencySheet(false);
      setShowExtraReminderSheet(false);
      setShowSubtaskDetailSheet(false);
      setSelectedSubtask(null);
      setPreviewAttachment(null);
      setShowPomodoro(false);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingVoiceId(null);
      onClose();
    };
    window.addEventListener('flowist-tour:close-overlays', closeForTour);
    window.addEventListener('flowist-tour:close-task-overlays', closeForTour);
    return () => {
      window.removeEventListener('flowist-tour:close-overlays', closeForTour);
      window.removeEventListener('flowist-tour:close-task-overlays', closeForTour);
    };
  }, [isOpen, onClose]);

  

  if (!isOpen || !task) return null;


  const currentFolder = folders.find(f => f.id === task.folderId);

  const handleTitleBlur = () => {
    if (title.trim() !== task.text) {
      onUpdate({ ...task, text: title.trim() });
    }
  };

  const handleMarkAsDone = async () => {
    try { await Haptics.impact({ style: ImpactStyle.Heavy }); } catch {}
    onUpdate({ ...task, completed: !task.completed });
    toast.success(task.completed ? t('taskDetail.markAsIncomplete') : t('taskDetail.markAsDone'));
  };

  const handleSetPriority = async (priority: Priority) => {
    try { await Haptics.impact({ style: ImpactStyle.Light }); } catch {}
    onUpdate({ ...task, priority });
    toast.success(t('toasts.saved'));
  };

  const handleDuplicate = async () => {
    try { await Haptics.impact({ style: ImpactStyle.Light }); } catch {}
    onDuplicate(task);
    onClose();
    toast.success(t('toasts.taskDuplicated'));
  };

  const handlePin = async () => {
    try { await Haptics.impact({ style: ImpactStyle.Light }); } catch {}
    toast.success(t('notes.pinned'));
  };

  const handleDelete = async () => {
    try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {}
    onDelete(task.id);
    onClose();
    toast.success(t('toasts.taskDeleted'));
  };

  const handleAddSubtask = async () => {
    if (!newSubtaskText.trim()) return;
    if (!requireCapacity('subtasksPerTask', (task.subtasks || []).length)) return;

    try { await Haptics.impact({ style: ImpactStyle.Light }); } catch {}

    const newSubtask: TodoItem = {
      id: genId(),
      text: newSubtaskText.trim(),
      completed: false,
    };

    onUpdate({
      ...task,
      subtasks: [...(task.subtasks || []), newSubtask]
    });

    setNewSubtaskText('');
    // Keep input open for next subtask
  };

  const handleAddSubtaskFromSheet = async (subtask: Omit<TodoItem, 'id' | 'completed'>) => {
    if (!requireCapacity('subtasksPerTask', (task.subtasks || []).length)) return;
    try { await Haptics.impact({ style: ImpactStyle.Light }); } catch {}

    const newSubtask: TodoItem = {
      id: genId(),
      completed: false,
      ...subtask,
    };

    onUpdate({
      ...task,
      subtasks: [...(task.subtasks || []), newSubtask]
    });

    setIsSubtaskInputSheetOpen(false);
    toast.success(t('taskDetail.subtaskAdded'));
  };

  const handleSubtaskKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddSubtask();
    }
  };

  const handleToggleSubtask = async (subtaskId: string) => {
    try { await Haptics.impact({ style: ImpactStyle.Light }); } catch {}
    const updatedSubtasks = (task.subtasks || []).map(st =>
      st.id === subtaskId ? { ...st, completed: !st.completed } : st
    );
    onUpdate({ ...task, subtasks: updatedSubtasks });
  };

  const handleDeleteSubtask = (subtaskId: string) => {
    onUpdate({
      ...task,
      subtasks: (task.subtasks || []).filter(st => st.id !== subtaskId)
    });
  };

  const handleOpenSubtaskDetail = (subtask: TodoItem) => {
    setSelectedSubtask(subtask);
    setShowSubtaskDetailSheet(true);
  };

  const handleUpdateSubtask = (parentId: string, subtaskId: string, updates: Partial<TodoItem>) => {
    const updatedSubtasks = (task.subtasks || []).map(st =>
      st.id === subtaskId ? { ...st, ...updates } : st
    );
    onUpdate({ ...task, subtasks: updatedSubtasks });
  };

  const handleDeleteSubtaskFromSheet = (parentId: string, subtaskId: string) => {
    onUpdate({
      ...task,
      subtasks: (task.subtasks || []).filter(st => st.id !== subtaskId)
    });
  };

  const handleConvertSubtaskToTask = (parentId: string, subtask: TodoItem) => {
    // Remove from subtasks
    onUpdate({
      ...task,
      subtasks: (task.subtasks || []).filter(st => st.id !== subtask.id)
    });
    // Create as main task (handled by parent component via onDuplicate with modifications)
    const newTask: TodoItem = {
      ...subtask,
      id: genId(),
      folderId: task.folderId,
    };
    onDuplicate(newTask);
  };

  const handleSubtaskDragEnd = async (result: DropResult) => {
    if (!result.destination || !task.subtasks) return;
    
    const sourceIndex = result.source.index;
    const destIndex = result.destination.index;
    
    if (sourceIndex === destIndex) return;
    
    try { await Haptics.impact({ style: ImpactStyle.Medium }); } catch {}
    
    const reordered = Array.from(task.subtasks);
    const [removed] = reordered.splice(sourceIndex, 1);
    reordered.splice(destIndex, 0, removed);
    
    onUpdate({ ...task, subtasks: reordered });
  };

  const handleDateTimeSave = async (data: {
    selectedDate?: Date;
    selectedTime?: { hour: number; minute: number; period: 'AM' | 'PM' };
    reminder?: string;
    repeatSettings?: RepeatSettings;
  }) => {
    try { await Haptics.impact({ style: ImpactStyle.Light }); } catch {}
    
    let reminderTime: Date | undefined;
    
    if (data.selectedDate && data.selectedTime) {
      reminderTime = new Date(data.selectedDate);
      let hours = data.selectedTime.hour;
      if (data.selectedTime.period === 'PM' && hours !== 12) hours += 12;
      if (data.selectedTime.period === 'AM' && hours === 12) hours = 0;
      reminderTime.setHours(hours, data.selectedTime.minute, 0, 0);
    }

    const updatedTask: TodoItem = {
      ...task,
      dueDate: data.selectedDate,
      reminderTime,
      repeatType: data.repeatSettings?.frequency as any || 'none',
    };

    onUpdate(updatedTask);
    
    // Store reminder offset and repeat settings
    setReminderOffset(data.reminder || '');
    setRepeatSettings(data.repeatSettings);

    // Schedule reminder in background (non-blocking)
    if (updatedTask.reminderTime) {
      import('@/utils/reminderScheduler').then(({ scheduleTaskReminder }) => {
        scheduleTaskReminder(updatedTask.id, updatedTask.text, new Date(updatedTask.reminderTime!), updatedTask.isUrgent).catch(console.warn);
      });
    } else {
      import('@/utils/reminderScheduler').then(({ cancelTaskReminder }) => {
        cancelTaskReminder(updatedTask.id).catch(console.warn);
      });
    }

    // CLOSE SHEET FIRST — never block UI on native plugin calls
    setShowDateTimePage(false);
    toast.success(data.selectedDate ? t('taskDetailToasts.dateTimeReminderSaved') : t('taskDetailToasts.dateSaved'));

    // Notification scheduling removed
  };

  const handleSaveExtraReminder = async (value: ExtraReminderValue) => {
    // Legacy single-value callback: kept for backward compatibility. The full
    // list is now saved via `handleSaveExtraRemindersList`, but we still mirror
    // the FIRST item into the legacy fields so older restore paths keep working.
    try { await Haptics.impact({ style: ImpactStyle.Light }); } catch {}
    try {
      const { scheduleExtraReminder } = await import('@/utils/reminderScheduler');
      const legacyRecurring = (value.recurring === 'hourly' ? 'none' : value.recurring) as any;
      const scheduled = await scheduleExtraReminder(task.id, task.text, value.time, legacyRecurring);
      const finalTime = scheduled ?? value.time;
      onUpdate({
        ...task,
        extraReminderTime: finalTime,
        extraReminderRecurring: value.recurring as any,
      });
    } catch (e) {
      console.warn('Failed to save extra reminder:', e);
    }
  };

  const handleSaveExtraRemindersList = async (
    items: Array<{ id: string; time: Date; recurring: any; daysOfWeek?: number[] }>
  ) => {
    try { await Haptics.impact({ style: ImpactStyle.Light }); } catch {}
    try {
      const { scheduleExtraRemindersList } = await import('@/utils/reminderScheduler');
      await scheduleExtraRemindersList(task.id, task.text, items);
    } catch (e) {
      console.warn('Failed to schedule extra reminders list:', e);
    }
    const first = items[0];
    onUpdate({
      ...task,
      extraReminders: items,
      extraReminderTime: first?.time,
      extraReminderRecurring: (first?.recurring ?? 'none') as any,
    } as any);
    toast.success(
      t(
        'taskDetailToasts.extraReminderSaved',
        items.length > 1 ? `${items.length} reminders set` : 'Reminder set'
      )
    );
  };

  const handleRemoveExtraReminder = async () => {
    try { await Haptics.impact({ style: ImpactStyle.Light }); } catch {}
    try {
      const { cancelAllExtraReminders } = await import('@/utils/reminderScheduler');
      await cancelAllExtraReminders(task.id);
    } catch {}
    const { extraReminderTime, extraReminderRecurring, extraReminderNotificationId, extraReminders, ...rest } = task as any;
    onUpdate(rest);
    toast.success(t('taskDetailToasts.extraReminderRemoved', 'Extra reminder removed'));
  };

  const handleConvertToNote = () => {
    onConvertToNote(task);
    onClose();
  };

  const handleAddTag = () => {
    if (!newTagName.trim()) return;
    
    const newTag: ColoredTag = {
      name: newTagName.trim(),
      color: newTagColor
    };

    onUpdate({
      ...task,
      coloredTags: [...(task.coloredTags || []), newTag]
    });

    // Save to suggestions in IndexedDB
    getSetting<ColoredTag[]>('coloredTagSuggestions', []).then(savedTags => {
      const exists = savedTags.some((t: ColoredTag) => t.name === newTag.name);
      if (!exists) {
        setSetting('coloredTagSuggestions', [newTag, ...savedTags].slice(0, 20));
      }
    });

    setNewTagName('');
    setShowTagInput(false);
    toast.success(t('toasts.tagAdded'));
  };

  const handleRemoveTag = (tagName: string) => {
    onUpdate({
      ...task,
      coloredTags: (task.coloredTags || []).filter(t => t.name !== tagName)
    });
  };

  const handleVoicePlay = async () => {
    if (!task.voiceRecording) return;

    if (playingVoiceId === task.id && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setPlayingVoiceId(null);
      setVoiceProgress(0);
      setVoiceCurrentTime(0);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    // Resolve media ref if needed
    const audioUrl = await resolveTaskMediaUrl(task.voiceRecording.audioUrl);
    if (!audioUrl) return;

    const audio = new Audio(audioUrl);
    audio.playbackRate = voicePlaybackSpeed;
    audioRef.current = audio;
    
    audio.ontimeupdate = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setVoiceProgress((audio.currentTime / audio.duration) * 100);
        setVoiceCurrentTime(audio.currentTime);
      }
    };
    
    audio.onloadedmetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setAudioDuration(Math.round(audio.duration));
      }
    };
    
    audio.onended = () => {
      setPlayingVoiceId(null);
      setVoiceProgress(0);
      setVoiceCurrentTime(0);
      audioRef.current = null;
    };
    audio.play();
    setPlayingVoiceId(task.id);
  };

  const cycleVoicePlaybackSpeed = () => {
    const currentIndex = VOICE_PLAYBACK_SPEEDS.indexOf(voicePlaybackSpeed);
    const nextIndex = (currentIndex + 1) % VOICE_PLAYBACK_SPEEDS.length;
    const newSpeed = VOICE_PLAYBACK_SPEEDS[nextIndex];
    setVoicePlaybackSpeed(newSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = newSpeed;
    }
  };

  const handleVoiceSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !task?.voiceRecording) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = clickX / rect.width;
    const duration = audioRef.current.duration || audioDuration || task.voiceRecording.duration;
    if (duration && !isNaN(duration)) {
      audioRef.current.currentTime = percentage * duration;
      setVoiceProgress(percentage * 100);
      setVoiceCurrentTime(percentage * duration);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // File attachment handlers
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !task) return;

    // Free plan: images are Pro-only.
    const hasImage = Array.from(files).some(f => f.type?.startsWith('image/'));
    if (hasImage && !requireProFeature('image_attachment')) {
      if (e.target) e.target.value = '';
      return;
    }
    // Free plan: capacity gate (1 attachment per calendar day) for non-image files
    const { getAttachmentsAddedToday, incrementAttachmentsAddedToday } = await import('@/utils/attachmentDailyCounter');
    if (!requireCapacity('attachmentsPerDay', getAttachmentsAddedToday())) {
      if (e.target) e.target.value = '';
      return;
    }


    const newAttachments: TaskAttachment[] = [];

    for (const file of Array.from(files)) {
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });

      const id = `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await saveTaskMedia('file', id, dataUrl);

      newAttachments.push({
        id,
        name: file.name,
        size: file.size,
        type: file.type,
        ref: makeTaskMediaRef('file', id),
      });
    }

    onUpdate({
      ...task,
      attachments: [...(task.attachments || []), ...newAttachments],
    });

    incrementAttachmentsAddedToday(newAttachments.length);
    toast.success(t('taskDetailToasts.filesAttached', { count: newAttachments.length }));
    if (e.target) e.target.value = '';
  };

  const handleRemoveAttachment = async (attachmentId: string) => {
    if (!task) return;
    
    const attachment = task.attachments?.find(a => a.id === attachmentId);
    if (attachment) {
      const parsed = parseTaskMediaRef(attachment.ref);
      if (parsed) {
        await deleteTaskMedia(parsed.kind, parsed.id);
      }
    }
    onUpdate({
      ...task,
      attachments: task.attachments?.filter(a => a.id !== attachmentId),
    });
    toast.success(t('taskDetailToasts.fileRemoved'));
  };


  const handleOpenAttachment = async (attachment: TaskAttachment) => {
    
    const dataUrl = await resolveTaskMediaUrl(attachment.ref);
    if (!dataUrl) return;

    const isImage = attachment.type?.startsWith('image/');
    const isPdf = attachment.type === 'application/pdf';
    const isViewable = isImage || isPdf || attachment.type?.startsWith('text/') || attachment.type?.startsWith('video/') || attachment.type?.startsWith('audio/');
    
    if (isViewable) {
      // Show in-app preview (images, PDFs, text, video, audio)
      setPreviewAttachment({ url: dataUrl, name: attachment.name, type: attachment.type });
    } else {
      // Non-viewable files: save to filesystem and share via native share sheet
      try {
        const { Filesystem, Directory } = await import('@capacitor/filesystem');
        const { Share } = await import('@capacitor/share');
        
        const base64Data = dataUrl.split(',')[1];
        const result = await Filesystem.writeFile({
          path: attachment.name || `file_${Date.now()}`,
          data: base64Data,
          directory: Directory.Cache,
        });
        
        await Share.share({ title: attachment.name, url: result.uri });
      } catch {
        // Fallback for web
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = attachment.name;
        link.target = '_blank';
        link.click();
      }
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };


  return (
    <div 
      className={cn(
        "fixed inset-y-0 right-0 left-0 z-50 flex flex-col transition-transform duration-300 border-l border-border",
        isOpen ? "translate-x-0" : "translate-x-full"
      )}
      style={{
        paddingTop: 'var(--safe-top, 0px)',
        paddingBottom: 'var(--safe-bottom, 0px)',
        left: 'var(--desktop-sidebar-width, 0px)',
        backgroundColor: '#f8f8f6',
      }}
    >
      {/* Header — back / share / comments / more */}
      <header className="flex items-center justify-between px-2 py-2">
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Back" className="rounded-full h-10 w-10">
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Share"
            className="rounded-full h-10 w-10"
            onClick={async () => {
              const shareTitle = task.text || 'Task';
              try {
                if (typeof navigator !== 'undefined' && (navigator as any).share) {
                  await (navigator as any).share({ title: shareTitle, text: shareTitle });
                } else {
                  await navigator.clipboard.writeText(shareTitle);
                  toast.success(t('common.copied', 'Copied'));
                }
              } catch {}
            }}
          >
            <Share className="h-[18px] w-[18px]" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Comments"
            className="rounded-full h-10 w-10"
            onClick={() => {
              const el = typeof document !== 'undefined' ? document.getElementById('td-comments') : null;
              el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            <MessageSquare className="h-[18px] w-[18px]" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button data-tour="task-detail-options" variant="ghost" size="icon" className="rounded-full h-10 w-10">
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-popover border shadow-lg z-[60]">
              <DropdownMenuItem onClick={handleMarkAsDone} className="cursor-pointer">
                <Check className="h-4 w-4 mr-2" />
                {task.completed ? t('taskDetail.markAsIncomplete') : t('taskDetail.markAsDone')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleDuplicate} className="cursor-pointer">
                <Copy className="h-4 w-4 mr-2" />{t('taskDetail.duplicateTask')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { if (!requireFeature('pin_feature')) return; handlePin(); }} className="cursor-pointer">
                <Pin className="h-4 w-4 mr-2" />{t('taskDetail.pinTask')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleDelete} className="cursor-pointer text-destructive">
                <Trash2 className="h-4 w-4 mr-2" />{t('taskDetail.deleteTask')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>


      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-4">

        {/* Title */}
        <div className="pt-1 space-y-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            placeholder={t('taskDetail.taskTitle')}
            className={cn(
              "text-[28px] leading-[1.15] font-bold border-none shadow-none px-0 h-auto py-0 focus-visible:ring-0 placeholder:text-muted-foreground/50 bg-transparent",
              task.completed && "line-through opacity-60"
            )}
          />
        </div>

        {/* Description — plain paragraph, no label, no box */}
        <div>
          <style>{RICH_TEXT_EDITOR_STYLES}</style>
          {isEditingDesc || !descText ? (
            <MentionDescriptionEditor
              value={descText}
              onChange={(next) => {
                setDescText(next);
                onUpdate({ ...task, description: next });
              }}
              onFocus={() => setIsEditingDesc(true)}
              onBlur={() => setTimeout(() => setIsEditingDesc(false), 200)}
              placeholder={t('taskDetail.descriptionPlaceholder')}
              className="bg-transparent border-none focus:ring-0 focus-visible:ring-0 shadow-none px-0"
              minHeight={40}
            />
          ) : (
            <div
              onClick={() => setIsEditingDesc(true)}
              className="rich-text-editor w-full text-[14px] text-muted-foreground/90 whitespace-pre-wrap leading-relaxed cursor-text"
              dangerouslySetInnerHTML={{ __html: descriptionToDisplayHtml(descText) }}
            />
          )}
        </div>

        {/* Card 1 — Status / Priority / Due Date / Reminder */}
        <div className="rounded-2xl bg-white border border-border/60 divide-y divide-border/60 overflow-hidden shadow-sm">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button data-tour="task-detail-status" className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/40 transition-colors text-left">
                <span className="flex-shrink-0 h-3.5 w-3.5 rounded-full border-[1.25px] border-foreground/80 flex items-center justify-center">
                  <MoreHorizontal className="h-2 w-2" />
                </span>
                <span className="flex-1 text-[10px] font-medium leading-none">Status</span>
                <span className="text-[10px] leading-none px-2 py-1 rounded-full bg-info/15 text-info font-medium">
                  {getStatusConfig(task.status || 'not_started').label}
                </span>
                <ChevronRight className="h-3 w-3 text-muted-foreground/70 ml-0.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {TASK_STATUS_OPTIONS.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => {
                    if (!requireFeature('task_status')) return;
                    onUpdate({ ...task, status: option.value as TaskStatus });
                    toast.success(t('toasts.saved'));
                  }}
                >
                  <TaskStatusBadge status={option.value} showLabel={true} />
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/40 transition-colors text-left">
                <span className="flex-shrink-0 h-3.5 w-3.5 flex items-center justify-center">
                  <Flag
                    className="h-3.5 w-3.5"
                    style={{
                      color: task.priority && task.priority !== 'none' ? getPriorityHex(task.priority) : 'hsl(var(--muted-foreground))',
                      fill: task.priority && task.priority !== 'none' ? getPriorityHex(task.priority) : 'transparent',
                    }}
                  />
                </span>
                <span className="flex-1 text-[10px] font-medium leading-none">Priority</span>
                <span
                  className="text-[10px] leading-none font-medium capitalize"
                  style={{ color: task.priority && task.priority !== 'none' ? getPriorityHex(task.priority) : 'hsl(var(--muted-foreground))' }}
                >
                  {task.priority && task.priority !== 'none' ? getPriorityName(task.priority) : 'None'}
                </span>
                <ChevronRight className="h-3 w-3 text-muted-foreground/70 ml-0.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44 z-[60]">
              <DropdownMenuItem onClick={() => handleSetPriority('high')} className="cursor-pointer"><Flag className="h-4 w-4 mr-2 text-red-500" />High</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSetPriority('medium')} className="cursor-pointer"><Flag className="h-4 w-4 mr-2 text-orange-500" />Medium</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSetPriority('low')} className="cursor-pointer"><Flag className="h-4 w-4 mr-2 text-green-500" />Low</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleSetPriority('none')} className="cursor-pointer"><Flag className="h-4 w-4 mr-2 text-muted-foreground" />None</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <button onClick={() => setShowDateTimePage(true)} className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/40 transition-colors text-left">
            <span className="flex-shrink-0 h-3.5 w-3.5 flex items-center justify-center">
              <CalendarIcon className="h-3.5 w-3.5" />
            </span>
            <span className="flex-1 text-[10px] font-medium leading-none">Due Date</span>
            <span className="text-[9px] leading-none text-muted-foreground">
              {task.dueDate ? format(new Date(task.dueDate), 'EEE, MMM d, yyyy') : 'None'}
            </span>
            <ChevronRight className="h-3 w-3 text-muted-foreground/70 ml-0.5" />
          </button>

          <button
            onClick={() => {
              const currentList = (task as any).extraReminders as unknown[] | undefined;
              const currentCount = Array.isArray(currentList) ? currentList.length : task.extraReminderTime ? 1 : 0;
              if (currentCount >= 1 && !requireCapacity('remindersPerTask', currentCount)) return;
              setShowExtraReminderSheet(true);
            }}
            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/40 transition-colors text-left"
          >
            <span className="flex-shrink-0 h-3.5 w-3.5 flex items-center justify-center">
              <Bell className="h-3.5 w-3.5" />
            </span>
            <span className="flex-1 text-[10px] font-medium leading-none">Reminder</span>
            <span className="text-[9px] leading-none text-muted-foreground truncate max-w-[50%]">
              {(() => {
                const list = (task as any).extraReminders as Array<{ time: Date }> | undefined;
                if (list && list.length) return list.length === 1 ? format(new Date(list[0].time), 'MMM d, h:mm a') : `${list.length} reminders`;
                if (task.extraReminderTime) return format(new Date(task.extraReminderTime), 'MMM d, h:mm a');
                return 'None';
              })()}
            </span>
            <ChevronRight className="h-3 w-3 text-muted-foreground/70 ml-0.5" />
          </button>
        </div>

        {/* Card 2 — Focus & Time */}
        <div className="rounded-2xl bg-white border border-border/60 divide-y divide-border/60 overflow-hidden shadow-sm">
          <button
            data-tour="task-detail-focus-mode"
            onClick={() => { if (!requireProFeature('pomodoro')) return; setShowPomodoro(true); }}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
          >
            <span className="flex-shrink-0 h-4 w-4 flex items-center justify-center">
              <Target className="h-4 w-4 text-primary" />
            </span>
            <span className="flex-1 min-w-0 flex items-center gap-1 text-[10px] font-medium leading-none truncate">
              Focus Mode {!isPro && <PremiumCrown size={12} />}
            </span>
            <span className="text-[9px] leading-none text-muted-foreground truncate">Deep Work</span>
            <ChevronRight className="h-3 w-3 text-muted-foreground/60 flex-shrink-0 ml-0.5" />
          </button>

          <button
            onClick={() => { if (!requireFeature('time_tracking')) return; }}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
          >
            <span className="flex-shrink-0 h-4 w-4 flex items-center justify-center">
              <Clock className="h-4 w-4 text-info" />
            </span>
            <span className="flex-1 min-w-0 text-[10px] font-medium leading-none truncate">Time Tracking</span>
            <span className="text-[9px] leading-none text-muted-foreground tabular-nums truncate">
              {formatPomodoroDuration(pomodoroStats.taskFocusedSec)}
            </span>
            <ChevronRight className="h-3 w-3 text-muted-foreground/60 flex-shrink-0 ml-0.5" />
          </button>
        </div>

        {/* Card 3 — Subtasks / Tags / Convert to Notes */}
        <div className="rounded-2xl bg-white border border-border/60 divide-y divide-border/60 overflow-hidden shadow-sm">
          <button
            onClick={() => setIsSubtaskInputSheetOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
          >
            <span className="flex-shrink-0 h-4 w-4 flex items-center justify-center">
              <ListChecks className="h-4 w-4 text-success" strokeWidth={2} />
            </span>
            <span className="flex-1 min-w-0 text-[10px] font-medium leading-none truncate">Subtasks</span>
            <span className="text-[9px] leading-none text-muted-foreground tabular-nums truncate">
              {task.subtasks?.length ?? 0}
            </span>
            <ChevronRight className="h-3 w-3 text-muted-foreground/60 flex-shrink-0 ml-0.5" />
          </button>

          <button
            onClick={() => setShowTagInput(true)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
          >
            <span className="flex-shrink-0 h-4 w-4 flex items-center justify-center">
              <Tag className="h-4 w-4 text-info" />
            </span>
            <span className="flex-1 min-w-0 text-[10px] font-medium leading-none truncate">Tags</span>
            <span className="text-[9px] leading-none text-muted-foreground truncate max-w-[50%]">
              {task.coloredTags && task.coloredTags.length > 0
                ? task.coloredTags.map(t => t.name).join(', ')
                : 'None'}
            </span>
            <ChevronRight className="h-3 w-3 text-muted-foreground/60 flex-shrink-0 ml-0.5" />
          </button>

          <button
            onClick={() => onConvertToNote(task)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
          >
            <span className="flex-shrink-0 h-4 w-4 flex items-center justify-center">
              <FileEdit className="h-4 w-4 text-warning" />
            </span>
            <span className="flex-1 min-w-0 text-[10px] font-medium leading-none truncate">Convert to Notes</span>
            <ChevronRight className="h-3 w-3 text-muted-foreground/60 flex-shrink-0 ml-0.5" />
          </button>
        </div>





        {/* Voice Recording Display */}
        {task.voiceRecording && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
            <button
              onClick={handleVoicePlay}
              className="w-10 h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0 hover:opacity-90 transition-opacity"
            >
              {playingVoiceId === task.id ? (
                <Pause className="h-5 w-5 text-primary-foreground" />
              ) : (
                <Play className="h-5 w-5 text-primary-foreground ml-0.5" />
              )}
            </button>
            <div className="flex-1 flex flex-col gap-1">
              {/* Waveform progress bar */}
              {resolvedAudioUrl ? (
                <WaveformProgressBar
                  audioUrl={resolvedAudioUrl}
                  progress={voiceProgress}
                  duration={audioDuration || task.voiceRecording.duration}
                  isPlaying={playingVoiceId === task.id}
                  onSeek={(percent) => {
                    if (audioRef.current) {
                      const duration = audioRef.current.duration || audioDuration || task.voiceRecording!.duration;
                      if (duration && !isNaN(duration)) {
                        audioRef.current.currentTime = (percent / 100) * duration;
                        setVoiceProgress(percent);
                        setVoiceCurrentTime((percent / 100) * duration);
                      }
                    }
                  }}
                  height={20}
                />
              ) : (
                <div 
                  className="relative h-2 bg-primary/20 rounded-full overflow-hidden cursor-pointer"
                  onClick={handleVoiceSeek}
                >
                  <div 
                    className="absolute h-full bg-primary rounded-full transition-all duration-100"
                    style={{ width: `${voiceProgress}%` }}
                  />
                </div>
              )}
              <div className="flex items-center justify-between text-xs">
                <span className="text-primary font-medium">
                  {playingVoiceId === task.id ? formatDuration(Math.round(voiceCurrentTime)) : '0:00'}
                </span>
                <span className="text-primary/70">
                  {formatDuration(audioDuration || task.voiceRecording.duration)}
                </span>
              </div>
            </div>
            <button
              onClick={cycleVoicePlaybackSpeed}
              className="px-2 py-1 text-xs font-semibold rounded-md bg-muted hover:bg-muted/80 transition-colors min-w-[40px]"
            >
              {voicePlaybackSpeed}x
            </button>
          </div>
        )}

        {/* Image Display */}
        {task.imageUrl && (
          <div className="rounded-xl overflow-hidden border border-border">
            <ResolvedTaskImage srcRef={task.imageUrl} alt={t('taskDetail.taskAttachment')} className="w-full max-h-48 object-cover" />
          </div>
        )}


        {/* Task History — clickable, opens detail page */}
        <div className="rounded-2xl bg-white border border-border/60 shadow-sm overflow-hidden">
          <button
            onClick={() => setShowHistoryPage(true)}
            className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/40 transition-colors text-left"
          >
            <span className="flex-shrink-0 h-5 w-5 flex items-center justify-center">
              <Clock className="h-5 w-5 text-muted-foreground" />
            </span>
            <span className="flex-1 min-w-0 text-[10px] font-medium truncate">
              {t('taskDetail.taskHistory', 'Task History')}
            </span>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 flex-shrink-0" />
          </button>
        </div>
      </div>

      {/* Task History full-page overlay */}
      {showHistoryPage && (
        <div className="fixed inset-0 z-[70] bg-[#f8f8f6] flex flex-col overflow-y-auto" style={{ paddingTop: 'var(--safe-top, 0px)' }}>
          <div className="sticky top-0 z-10 bg-[#f8f8f6]/95 backdrop-blur-sm border-b border-border/40 flex items-center gap-2 px-3 py-3">
            <button
              onClick={() => setShowHistoryPage(false)}
              aria-label="Back to task"
              className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white border border-border/60 shadow-sm hover:bg-muted/40 active:scale-95 transition-all"
            >
              <ChevronLeft className="h-5 w-5" />
              <span className="text-[13px] font-medium">Back</span>
            </button>
            <h2 className="text-lg font-semibold ml-1">{t('taskDetail.taskHistory', 'Task History')}</h2>
          </div>
          <div className="px-4 pb-8 space-y-3">
            <div className="rounded-2xl bg-white border border-border/60 shadow-sm divide-y divide-border/60">
              <div className="flex items-center justify-between px-4 py-3.5">
                <span className="text-[13px] text-muted-foreground">{t('taskDetail.created', 'Created')}</span>
                {isPro ? (
                  <span className="text-[13px] font-medium">
                    {task.createdAt ? format(new Date(task.createdAt), 'MMM d, yyyy • h:mm a') : '—'}
                  </span>
                ) : (
                  <span className="text-[13px] font-medium blur-[6px] select-none">Jan 1, 2025 • 12:00 PM</span>
                )}
              </div>
              <div className="flex items-center justify-between px-4 py-3.5">
                <span className="text-[13px] text-muted-foreground">{t('taskDetail.lastModified', 'Last Modified')}</span>
                {isPro ? (
                  <span className="text-[13px] font-medium">
                    {task.modifiedAt ? format(new Date(task.modifiedAt), 'MMM d, yyyy • h:mm a') : '—'}
                  </span>
                ) : (
                  <span className="text-[13px] font-medium blur-[6px] select-none">Jan 5, 2025 • 3:45 PM</span>
                )}
              </div>
              {task.dueDate && (
                <div className="flex items-center justify-between px-4 py-3.5">
                  <span className="text-[13px] text-muted-foreground">{t('taskDetail.dueDate', 'Due Date')}</span>
                  <span className="text-[13px] font-medium">
                    {format(new Date(task.dueDate), 'MMM d, yyyy • h:mm a')}
                  </span>
                </div>
              )}
              {task.completed && task.completedAt && (
                <div className="flex items-center justify-between px-4 py-3.5">
                  <span className="text-[13px] text-success">{t('taskDetail.completed', 'Completed')}</span>
                  <span className="text-[13px] font-medium text-success">
                    {format(new Date(task.completedAt), 'MMM d, yyyy • h:mm a')}
                  </span>
                </div>
              )}
            </div>
            {!isPro && (
              <button
                onClick={() => requireFeature('time_tracking')}
                className="w-full text-[12px] text-primary font-medium py-2"
              >
                Unlock full history with Premium
              </button>
            )}
          </div>
        </div>
      )}


      {/* Safe area padding for bottom */}
      <div style={{ paddingBottom: 'var(--safe-bottom, 0px)' }} />


      {/* TaskDateTimePage */}
      <TaskDateTimePage
        isOpen={showDateTimePage}
        onClose={() => setShowDateTimePage(false)}
        onSave={handleDateTimeSave}
        initialDate={task.dueDate ? new Date(task.dueDate) : undefined}
        initialTime={task.reminderTime ? {
          hour: new Date(task.reminderTime).getHours() % 12 || 12,
          minute: new Date(task.reminderTime).getMinutes(),
          period: new Date(task.reminderTime).getHours() >= 12 ? 'PM' : 'AM'
        } : undefined}
        initialReminder={reminderOffset}
        initialRepeatSettings={repeatSettings}
      />

      {/* Extra Reminder Sheet */}
      <TaskReminderSheet
        isOpen={showExtraReminderSheet}
        onClose={() => setShowExtraReminderSheet(false)}
        initialItems={
          Array.isArray((task as any).extraReminders) && (task as any).extraReminders.length > 0
            ? (task as any).extraReminders.map((r: any) => ({
                id: String(r.id),
                time: new Date(r.time),
                recurring: (r.recurring || 'none') as any,
                daysOfWeek: Array.isArray(r.daysOfWeek) ? r.daysOfWeek : undefined,
              }))
            : null
        }
        initialValue={
          task.extraReminderTime
            ? {
                time: new Date(task.extraReminderTime),
                recurring: (task.extraReminderRecurring || 'none') as any,
              }
            : null
        }
        onSave={handleSaveExtraReminder}
        onSaveAll={handleSaveExtraRemindersList}
        onRemove={handleRemoveExtraReminder}
      />


      {/* TaskDependencySheet */}
      <TaskDependencySheet
        isOpen={showDependencySheet}
        onClose={() => setShowDependencySheet(false)}
        task={task}
        allTasks={allTasks}
        onSave={(dependsOn) => onUpdate({ ...task, dependsOn })}
      />

      {/* Subtask Input Sheet - full featured like main task */}
      <TaskInputSheet
        isOpen={isSubtaskInputSheetOpen}
        onClose={() => setIsSubtaskInputSheetOpen(false)}
        onAddTask={handleAddSubtaskFromSheet}
        folders={folders}
        selectedFolderId={task.folderId}
        onCreateFolder={() => {}}
      />

      {/* Subtask Detail Sheet */}
      <SubtaskDetailSheet
        isOpen={showSubtaskDetailSheet}
        subtask={selectedSubtask}
        parentId={task.id}
        onClose={() => {
          setShowSubtaskDetailSheet(false);
          setSelectedSubtask(null);
        }}
        onUpdate={handleUpdateSubtask}
        onDelete={handleDeleteSubtaskFromSheet}
        onConvertToTask={handleConvertSubtaskToTask}
      />


      {/* In-App Attachment Preview */}
      {previewAttachment && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col" onClick={() => setPreviewAttachment(null)}>
          <div className="flex items-center justify-between px-4 py-3" style={{ paddingTop: 'calc(var(--safe-top, 0px) + 12px)' }}>
            <p className="text-white text-sm font-medium truncate flex-1">{previewAttachment.name}</p>
            <button onClick={() => setPreviewAttachment(null)} className="p-2 text-white">
              <X className="h-6 w-6" />
            </button>
          </div>
          <div className="flex-1 flex items-stretch justify-center overflow-auto" onClick={(e) => e.stopPropagation()}>
            {previewAttachment.type?.startsWith('image/') ? (
              <div className="flex-1 flex items-center justify-center p-4">
                <img src={previewAttachment.url} alt={previewAttachment.name} className="max-w-full max-h-full object-contain rounded-lg" />
              </div>
            ) : previewAttachment.type === 'application/pdf' ? (
              <PdfViewer src={previewAttachment.url} className="w-full h-full" />
            ) : previewAttachment.type?.startsWith('video/') ? (
              <div className="flex-1 flex items-center justify-center p-4">
                <video src={previewAttachment.url} controls className="max-w-full max-h-full rounded-lg" />
              </div>
            ) : previewAttachment.type?.startsWith('audio/') ? (
              <div className="flex-1 flex items-center justify-center p-4">
                <audio src={previewAttachment.url} controls className="w-full max-w-md" />
              </div>
            ) : previewAttachment.type?.startsWith('text/') ? (
              <iframe src={previewAttachment.url} className="w-full h-full bg-white" title={previewAttachment.name} />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-4">
                <p className="text-white/80 text-sm">{t('tasks.attachments.cannotPreview', 'This file type cannot be previewed in the app.')}</p>
                <a
                  href={previewAttachment.url}
                  download={previewAttachment.name}
                  className="px-4 py-2 bg-white text-black rounded-lg text-sm font-medium"
                >
                  {t('tasks.attachments.download', 'Download / Open')}
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      <FocusMode
        open={showPomodoro}
        onClose={() => setShowPomodoro(false)}
        taskId={task?.id}
        taskTitle={task?.text}
        onComplete={() => { if (task && !task.completed) handleMarkAsDone(); }}
      />


    </div>
  );

};
