import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { FileText, CheckCircle2, FolderOpen, Layers, CalendarDays } from 'lucide-react';
import { loadNotesFromDB } from '@/utils/noteStorage';
import { loadTodoItems } from '@/utils/todoItemsStorage';
import { loadStreakData } from '@/utils/streakStorage';
import { getSetting } from '@/utils/settingsStorage';
import { Folder } from '@/types/note';

interface StatsData {
  notes: number;
  tasks: number;
  folders: number;
  sections: number;
  days: number;
}

export const useProfileStats = () => {
  const [stats, setStats] = useState<StatsData>({ notes: 0, tasks: 0, folders: 0, sections: 0, days: 0 });
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [notes, tasks, streak, noteFolders, todoFolders] = await Promise.all([
        loadNotesFromDB(),
        loadTodoItems(),
        loadStreakData('flowist_streak'),
        getSetting<Folder[]>('folders', []),
        getSetting<Folder[]>('todoFolders', []),
      ]);

      const sectionSet = new Set<string>();
      tasks.forEach(t => { if (t.sectionId) sectionSet.add(t.sectionId); });

      setStats({
        notes: notes.length,
        tasks: tasks.length,
        folders: noteFolders.length + todoFolders.length,
        sections: sectionSet.size,
        days: streak.totalCompletions,
      });
    } catch (e) {
      console.error('Failed to load profile stats:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const refresh = () => void load();
    const refreshEvents = ['notesUpdated', 'notesRestored', 'tasksUpdated', 'tasksRestored', 'foldersUpdated', 'foldersRestored'];

    void load();
    refreshEvents.forEach((eventName) => window.addEventListener(eventName, refresh));

    return () => {
      refreshEvents.forEach((eventName) => window.removeEventListener(eventName, refresh));
    };
  }, [load]);

  return { stats, isLoading };
};

export const ProfileStatsBanner = () => {
  const { t } = useTranslation();
  const { stats } = useProfileStats();

  const items = [
    { icon: FileText, value: stats.notes, label: t('profile.statNotes', 'Notes'), color: 'text-primary' },
    { icon: CheckCircle2, value: stats.tasks, label: t('profile.statTasks', 'Tasks'), color: 'text-success' },
    { icon: FolderOpen, value: stats.folders, label: t('profile.statFolders', 'Folders'), color: 'text-warning' },
    { icon: Layers, value: stats.sections, label: t('profile.statSections', 'Sections'), color: 'text-accent-foreground' },
    { icon: CalendarDays, value: stats.days, label: t('profile.statDays', 'Days'), color: 'text-destructive' },
  ];

  return (
    <div className="grid grid-cols-5 gap-2">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex flex-col items-center p-2.5 bg-card rounded-xl border border-border/50"
        >
          <item.icon className={`h-4 w-4 ${item.color} mb-1`} />
          <span className="text-lg font-bold text-foreground">{item.value}</span>
          <span className="text-[9px] text-muted-foreground leading-tight">{item.label}</span>
        </div>
      ))}
    </div>
  );
};
