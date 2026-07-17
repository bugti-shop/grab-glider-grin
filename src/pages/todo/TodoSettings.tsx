import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { TodoBottomNavigation } from '@/components/TodoBottomNavigation';
import { ChevronRight, Check, ChevronDown, Crown, Play, RotateCcw } from 'lucide-react';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { getSetting, setSetting, clearAllSettings } from '@/utils/settingsStorage';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useDarkMode, themes, ThemeId } from '@/hooks/useDarkMode';
import { languages } from '@/i18n';
import { TasksSettingsSheet } from '@/components/TasksSettingsSheet';
import { NotesSettingsSheet } from '@/components/NotesSettingsSheet';
import { NoteTypeVisibilitySheet } from '@/components/NoteTypeVisibilitySheet';
import { CustomizeTodoNavigationSheet } from '@/components/CustomizeTodoNavigationSheet';
import { WidgetSettingsSheet } from '@/components/WidgetSettingsSheet';
import { ToolbarOrderManager, useToolbarOrder } from '@/components/ToolbarOrderManager';
import { AppLockSettingsSheet } from '@/components/AppLockSettingsSheet';
import { AppLockSetup } from '@/components/AppLockSetup';
import { downloadBackup, downloadData, restoreFromBackup } from '@/utils/dataBackup';
import { createNativeBackup, isNativePlatform } from '@/utils/nativeBackup';
import { BackupSuccessDialog } from '@/components/BackupSuccessDialog';
import { FeedbackDialog } from '@/components/FeedbackDialog';
import {
  COMPLETION_RINGTONE_OPTIONS,
  CompletionRingtoneId,
  getCompletionRingtone,
  isCompletionSoundEnabled,
  previewCompletionRingtone,
  setCompletionRingtone,
  setCompletionSoundEnabled,
  setCompletionSoundVolume,
} from '@/utils/taskSounds';
import {
  resetVirtualizationSettings,
  useVirtualizationSettings,
  VirtualizationSettings,
} from '@/utils/virtualizationSettings';


import { Capacitor } from '@capacitor/core';
import { AppLogo } from '@/components/AppLogo';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from '@/components/ui/scroll-area';

