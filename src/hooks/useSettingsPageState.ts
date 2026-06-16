/**
 * useSettingsPageState — All state and handlers for the Settings page.
 * Extracted from Settings.tsx to reduce file size.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useDarkMode, themes, ThemeId } from '@/hooks/useDarkMode';
import { useToolbarOrder } from '@/components/ToolbarOrderManager';
import { languages } from '@/i18n';
import { Capacitor } from '@capacitor/core';
import { differenceInMinutes, addDays } from 'date-fns';
import { Note } from '@/types/note';
import { loadNotesFromDB } from '@/utils/noteStorage';
import { downloadBackup, downloadData, restoreFromBackup } from '@/utils/dataBackup';
import { createNativeBackup, isNativePlatform } from '@/utils/nativeBackup';
import { getSetting, setSetting, clearAllSettings } from '@/utils/settingsStorage';
import { getActiveCustomThemeId, applyCustomTheme, getCustomThemes, setActiveCustomThemeId, clearCustomThemeStyles, CustomTheme } from '@/utils/customThemeStorage';

export const useSettingsPageState = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { isPro, isPro: isProSub, customerInfo, presentPaywall, presentCustomerCenter, restorePurchases, isInitialized, requireFeature } = useSubscription();
  const { currentTheme, setTheme } = useDarkMode();
  const toolbarOrder = useToolbarOrder();

  // Dialog visibility states
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDeleteAccountDialog, setShowDeleteAccountDialog] = useState(false);
  const [deleteAccountConfirmText, setDeleteAccountConfirmText] = useState('');
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [showTermsDialog, setShowTermsDialog] = useState(false);
  const [showPrivacyDialog, setShowPrivacyDialog] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [showThemeDialog, setShowThemeDialog] = useState(false);
  const [showLanguageDialog, setShowLanguageDialog] = useState(false);

  // Sheet visibility states
  const [showNoteTypeVisibilitySheet, setShowNoteTypeVisibilitySheet] = useState(false);
  const [showNotesSettingsSheet, setShowNotesSettingsSheet] = useState(false);
  const [showTasksSettingsSheet, setShowTasksSettingsSheet] = useState(false);
  const [showCustomizeNavigationSheet, setShowCustomizeNavigationSheet] = useState(false);
  const [showWidgetSettingsSheet, setShowWidgetSettingsSheet] = useState(false);
  const [showAppLockSettingsSheet, setShowAppLockSettingsSheet] = useState(false);
  const [showAppLockSetup, setShowAppLockSetup] = useState(false);
  const [showBackupSuccessDialog, setShowBackupSuccessDialog] = useState(false);
  const [showImportSheet, setShowImportSheet] = useState(false);
  const [showCustomThemeSheet, setShowCustomThemeSheet] = useState(false);
  const [showQuickAddDialog, setShowQuickAddDialog] = useState(false);

  // Data states
  const [backupFilePath, setBackupFilePath] = useState('');
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [activeCustomThemeId, setActiveCustomThemeIdState] = useState<string | null>(null);
  const [hapticIntensity, setHapticIntensity] = useState<'off' | 'light' | 'medium' | 'heavy'>('medium');
  const [notes, setNotes] = useState<Note[]>([]);
  const [hasAdminAccess, setHasAdminAccess] = useState(false);
  const [trialRemaining, setTrialRemaining] = useState<{ days: number; hours: number; minutes: number } | null>(null);
  const [hasShownTrialWarning, setHasShownTrialWarning] = useState(false);

  const isProUser = isPro || hasAdminAccess;
  const currentLanguage = languages.find(l => l.code === i18n.language) || languages[0];

  // Load settings
  useEffect(() => {
    getSetting<'off' | 'light' | 'medium' | 'heavy'>('haptic_intensity', 'medium').then(setHapticIntensity);
    getActiveCustomThemeId().then(async (id) => {
      setActiveCustomThemeIdState(id);
      if (id) {
        const allThemes = await getCustomThemes();
        const active = allThemes.find(t => t.id === id);
        if (active) applyCustomTheme(active);
      }
    });
  }, []);

  // Load notes
  useEffect(() => {
    loadNotesFromDB().then(setNotes).catch(console.error);
  }, []);

  // Admin bypass check
  useEffect(() => {
    getSetting<boolean>('flowist_admin_bypass', false).then(setHasAdminAccess);
  }, []);

  // Trial countdown
  useEffect(() => {
    const loadTrialData = async () => {
      const trialStartStr = await getSetting<string | null>('flowist_trial_start', null);
      if (trialStartStr && isProUser && !hasAdminAccess) {
        const trialStart = new Date(trialStartStr);
        const trialEnd = addDays(trialStart, 3);
        const updateCountdown = () => {
          const now = new Date();
          if (now < trialEnd) {
            const totalMinutesRemaining = differenceInMinutes(trialEnd, now);
            const days = Math.floor(totalMinutesRemaining / (24 * 60));
            const hours = Math.floor((totalMinutesRemaining % (24 * 60)) / 60);
            const minutes = totalMinutesRemaining % 60;
            setTrialRemaining({ days, hours, minutes });
            const sessionWarningShown = sessionStorage.getItem('flowist_trial_warning_shown');
            if (days === 0 && !sessionWarningShown && !hasShownTrialWarning) {
              toast({ title: `⏰ ${t('trial.endingSoon')}`, description: t('trial.expiresIn', { hours, minutes }), duration: 10000 });
              sessionStorage.setItem('flowist_trial_warning_shown', 'true');
              setHasShownTrialWarning(true);
            }
          } else {
            setTrialRemaining(null);
          }
        };
        updateCountdown();
        const interval = setInterval(updateCountdown, 60000);
        return () => clearInterval(interval);
      }
    };
    loadTrialData();
  }, [isProUser, hasAdminAccess, hasShownTrialWarning, toast, t]);

  // ── Handlers ──

  const handleLanguageChange = async (langCode: string) => {
    i18n.changeLanguage(langCode);
    await setSetting('flowist_language', langCode);
    const lang = languages.find(l => l.code === langCode);
    toast({ title: t('settings.languageChanged', { language: lang?.nativeName || langCode }) });
    setShowLanguageDialog(false);
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
          toast({ title: t('toasts.backupFailed'), description: result.error, variant: "destructive" });
        }
      } else {
        await downloadBackup();
        toast({ title: t('toasts.dataBackedUp') });
      }
    } catch (error) {
      console.error('Backup error:', error);
      toast({ title: t('toasts.backupFailed'), variant: "destructive" });
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
          toast({ title: t('toasts.dataRestored'), description: stats ? t('toasts.restoredStats', 'Restored {{notes}} notes, {{tasks}} tasks, {{folders}} folders', { notes: stats.notes, tasks: stats.tasks, folders: stats.folders }) : undefined });
          setTimeout(() => window.location.reload(), 1000);
        } else {
          toast({ title: t('toasts.restoreFailed'), description: result.error, variant: "destructive" });
        }
      }
    };
    input.click();
    setShowRestoreDialog(false);
  };

  const handleDownloadData = async () => {
    try {
      await downloadData();
      toast({ title: t('toasts.dataDownloaded') });
    } catch (error) {
      console.error('Download error:', error);
      toast({ title: t('toasts.downloadFailed'), variant: "destructive" });
    }
  };

  const handleDeleteData = () => setShowDeleteDialog(true);

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
    toast({ title: t('toasts.dataDeleted') });
    setShowDeleteDialog(false);
    setTimeout(() => window.location.href = '/', 1000);
  };

  const handleDeleteAccount = async () => {
    try {
      // Delete all data from Google Drive
      try {
        const { deleteAllDriveData, stopAutoSync } = await import('@/utils/googleDriveSync');
        stopAutoSync();
        await deleteAllDriveData();
      } catch (e) { console.warn('Drive cleanup failed:', e); }

      // Sign out from Supabase
      try {
        const { supabase } = await import('@/lib/supabase');
        await supabase.auth.signOut();
      } catch (authErr) {
        console.warn('Failed to sign out from Supabase:', authErr);
      }

      // Clear in-app profile
      try {
        const { saveUserProfile } = await import('@/hooks/useUserProfile');
        await saveUserProfile({ name: '', avatarUrl: '', coverUrl: '' });
      } catch {}

      // Revoke pro access
      try {
        await setSetting('flowist_admin_bypass', false);
      } catch {}

      // Clear ALL local data
      await clearAllSettings();
      const dbs = await window.indexedDB.databases?.() || [];
      for (const db of dbs) {
        if (db.name) window.indexedDB.deleteDatabase(db.name);
      }
      localStorage.clear();
      sessionStorage.clear();

      toast({ title: t('toasts.accountDeleted', 'Account deleted successfully') });
      setShowDeleteAccountDialog(false);
      setTimeout(() => { window.location.href = '/'; }, 1500);
    } catch (error) {
      console.error('Account deletion error:', error);
      toast({ title: t('toasts.accountDeleteFailed', 'Failed to delete account'), variant: 'destructive' });
    }
  };

  const handleShareApp = () => {
    const shareUrl = 'https://play.google.com/store/apps/details?id=nota.npd.com';
    if (navigator.share) {
      navigator.share({ title: t('share.appTitle'), text: t('share.appDescription'), url: shareUrl });
    } else {
      navigator.clipboard.writeText(shareUrl).then(() => {
        toast({ title: t('toasts.linkCopied', 'Link copied to clipboard!') });
      }).catch(() => { window.open(shareUrl, '_blank'); });
    }
  };

  const handleRestorePurchases = async () => {
    setIsRestoring(true);
    try {
      await restorePurchases();
      toast({ title: t('toasts.purchasesRestored') });
    } catch (error) {
      toast({ title: t('toasts.purchasesFailed'), variant: "destructive" });
    } finally {
      setIsRestoring(false);
    }
  };

  const handleManageSubscription = async () => {
    if (Capacitor.isNativePlatform()) {
      await presentCustomerCenter();
    } else {
      window.open('https://play.google.com/store/account/subscriptions', '_blank');
    }
  };

  const handleRateAndShare = () => {
    window.open('https://play.google.com/store/apps/details?id=nota.npd.com', '_blank');
  };

  const handleCustomThemeSelect = async (theme: CustomTheme) => {
    const allClasses = ['dark', 'ocean', 'forest', 'sunset', 'rose', 'midnight', 'minimal', 'nebula', 'obsidian', 'graphite', 'onyx', 'charcoal'];
    allClasses.forEach(cls => document.documentElement.classList.remove(cls));
    applyCustomTheme(theme);
    await setActiveCustomThemeId(theme.id);
    await setSetting('theme', 'custom');
    setActiveCustomThemeIdState(theme.id);
    setShowCustomThemeSheet(false);
    toast({ title: `Theme "${theme.name}" applied!` });
  };

  return {
    // Translation & navigation
    t, i18n, navigate, toast,
    // Subscription
    isPro, isProSub, isProUser, requireFeature, presentPaywall,
    // Theme
    currentTheme, setTheme, themes,
    // Toolbar
    toolbarOrder,
    // Dialog states
    showDeleteDialog, setShowDeleteDialog,
    showDeleteAccountDialog, setShowDeleteAccountDialog,
    deleteAccountConfirmText, setDeleteAccountConfirmText,
    showRestoreDialog, setShowRestoreDialog,
    showTermsDialog, setShowTermsDialog,
    showPrivacyDialog, setShowPrivacyDialog,
    showHelpDialog, setShowHelpDialog,
    showThemeDialog, setShowThemeDialog,
    showLanguageDialog, setShowLanguageDialog,
    // Sheet states
    showNoteTypeVisibilitySheet, setShowNoteTypeVisibilitySheet,
    showNotesSettingsSheet, setShowNotesSettingsSheet,
    showTasksSettingsSheet, setShowTasksSettingsSheet,
    showCustomizeNavigationSheet, setShowCustomizeNavigationSheet,
    showWidgetSettingsSheet, setShowWidgetSettingsSheet,
    showAppLockSettingsSheet, setShowAppLockSettingsSheet,
    showAppLockSetup, setShowAppLockSetup,
    showBackupSuccessDialog, setShowBackupSuccessDialog,
    showImportSheet, setShowImportSheet,
    showCustomThemeSheet, setShowCustomThemeSheet,
    showQuickAddDialog, setShowQuickAddDialog,
    // Data
    backupFilePath, isBackingUp, isRestoring,
    activeCustomThemeId, hapticIntensity, notes,
    hasAdminAccess, trialRemaining, currentLanguage,
    // Handlers
    handleLanguageChange, handleBackupData, handleRestoreData, confirmRestoreData,
    handleDownloadData, handleDeleteData, confirmDeleteData,
    handleDeleteAccount, handleShareApp, handleRestorePurchases,
    handleManageSubscription, handleRateAndShare, handleCustomThemeSelect,
  };
};
