/**
 * SelectiveSyncSheet — Lets users toggle sync on/off per data category.
 */
import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { useTranslation } from 'react-i18next';
import { getSetting, setSetting } from '@/utils/settingsStorage';
import { FileText, ListTodo, FolderOpen, Target, Flame, Palette, Settings2, BookOpen, Trophy, Tag } from 'lucide-react';

interface SyncCategory {
  key: string;
  labelKey: string;
  icon: typeof FileText;
  description: string;
}

const SYNC_CATEGORIES: SyncCategory[] = [
  { key: 'sync_notes', labelKey: 'Notes', icon: FileText, description: 'All notes, sketches, voice notes & tags' },
  { key: 'sync_tasks', labelKey: 'Tasks', icon: ListTodo, description: 'Tasks, subtasks, sections' },
  { key: 'sync_folders', labelKey: 'Folders', icon: FolderOpen, description: 'Note & task folders' },
  { key: 'sync_habits', labelKey: 'Habits', icon: Target, description: 'Habits and tracking data' },
  { key: 'sync_streaks', labelKey: 'Streaks & Gamification', icon: Flame, description: 'Streaks, achievements, challenges' },
  { key: 'sync_themes', labelKey: 'Themes & Appearance', icon: Palette, description: 'Custom themes, dark mode' },
  { key: 'sync_settings', labelKey: 'Settings & Preferences', icon: Settings2, description: 'App lock, toolbar, view mode' },
  { key: 'sync_notebooks', labelKey: 'Sketch Notebooks', icon: BookOpen, description: 'Sketch notebook library' },
  { key: 'sync_journey', labelKey: 'Virtual Journey', icon: Trophy, description: 'Journey progress and badges' },
];

interface SelectiveSyncSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SelectiveSyncSheet = ({ isOpen, onClose }: SelectiveSyncSheetProps) => {
  const { t } = useTranslation();
  const [toggles, setToggles] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isOpen) return;
    const loadToggles = async () => {
      const loaded: Record<string, boolean> = {};
      for (const cat of SYNC_CATEGORIES) {
        const val = await getSetting<boolean>(cat.key, true);
        loaded[cat.key] = val;
      }
      setToggles(loaded);
    };
    loadToggles();
  }, [isOpen]);

  const handleToggle = async (key: string, value: boolean) => {
    setToggles(prev => ({ ...prev, [key]: value }));
    await setSetting(key, value);
    window.dispatchEvent(new CustomEvent('syncPreferencesChanged', { detail: { key, enabled: value } }));
  };

  return (
    <Sheet open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[85vh] rounded-t-2xl">
        <SheetHeader className="pb-3">
          <SheetTitle className="text-base font-semibold">{t('settings.selectiveSync', 'Selective Sync')}</SheetTitle>
          <p className="text-xs text-muted-foreground">Choose what data syncs across your devices</p>
        </SheetHeader>
        <div className="space-y-1 overflow-y-auto max-h-[60vh] pb-4">
          {SYNC_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const enabled = toggles[cat.key] ?? true;
            return (
              <div key={cat.key} className="flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-muted/50 transition-colors">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Icon className="h-4.5 w-4.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{cat.labelKey}</p>
                  <p className="text-[11px] text-muted-foreground leading-tight">{cat.description}</p>
                </div>
                <Switch
                  checked={enabled}
                  onCheckedChange={(v) => handleToggle(cat.key, v)}
                />
              </div>
            );
          })}
        </div>
        <div className="pt-2 border-t border-border">
          <p className="text-[10px] text-muted-foreground text-center">
            Disabled categories won't upload or download during sync
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
};