const TodoSettings = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { currentTheme, setTheme } = useDarkMode();
  const { requireFeature, isPro, openPaywall } = useSubscription();
  const toolbarOrder = useToolbarOrder();
  const [virtualizationSettings, setVirtualizationSettings] = useVirtualizationSettings();
  
  // Dialog states
  const [showThemeDialog, setShowThemeDialog] = useState(false);
  const [showLanguageDialog, setShowLanguageDialog] = useState(false);
  const [showTasksSettingsSheet, setShowTasksSettingsSheet] = useState(false);
  const [showNotesSettingsSheet, setShowNotesSettingsSheet] = useState(false);
  const [showNoteTypeVisibilitySheet, setShowNoteTypeVisibilitySheet] = useState(false);
  const [showCustomizeNavigationSheet, setShowCustomizeNavigationSheet] = useState(false);
  const [showWidgetSettingsSheet, setShowWidgetSettingsSheet] = useState(false);
  const [showAppLockSettingsSheet, setShowAppLockSettingsSheet] = useState(false);
  const [showAppLockSetup, setShowAppLockSetup] = useState(false);
  const [showNotificationsExpanded, setShowNotificationsExpanded] = useState(false);
  const [showMoreTabsExpanded, setShowMoreTabsExpanded] = useState(false);
  const [showPerformanceExpanded, setShowPerformanceExpanded] = useState(false);
  const [showCompletionSoundsExpanded, setShowCompletionSoundsExpanded] = useState(false);
  const [showQuickAddDialog, setShowQuickAddDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [showBackupSuccessDialog, setShowBackupSuccessDialog] = useState(false);
  const [backupFilePath, setBackupFilePath] = useState('');
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [showTermsDialog, setShowTermsDialog] = useState(false);
  const [showPrivacyDialog, setShowPrivacyDialog] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
  const [showDeleteAccountDialog, setShowDeleteAccountDialog] = useState(false);
  const [deleteAccountConfirmText, setDeleteAccountConfirmText] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteResult, setDeleteResult] = useState<null | { ok: boolean; message: string }>(null);
  
  // Notification settings
  const [taskRemindersEnabled, setTaskRemindersEnabled] = useState(true);
  const [noteRemindersEnabled, setNoteRemindersEnabled] = useState(true);
  const [dailyDigestEnabled, setDailyDigestEnabled] = useState(false);
  const [overdueAlertsEnabled, setOverdueAlertsEnabled] = useState(true);
  const [completionSoundEnabled, setCompletionSoundEnabledState] = useState(true);
  const [completionRingtone, setCompletionRingtoneState] = useState<CompletionRingtoneId>('flowist-bell');
  const [completionVolume, setCompletionVolumeState] = useState(0.5);
  const currentLanguage = languages.find(l => l.code === i18n.language) || languages[0];

  // Load settings
  useEffect(() => {
    getSetting<boolean>('taskRemindersEnabled', true).then(setTaskRemindersEnabled);
    getSetting<boolean>('noteRemindersEnabled', true).then(setNoteRemindersEnabled);
    getSetting<boolean>('dailyDigestEnabled', false).then(setDailyDigestEnabled);
    getSetting<boolean>('overdueAlertsEnabled', true).then(setOverdueAlertsEnabled);
    isCompletionSoundEnabled().then(setCompletionSoundEnabledState);
    getCompletionRingtone().then(setCompletionRingtoneState);
    getSetting<number>('taskCompletionVolume', 0.5).then((v) => setCompletionVolumeState(Math.max(0, Math.min(1, Number(v) || 0.5))));
    
  }, []);

  const handleLanguageChange = async (langCode: string) => {
    i18n.changeLanguage(langCode);
    await setSetting('flowist_language', langCode);
    const lang = languages.find(l => l.code === langCode);
    toast.success(t('settings.languageChanged', { language: lang?.nativeName || langCode }));
    setShowLanguageDialog(false);
  };

  const handleTaskRemindersToggle = async (enabled: boolean) => {
    setTaskRemindersEnabled(enabled);
    await setSetting('taskRemindersEnabled', enabled);
    toast.success(enabled ? t('settings.taskRemindersEnabled', 'Task reminders enabled') : t('settings.taskRemindersDisabled', 'Task reminders disabled'));
  };

  const handleNoteRemindersToggle = async (enabled: boolean) => {
    setNoteRemindersEnabled(enabled);
    await setSetting('noteRemindersEnabled', enabled);
    toast.success(enabled ? t('settings.noteRemindersEnabled', 'Note reminders enabled') : t('settings.noteRemindersDisabled', 'Note reminders disabled'));
  };

  const handleDailyDigestToggle = async (enabled: boolean) => {
    setDailyDigestEnabled(enabled);
    await setSetting('dailyDigestEnabled', enabled);
    toast.success(enabled ? t('settings.dailyDigestEnabled', 'Daily digest enabled') : t('settings.dailyDigestDisabled', 'Daily digest disabled'));
  };

  const handleOverdueAlertsToggle = async (enabled: boolean) => {
    setOverdueAlertsEnabled(enabled);
    await setSetting('overdueAlertsEnabled', enabled);
    toast.success(enabled ? t('settings.overdueAlertsEnabled', 'Overdue alerts enabled') : t('settings.overdueAlertsDisabled', 'Overdue alerts disabled'));
  };

  const handleCompletionSoundToggle = (enabled: boolean) => {
    setCompletionSoundEnabledState(enabled);
    setCompletionSoundEnabled(enabled);
    toast.success(enabled ? 'Task completion sound enabled' : 'Task completion sound disabled');
  };

  const handleRingtoneChange = (ringtone: CompletionRingtoneId) => {
    setCompletionRingtoneState(ringtone);
    setCompletionRingtone(ringtone);
    previewCompletionRingtone(ringtone);
    toast.success('Completion ringtone updated');
  };

  const handleVolumeChange = (value: number) => {
    const next = Math.max(0, Math.min(1, value));
    setCompletionVolumeState(next);
    setCompletionSoundVolume(next);
  };

  const updateVirtualization = (updater: (current: VirtualizationSettings) => VirtualizationSettings) => {
    setVirtualizationSettings(updater(virtualizationSettings));
  };



  const handleBackupData = async () => {
    if (isBackingUp) return;
    setIsBackingUp(true);
    try {
      if (isNativePlatform()) {
        const result = await createNativeBackup();
        if (result.success && result.filePath) {
          setBackupFilePath(result.filePath);
          setShowBackupSuccessDialog(true);
        } else {
          toast.error(result.error || t('toasts.backupFailed'));
        }
      } else {
        await downloadBackup();
        toast.success(t('toasts.dataBackedUp'));
      }
    } catch (error) {
      console.error('Backup error:', error);
      toast.error(t('toasts.backupFailed'));
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestoreData = () => setShowRestoreDialog(true);

  const confirmRestoreData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const result = await restoreFromBackup(file);
        if (result.success) {
          const stats = result.stats;
          toast.success(t('toasts.dataRestored'));
          setTimeout(() => window.location.reload(), 1000);
        } else {
          toast.error(result.error || t('toasts.restoreFailed'));
        }
      }
    };
    input.click();
    setShowRestoreDialog(false);
  };

  const handleDownloadData = async () => {
    try {
      await downloadData();
      toast.success(t('toasts.dataDownloaded'));
    } catch (error) {
      toast.error(t('toasts.downloadFailed'));
    }
  };


  const handleDeleteData = () => setShowDeleteDialog(true);

  const handleDeleteAccount = async () => {
    if (isDeletingAccount) return;
    setIsDeletingAccount(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error(t('settings.notSignedIn', 'You are not signed in.'));
        setIsDeletingAccount(false);
        return;
      }
      const { error } = await supabase.functions.invoke('delete-account', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;

      // Best-effort: wipe Drive data
      try {
        const { deleteAllDriveData, stopAutoSync } = await import('@/utils/googleDriveSync');
        stopAutoSync();
        await deleteAllDriveData();
      } catch (e) { console.warn('Drive cleanup failed:', e); }

      // Sign out of Supabase + native Google (best-effort)
      try { await supabase.auth.signOut(); } catch {}
      try {
        const { signOutGoogle } = await import('@/utils/googleAuth');
        await signOutGoogle();
      } catch {}
      // Clear all local state
      try { await clearAllSettings(); } catch {}
      try {
        const dbs = (await (window.indexedDB as any).databases?.()) || [];
        for (const db of dbs) { if (db?.name) window.indexedDB.deleteDatabase(db.name); }
      } catch {}
      try { localStorage.clear(); } catch {}
      try { sessionStorage.clear(); } catch {}
      try {
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      } catch {}

      setShowDeleteAccountDialog(false);
      setDeleteAccountConfirmText('');
      setDeleteResult({ ok: true, message: t('settings.accountDeleted', 'Account deleted successfully') });
    } catch (err: any) {
      console.error('Account deletion failed:', err);
      setDeleteResult({
        ok: false,
        message: err?.message || t('settings.accountDeleteFailed', 'Failed to delete account'),
      });
    } finally {
      setIsDeletingAccount(false);
    }
  };


  const confirmDeleteData = async () => {
    // Delete all data from Google Drive first
    try {
      const { deleteAllDriveData } = await import('@/utils/googleDriveSync');
      await deleteAllDriveData();
    } catch (e) { console.warn('Drive cleanup failed:', e); }
    await clearAllSettings();
    const dbs = await window.indexedDB.databases?.() || [];
    for (const db of dbs) {
      if (db.name) window.indexedDB.deleteDatabase(db.name);
    }
    localStorage.clear();
    toast.success(t('toasts.dataDeleted'));
    setShowDeleteDialog(false);
    setTimeout(() => window.location.href = '/', 1000);
  };

  const handleShareApp = () => {
    const shareUrl = 'https://flowist.me/download';
    if (navigator.share) {
      navigator.share({
        title: t('share.appTitle'),
        text: t('share.appDescription'),
        url: shareUrl
      });
    } else {
      navigator.clipboard.writeText(shareUrl).then(() => {
        toast.success(t('toasts.linkCopied', 'Link copied to clipboard!'));
      }).catch(() => {
        window.open(shareUrl, '_blank');
      });
    }
  };

  const handleRateAndShare = () => {
    window.open('https://flowist.me/download', '_blank');
  };

  // Settings row component
  const SettingsRow = ({ label, value, onClick, dataTour }: { label: React.ReactNode; value?: string; onClick: () => void; dataTour?: string }) => (
    <button
      onClick={onClick}
      data-tour={dataTour}
      className="w-full flex items-center justify-between px-4 py-3 border-b border-border hover:bg-muted transition-colors"
    >
      <span className="text-foreground text-sm">{label}</span>
      <div className="flex items-center gap-2">
        {value && <span className="text-muted-foreground text-sm">{value}</span>}
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </button>
  );

  // Section heading component
  const SectionHeading = ({ title }: { title: string }) => (
    <div className="px-4 py-2 bg-muted/50">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</span>
    </div>
  );

  const RangeSetting = ({
    label,
    value,
    min,
    max,
    step = 1,
    onChange,
    suffix = '',
  }: {
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    onChange: (value: number) => void;
    suffix?: string;
  }) => (
    <div className="px-4 py-3 border-b border-border/50">
      <div className="flex items-center justify-between gap-3 mb-2">
        <span className="text-foreground text-sm">{label}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{value}{suffix}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </div>
  );

  return (
    <div className="min-h-screen min-h-screen-dynamic bg-background pb-14">
      <header className="sticky top-0 bg-background z-10" style={{ paddingTop: 'var(--safe-top, 0px)', paddingLeft: 'var(--safe-left, 0px)', paddingRight: 'var(--safe-right, 0px)' }}>
        <div className="container mx-auto px-2 xs:px-3 sm:px-4 py-2 xs:py-3 sm:py-4">
          <div className="flex items-center gap-1.5 xs:gap-2 min-w-0">
            <AppLogo size="sm" />
            <h1 className="text-base xs:text-lg sm:text-xl font-bold truncate">{t('settings.taskSettings', 'Task Settings')}</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-2 xs:px-3 sm:px-4 py-3 xs:py-4 sm:py-6">
        <div className="max-w-2xl mx-auto space-y-4">
          {/* Upgrade to Pro */}
          {!isPro && (
            <button
              onClick={() => openPaywall()}
              className="w-full flex items-center justify-between px-4 py-3.5 rounded-lg border-2 border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors"
            >
              <span className="text-sm font-medium flex items-center gap-2" style={{ color: 'hsl(var(--primary))' }}>
                <Crown className="h-4 w-4" fill="#FFD700" color="#FFD700" />
                {t('settings.upgradeToPro', 'Upgrade to Flowist Pro')}
              </span>
              <ChevronRight className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
            </button>
          )}

          {/* Preferences Section */}
          <div className="border border-border rounded-lg overflow-hidden">
            <SectionHeading title={t('settings.preferences', 'Preferences')} />
            <SettingsRow 
              label={t('settings.theme', 'Theme')} 
              value={themes.find(th => th.id === currentTheme)?.name}
              onClick={() => setShowThemeDialog(true)} 
            />
            <SettingsRow 
              label={t('settings.language', 'Language')} 
              value={currentLanguage.nativeName}
              onClick={() => setShowLanguageDialog(true)} 
            />
            <SettingsRow 
              dataTour="settings-note-type-visibility"
              label={
                <span className="inline-flex items-center gap-1.5">
                  {t('settings.noteTypeVisibility', 'Note Type Visibility')}
                  {!isPro && <Crown className="h-3.5 w-3.5" fill="#FFD700" color="#FFD700" />}
                </span>
              }
              onClick={() => { if (requireFeature('notes_type_visibility')) setShowNoteTypeVisibilitySheet(true); }} 
            />
            <SettingsRow 
              label={t('settings.notesSettings', 'Notes Settings')}
              onClick={() => setShowNotesSettingsSheet(true)} 
            />
            <SettingsRow 
              label={t('settings.tasksSettings', 'Task Defaults & Display')}
              onClick={() => setShowTasksSettingsSheet(true)} 
            />
            <SettingsRow 
              dataTour="settings-customize-navigation"
              label={t('settings.customizeNavigation', 'Customize Navigation')}
              onClick={() => setShowCustomizeNavigationSheet(true)} 
            />
            <button
              data-tour="settings-more-tabs"
              onClick={() => setShowMoreTabsExpanded(!showMoreTabsExpanded)}
              className="w-full flex items-center justify-between px-4 py-3 border-b border-border hover:bg-muted transition-colors"
            >
              <span className="text-foreground text-sm">{t('settings.moreTabs', 'More Tabs')}</span>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", showMoreTabsExpanded && "rotate-180")} />
            </button>
            {showMoreTabsExpanded && (
              <div className="bg-muted/30">
                <button
                  data-tour="settings-habit-tracker"
                  onClick={() => navigate('/todo/habits')}
                  className="w-full flex items-center justify-between px-6 py-3 border-b border-border/50 hover:bg-muted transition-colors"
                >
                  <span className="text-foreground text-sm">{t('settings.habitTracker', 'Habit Tracker')}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
                <button
                  data-tour="settings-eisenhower-matrix"
                  onClick={() => navigate('/todo/matrix')}
                  className="w-full flex items-center justify-between px-6 py-3 border-b border-border/50 hover:bg-muted transition-colors"
                >
                  <span className="text-foreground text-sm">{t('settings.eisenhowerMatrix', 'Eisenhower Matrix')}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
                <button
                  onClick={() => navigate('/todo/countdown')}
                  className="w-full flex items-center justify-between px-6 py-3 border-b border-border/50 hover:bg-muted transition-colors"
                >
                  <span className="text-foreground text-sm">{t('settings.countdown', 'Countdown')}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            )}
          </div>





          <div className="border border-border rounded-lg overflow-hidden">
            <SectionHeading title={t('settings.security', 'Security')} />
            <SettingsRow 
              label={t('settings.appLock', 'App Lock')}
              onClick={() => { if (requireFeature('app_lock')) setShowAppLockSettingsSheet(true); }} 
            />
          </div>

          {/* Data Management Section */}
          <div className="border border-border rounded-lg overflow-hidden">
            <SectionHeading title={t('settings.dataManagement', 'Data Management')} />
            <button
              onClick={() => { if (requireFeature('backup')) handleBackupData(); }}
              disabled={isBackingUp}
              className="w-full flex items-center justify-between px-4 py-3 border-b border-border hover:bg-muted transition-colors disabled:opacity-50"
            >
              <span className="text-foreground text-sm flex items-center gap-1">
                {isBackingUp ? t('settings.backingUp', 'Backing up...') : t('settings.backupData')}
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
            <SettingsRow label={t('settings.restoreData')} onClick={handleRestoreData} />
            <SettingsRow label={t('settings.downloadData')} onClick={handleDownloadData} />
            <SettingsRow label={t('settings.deleteData')} onClick={handleDeleteData} />
            <button
              onClick={() => { setDeleteAccountConfirmText(''); setShowDeleteAccountDialog(true); }}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted transition-colors"
            >
              <span className="text-destructive text-sm font-medium">
                {t('settings.deleteAccount', 'Delete Account')}
              </span>
              <ChevronRight className="h-4 w-4 text-destructive/70" />
            </button>
          </div>

          {/* About & Support Section */}
          <div className="border border-border rounded-lg overflow-hidden">
            <SectionHeading title={t('settings.aboutSupport', 'About & Support')} />
            <SettingsRow label={t('settings.termsOfService')} onClick={() => navigate('/terms-and-conditions')} />
            <SettingsRow label={t('settings.privacy')} onClick={() => navigate('/privacy-policy')} />

          </div>
        </div>
      </main>

      {/* Theme Dialog */}
      <Dialog open={showThemeDialog} onOpenChange={setShowThemeDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('settings.selectTheme', 'Select Theme')}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-1">
              {themes.map((theme) => (
                (() => {
                  const isLocked = theme.id !== 'light' && theme.id !== 'dark' && !isPro;
                  return <button
                    key={theme.id}
                    onClick={() => {
                    if (isLocked) {
                      setShowThemeDialog(false);
                      openPaywall('dark_theme_extra');
                      return;
                    }
                    setTheme(theme.id);
                    setShowThemeDialog(false);
                    toast.success(t('settings.themeChanged', { theme: theme.name }));
                  }}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-3 rounded-lg transition-colors",
                    currentTheme === theme.id ? "bg-primary/10 text-primary" : "hover:bg-muted"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn("w-6 h-6 rounded-full border-2 border-border", theme.preview)} />
                    <span className="text-sm font-medium">{theme.name}</span>
                    {isLocked && <Crown className="h-3.5 w-3.5" fill="#FFD700" color="#FFD700" />}
                  </div>
                  {currentTheme === theme.id && <Check className="h-4 w-4" />}
                  </button>;
                })()
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Language Dialog */}
      <Dialog open={showLanguageDialog} onOpenChange={setShowLanguageDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('settings.selectLanguage', 'Select Language')}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-1">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => handleLanguageChange(lang.code)}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-3 rounded-lg transition-colors",
                    i18n.language === lang.code ? "bg-primary/10 text-primary" : "hover:bg-muted"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="text-left">
                      <span className="text-sm font-medium block">{lang.nativeName}</span>
                      <span className="text-xs text-muted-foreground">{lang.name}</span>
                    </div>
                  </div>
                  {i18n.language === lang.code && <Check className="h-4 w-4" />}
                </button>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>


      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('dialogs.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p className="font-semibold text-destructive">⚠️ {t('dialogs.deleteWarning')}</p>
              <p>{t('dialogs.deleteDesc')}</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>{t('dialogs.deleteNotes')}</li>
                <li>{t('dialogs.deleteSettings')}</li>
                <li>{t('dialogs.deleteLocal')}</li>
              </ul>
              <p className="font-medium mt-2">{t('dialogs.deleteConfirm')}</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteData} className="bg-destructive hover:bg-destructive/90">
              {t('dialogs.deleteEverything')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore Confirmation Dialog */}
      <AlertDialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('dialogs.restoreTitle')}</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p className="font-semibold text-orange-600">⚠️ {t('dialogs.restoreNotice')}</p>
              <p>{t('dialogs.restoreDesc')}</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>{t('dialogs.restoreReplace')}</li>
                <li>{t('dialogs.restoreOverwrite')}</li>
                <li>{t('dialogs.restoreReload')}</li>
              </ul>
              <p className="font-medium mt-2">{t('dialogs.restoreBackup')}</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRestoreData}>
              {t('dialogs.continueRestore')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Account Dialog */}
      <AlertDialog open={showDeleteAccountDialog} onOpenChange={setShowDeleteAccountDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">{t('settings.deleteAccount', 'Delete Account')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.deleteAccountWarning', 'This will permanently delete your account and all associated data. This action cannot be undone. Type DELETE to confirm.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <input
            type="text"
            value={deleteAccountConfirmText}
            onChange={(e) => setDeleteAccountConfirmText(e.target.value)}
            placeholder={t('settings.typeDelete', 'Type DELETE to confirm')}
            className="w-full px-3 py-2 border border-border rounded-lg bg-background text-foreground text-sm"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteAccountConfirmText !== 'DELETE' || isDeletingAccount}
              onClick={handleDeleteAccount}
              className="bg-destructive hover:bg-destructive/90 disabled:opacity-50 disabled:pointer-events-none"
            >
              {isDeletingAccount ? t('common.loading', 'Please wait…') : t('settings.deleteAccount', 'Delete Account')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Account Result Dialog */}
      <AlertDialog
        open={!!deleteResult}
        onOpenChange={(open) => {
          if (!open) {
            const wasOk = deleteResult?.ok;
            setDeleteResult(null);
            if (wasOk) window.location.href = '/';
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className={deleteResult?.ok ? '' : 'text-destructive'}>
              {deleteResult?.ok
                ? t('settings.accountDeletedTitle', 'Account Deleted')
                : t('settings.accountDeleteFailedTitle', 'Deletion Failed')}
            </AlertDialogTitle>
            <AlertDialogDescription>{deleteResult?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                const wasOk = deleteResult?.ok;
                setDeleteResult(null);
                if (wasOk) window.location.href = '/';
              }}
            >
              {t('common.ok', 'OK')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Terms of Service Dialog */}
      <Dialog open={showTermsDialog} onOpenChange={setShowTermsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{t('terms.title')}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh] pr-4">
            <div className="space-y-4 text-sm">
              <section>
                <h3 className="font-semibold mb-2">1. {t('terms.acceptance')}</h3>
                <p className="text-muted-foreground">{t('terms.acceptanceDesc')}</p>
              </section>
              <section>
                <h3 className="font-semibold mb-2">2. {t('terms.license')}</h3>
                <p className="text-muted-foreground">{t('terms.licenseDesc')}</p>
              </section>
              <section>
                <h3 className="font-semibold mb-2">3. {t('terms.userData')}</h3>
                <p className="text-muted-foreground">{t('terms.userDataDesc')}</p>
              </section>
              <section>
                <h3 className="font-semibold mb-2">4. {t('terms.disclaimer')}</h3>
                <p className="text-muted-foreground">{t('terms.disclaimerDesc')}</p>
              </section>
              <section>
                <h3 className="font-semibold mb-2">5. {t('terms.limitations')}</h3>
                <p className="text-muted-foreground">{t('terms.limitationsDesc')}</p>
              </section>
              <section>
                <h3 className="font-semibold mb-2">6. {t('terms.modifications')}</h3>
                <p className="text-muted-foreground">{t('terms.modificationsDesc')}</p>
              </section>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Privacy Policy Dialog */}
      <Dialog open={showPrivacyDialog} onOpenChange={setShowPrivacyDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{t('privacy.title')}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh] pr-4">
            <div className="space-y-4 text-sm">
              <section>
                <h3 className="font-semibold mb-2">1. {t('privacy.infoCollect')}</h3>
                <p className="text-muted-foreground">{t('privacy.infoCollectDesc')}</p>
              </section>
              <section>
                <h3 className="font-semibold mb-2">2. {t('privacy.localStorage')}</h3>
                <p className="text-muted-foreground">{t('privacy.localStorageDesc')}</p>
              </section>
              <section>
                <h3 className="font-semibold mb-2">3. {t('privacy.dataSecurity')}</h3>
                <p className="text-muted-foreground">{t('privacy.dataSecurityDesc')}</p>
              </section>
              <section>
                <h3 className="font-semibold mb-2">4. {t('privacy.thirdParty')}</h3>
                <p className="text-muted-foreground">{t('privacy.thirdPartyDesc')}</p>
              </section>
              <section>
                <h3 className="font-semibold mb-2">5. {t('privacy.dataBackup')}</h3>
                <p className="text-muted-foreground">{t('privacy.dataBackupDesc')}</p>
              </section>
              <section>
                <h3 className="font-semibold mb-2">6. {t('privacy.changes')}</h3>
                <p className="text-muted-foreground">{t('privacy.changesDesc')}</p>
              </section>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Help and Feedback Dialog */}
      <Dialog open={showHelpDialog} onOpenChange={setShowHelpDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{t('help.title')}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh] pr-4">
            <div className="space-y-4 text-sm">
              <section>
                <h3 className="font-semibold mb-2">{t('help.gettingStarted')}</h3>
                <p className="text-muted-foreground">{t('help.gettingStartedDesc')}</p>
              </section>
              <section>
                <h3 className="font-semibold mb-2">{t('help.organizing')}</h3>
                <p className="text-muted-foreground">{t('help.organizingDesc')}</p>
              </section>
              <section>
                <h3 className="font-semibold mb-2">{t('help.backupRestore')}</h3>
                <p className="text-muted-foreground">{t('help.backupRestoreDesc')}</p>
              </section>
              <section>
                <h3 className="font-semibold mb-2">{t('help.commonIssues')}</h3>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>{t('help.issueNotSaving')}</li>
                  <li>{t('help.issueSlow')}</li>
                  <li>{t('help.issueLostData')}</li>
                </ul>
              </section>
              <section>
                <h3 className="font-semibold mb-2">{t('help.contactSupport')}</h3>
                <p className="text-muted-foreground">{t('help.contactSupportDesc')}</p>
              </section>
              <section>
                <h3 className="font-semibold mb-2">{t('help.feedback')}</h3>
                <p className="text-muted-foreground">{t('help.feedbackDesc')}</p>
              </section>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Sheets */}
      <TasksSettingsSheet isOpen={showTasksSettingsSheet} onClose={() => setShowTasksSettingsSheet(false)} />
      <NotesSettingsSheet isOpen={showNotesSettingsSheet} onClose={() => setShowNotesSettingsSheet(false)} />
      <NoteTypeVisibilitySheet isOpen={showNoteTypeVisibilitySheet} onClose={() => setShowNoteTypeVisibilitySheet(false)} />
      <CustomizeTodoNavigationSheet isOpen={showCustomizeNavigationSheet} onClose={() => setShowCustomizeNavigationSheet(false)} />
      <WidgetSettingsSheet isOpen={showWidgetSettingsSheet} onClose={() => setShowWidgetSettingsSheet(false)} />

      <AppLockSettingsSheet
        open={showAppLockSettingsSheet}
        onOpenChange={setShowAppLockSettingsSheet}
        onSetupLock={() => {
          setShowAppLockSettingsSheet(false);
          setShowAppLockSetup(true);
        }}
      />

      {showAppLockSetup && (
        <AppLockSetup
          onComplete={() => setShowAppLockSetup(false)}
          onCancel={() => setShowAppLockSetup(false)}
        />
      )}

      <ToolbarOrderManager
        isOpen={toolbarOrder.isManagerOpen}
        onOpenChange={toolbarOrder.setIsManagerOpen}
        onOrderChange={toolbarOrder.updateOrder}
        onVisibilityChange={toolbarOrder.updateVisibility}
        currentOrder={toolbarOrder.order}
        currentVisibility={toolbarOrder.visibility}
      />

      <BackupSuccessDialog
        isOpen={showBackupSuccessDialog}
        onClose={() => setShowBackupSuccessDialog(false)}
        filePath={backupFilePath}
      />

      

      <TodoBottomNavigation />
    </div>
  );
};

export default TodoSettings;
