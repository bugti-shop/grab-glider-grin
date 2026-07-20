import { useMemo, useState } from 'react';
import { BottomNavigation } from '@/components/BottomNavigation';
import { AppLogo } from '@/components/AppLogo';
import {
  ChevronRight,
  Search,
  Settings as SettingsIcon,
  Brush,
  Globe,
  Eye,
  StickyNote,
  ClipboardCheck,
  Calendar as CalendarIcon,
  Compass,
  Accessibility as AccessibilityIcon,
  Lock,
  Bell,
  Cloud,
  HelpCircle,
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useSettingsPageState } from '@/hooks/useSettingsPageState';
import { SettingsDialogs } from '@/components/settings/SettingsDialogs';
import { SettingsSheets } from '@/components/settings/SettingsSheets';
import { FeedbackDialog } from '@/components/FeedbackDialog';
import { HeaderOffsetSheet } from '@/components/settings/HeaderOffsetSheet';
import { AccessibilityZoomSheet } from '@/components/settings/AccessibilityZoomSheet';

type IconRow = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  onClick: () => void;
  keywords?: string[];
};

const Settings = () => {
  const state = useSettingsPageState();
  const { t, navigate, isProSub, requireFeature, isBackingUp } = state;
  const { openPaywall } = useSubscription();
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
  const [showHeaderOffsetSheet, setShowHeaderOffsetSheet] = useState(false);
  const [showAccessibilityZoomSheet, setShowAccessibilityZoomSheet] = useState(false);
  const [query, setQuery] = useState('');

  const groups: { rows: IconRow[] }[] = useMemo(() => [
    {
      rows: [
        { label: 'General', icon: SettingsIcon, color: '#8E8E93', onClick: () => setShowHeaderOffsetSheet(true), keywords: ['header', 'offset', 'layout'] },
        { label: 'Appearance', icon: Brush, color: '#AF52DE', onClick: () => state.setShowThemeDialog(true), keywords: ['theme', 'dark', 'light', 'color', 'colour', 'mode'] },
        { label: 'Language', icon: Globe, color: '#007AFF', onClick: () => state.setShowLanguageDialog(true), keywords: ['locale', 'translate', 'region'] },
        { label: 'Note Type Visibility', icon: Eye, color: '#5AC8CE', onClick: () => { if (requireFeature('notes_type_visibility')) state.setShowNoteTypeVisibilitySheet(true); }, keywords: ['notes', 'show', 'hide', 'sticky', 'sketch', 'voice'] },
        { label: 'Notes Settings', icon: StickyNote, color: '#FF9500', onClick: () => { if (requireFeature('notes_settings')) state.setShowNotesSettingsSheet(true); }, keywords: ['editor', 'font'] },
      ],
    },
    {
      rows: [
        { label: 'Tasks', icon: ClipboardCheck, color: '#34C759', onClick: () => { if (requireFeature('tasks_settings')) state.setShowTasksSettingsSheet(true); }, keywords: ['todo', 'priority', 'defaults'] },
        { label: 'Calendar', icon: CalendarIcon, color: '#FF3B30', onClick: () => navigate('/calendar'), keywords: ['schedule', 'date', 'events'] },
        { label: 'Customize Navigation', icon: Compass, color: '#5856D6', onClick: () => state.setShowCustomizeNavigationSheet(true), keywords: ['bottom', 'tabs', 'nav', 'menu'] },
      ],
    },
    {
      rows: [
        { label: 'Accessibility', icon: AccessibilityIcon, color: '#FF2D92', onClick: () => setShowAccessibilityZoomSheet(true), keywords: ['zoom', 'font size', 'text size'] },
        { label: 'App Lock', icon: Lock, color: '#FF3B30', onClick: () => { if (requireFeature('app_lock')) state.setShowAppLockSettingsSheet(true); }, keywords: ['security', 'passcode', 'pin', 'biometric', 'face', 'touch'] },
        { label: 'Notifications', icon: Bell, color: '#FFCC00', onClick: () => toast.info('Manage notifications from your device settings'), keywords: ['alerts', 'reminders', 'push'] },
      ],
    },
    {
      rows: [
        { label: 'Sync & Backup', icon: Cloud, color: '#32ADE6', onClick: () => { if (requireFeature('backup')) state.handleBackupData(); }, keywords: ['export', 'save', 'drive', 'restore', 'cloud'] },
        { label: 'Help & Support', icon: HelpCircle, color: '#34C759', onClick: () => setShowFeedbackDialog(true), keywords: ['feedback', 'contact', 'faq'] },
        { label: 'About', icon: Info, color: '#48484A', onClick: () => state.setShowTermsDialog(true), keywords: ['version', 'terms', 'legal', 'privacy'] },
      ],
    },
  ], [state, requireFeature, navigate]);

  const q = query.trim().toLowerCase();
  const matches = (r: IconRow) => {
    if (!q) return true;
    if (r.label.toLowerCase().includes(q)) return true;
    return (r.keywords || []).some((k) => k.toLowerCase().includes(q));
  };
  const filteredGroups = q
    ? groups
        .map((g) => ({ rows: g.rows.filter(matches) }))
        .filter((g) => g.rows.length > 0)
    : groups;

  return (
    <div className="min-h-screen min-h-screen-dynamic bg-[#F2F2F7] dark:bg-[#000000] pb-20">
      <div
        style={{
          paddingTop: 'var(--safe-top, 0px)',
          paddingLeft: 'var(--safe-left, 0px)',
          paddingRight: 'var(--safe-right, 0px)',
        }}
      >
        <div className="px-5 pt-4 pb-3 flex items-center gap-2.5">
          <AppLogo size="md" className="h-7 w-7 rounded-[7px] flex-shrink-0" />
          <h1 className="text-[18px] leading-none font-bold tracking-tight text-black dark:text-white">
            Settings
          </h1>
        </div>

        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 bg-[#E4E4E9] dark:bg-[#1C1C1E] rounded-[10px] px-3 h-9">
            <Search className="h-[18px] w-[18px] text-[#8E8E93]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search settings"
              className="flex-1 bg-transparent outline-none border-0 text-[17px] placeholder:text-[#8E8E93] text-black dark:text-white"
            />
          </div>
        </div>
      </div>

      <main className="px-4 space-y-6">
        {!isProSub && (
          <button
            onClick={() => openPaywall()}
            className="w-full flex items-center justify-between px-4 py-3.5 rounded-[14px] bg-white dark:bg-[#1C1C1E] shadow-sm"
          >
            <span className="text-[15px] font-medium text-[#007AFF]">
              Upgrade to Flowist Pro
            </span>
            <ChevronRight className="h-[18px] w-[18px] text-[#C7C7CC]" />
          </button>
        )}

        {filteredGroups.length === 0 && (
          <div className="text-center py-10 text-[15px] text-[#8E8E93]">No settings match "{query}"</div>
        )}
        {filteredGroups.map((group, gi) => (
          <div
            key={gi}
            className="bg-white dark:bg-[#1C1C1E] rounded-[14px] overflow-hidden"
          >
            {group.rows.map((row, ri) => {
              const Icon = row.icon;
              const isLast = ri === group.rows.length - 1;
              return (
                <div key={row.label} className="relative">
                  <button
                    onClick={row.onClick}
                    disabled={row.label === 'Sync & Backup' && isBackingUp}
                    className="w-full flex items-center gap-3 pl-3 pr-4 py-[9px] active:bg-black/[0.04] dark:active:bg-white/[0.06] transition-colors disabled:opacity-60"
                  >
                    <span
                      className="flex items-center justify-center rounded-[8px] shrink-0"
                      style={{
                        width: 29,
                        height: 29,
                        background: `linear-gradient(180deg, ${row.color} 0%, ${row.color}E6 100%)`,
                        boxShadow: `0 1px 2px ${row.color}40, inset 0 1px 0 rgba(255,255,255,0.25)`,
                      }}
                    >
                      <Icon className="h-[17px] w-[17px] text-white drop-shadow-[0_0.5px_0_rgba(0,0,0,0.1)]" />
                    </span>
                    <span className="flex-1 min-w-0 flex items-center">
                      <span className="text-[17px] text-black dark:text-white text-left truncate">
                        {row.label}
                      </span>
                    </span>
                    <ChevronRight className="h-[18px] w-[18px] text-[#C7C7CC] shrink-0" />
                  </button>
                  {!isLast && (
                    <div className="absolute left-[52px] right-0 bottom-0 h-px bg-[#E5E5EA] dark:bg-[#38383A]" />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </main>

      <BottomNavigation />

      <SettingsDialogs
        showDeleteDialog={state.showDeleteDialog}
        setShowDeleteDialog={state.setShowDeleteDialog}
        confirmDeleteData={state.confirmDeleteData}
        showDeleteAccountDialog={state.showDeleteAccountDialog}
        setShowDeleteAccountDialog={state.setShowDeleteAccountDialog}
        deleteAccountConfirmText={state.deleteAccountConfirmText}
        setDeleteAccountConfirmText={state.setDeleteAccountConfirmText}
        handleDeleteAccount={state.handleDeleteAccount}
        showRestoreDialog={state.showRestoreDialog}
        setShowRestoreDialog={state.setShowRestoreDialog}
        confirmRestoreData={state.confirmRestoreData}
        showTermsDialog={state.showTermsDialog}
        setShowTermsDialog={state.setShowTermsDialog}
        showPrivacyDialog={state.showPrivacyDialog}
        setShowPrivacyDialog={state.setShowPrivacyDialog}
        showHelpDialog={state.showHelpDialog}
        setShowHelpDialog={state.setShowHelpDialog}
        showThemeDialog={state.showThemeDialog}
        setShowThemeDialog={state.setShowThemeDialog}
        currentTheme={state.currentTheme}
        setTheme={state.setTheme}
        isProSub={state.isProSub}
        requireFeature={state.requireFeature}
        onOpenCustomTheme={() => { state.setShowThemeDialog(false); state.setShowCustomThemeSheet(true); }}
        showLanguageDialog={state.showLanguageDialog}
        setShowLanguageDialog={state.setShowLanguageDialog}
        handleLanguageChange={state.handleLanguageChange}
      />

      <SettingsSheets
        showNoteTypeVisibilitySheet={state.showNoteTypeVisibilitySheet}
        setShowNoteTypeVisibilitySheet={state.setShowNoteTypeVisibilitySheet}
        showNotesSettingsSheet={state.showNotesSettingsSheet}
        setShowNotesSettingsSheet={state.setShowNotesSettingsSheet}
        showTasksSettingsSheet={state.showTasksSettingsSheet}
        setShowTasksSettingsSheet={state.setShowTasksSettingsSheet}
        showCustomizeNavigationSheet={state.showCustomizeNavigationSheet}
        setShowCustomizeNavigationSheet={state.setShowCustomizeNavigationSheet}
        showWidgetSettingsSheet={state.showWidgetSettingsSheet}
        setShowWidgetSettingsSheet={state.setShowWidgetSettingsSheet}
        showAppLockSettingsSheet={state.showAppLockSettingsSheet}
        setShowAppLockSettingsSheet={state.setShowAppLockSettingsSheet}
        showAppLockSetup={state.showAppLockSetup}
        setShowAppLockSetup={state.setShowAppLockSetup}
        toolbarOrder={state.toolbarOrder}
        showBackupSuccessDialog={state.showBackupSuccessDialog}
        setShowBackupSuccessDialog={state.setShowBackupSuccessDialog}
        backupFilePath={state.backupFilePath}
        showImportSheet={state.showImportSheet}
        setShowImportSheet={state.setShowImportSheet}
        showCustomThemeSheet={state.showCustomThemeSheet}
        setShowCustomThemeSheet={state.setShowCustomThemeSheet}
        activeCustomThemeId={state.activeCustomThemeId}
        onCustomThemeSelect={state.handleCustomThemeSelect}
      />

      <FeedbackDialog open={showFeedbackDialog} onOpenChange={setShowFeedbackDialog} />
      <HeaderOffsetSheet isOpen={showHeaderOffsetSheet} onClose={() => setShowHeaderOffsetSheet(false)} />
      <AccessibilityZoomSheet isOpen={showAccessibilityZoomSheet} onClose={() => setShowAccessibilityZoomSheet(false)} />
    </div>
  );
};

export default Settings;
