/**
 * SettingsSheets — All bottom sheets for the Settings page.
 * Extracted from Settings.tsx to reduce file size.
 */
import { NoteTypeVisibilitySheet } from '@/components/NoteTypeVisibilitySheet';
import { NotesSettingsSheet } from '@/components/NotesSettingsSheet';
import { TasksSettingsSheet } from '@/components/TasksSettingsSheet';
import { CustomizeNavigationSheet } from '@/components/CustomizeNavigationSheet';
import { WidgetSettingsSheet } from '@/components/WidgetSettingsSheet';
import { AppLockSettingsSheet } from '@/components/AppLockSettingsSheet';
import { AppLockSetup } from '@/components/AppLockSetup';
import { ToolbarOrderManager, ToolbarItemId } from '@/components/ToolbarOrderManager';
import { BackupSuccessDialog } from '@/components/BackupSuccessDialog';
import { ImportDataSheet } from '@/components/ImportDataSheet';
import { CustomThemeSheet } from '@/components/CustomThemeSheet';
import { CustomTheme } from '@/utils/customThemeStorage';

interface SettingsSheetsProps {
  // Note type visibility
  showNoteTypeVisibilitySheet: boolean;
  setShowNoteTypeVisibilitySheet: (v: boolean) => void;
  // Notes settings
  showNotesSettingsSheet: boolean;
  setShowNotesSettingsSheet: (v: boolean) => void;
  // Tasks settings
  showTasksSettingsSheet: boolean;
  setShowTasksSettingsSheet: (v: boolean) => void;
  // Customize navigation
  showCustomizeNavigationSheet: boolean;
  setShowCustomizeNavigationSheet: (v: boolean) => void;
  // Widget settings
  showWidgetSettingsSheet: boolean;
  setShowWidgetSettingsSheet: (v: boolean) => void;
  // App lock
  showAppLockSettingsSheet: boolean;
  setShowAppLockSettingsSheet: (v: boolean) => void;
  showAppLockSetup: boolean;
  setShowAppLockSetup: (v: boolean) => void;
  // Toolbar
  toolbarOrder: {
    isManagerOpen: boolean;
    setIsManagerOpen: (v: boolean) => void;
    updateOrder: (order: ToolbarItemId[]) => void;
    updateVisibility: (visibility: Record<ToolbarItemId, boolean>) => void;
    order: ToolbarItemId[];
    visibility: Record<ToolbarItemId, boolean>;
  };
  // Backup success
  showBackupSuccessDialog: boolean;
  setShowBackupSuccessDialog: (v: boolean) => void;
  backupFilePath: string;
  // Import
  showImportSheet: boolean;
  setShowImportSheet: (v: boolean) => void;
  // Custom theme
  showCustomThemeSheet: boolean;
  setShowCustomThemeSheet: (v: boolean) => void;
  activeCustomThemeId: string | null;
  onCustomThemeSelect: (theme: CustomTheme) => void;
}

export const SettingsSheets = (props: SettingsSheetsProps) => {
  return (
    <>
      <NoteTypeVisibilitySheet
        isOpen={props.showNoteTypeVisibilitySheet}
        onClose={() => props.setShowNoteTypeVisibilitySheet(false)}
      />

      <NotesSettingsSheet
        isOpen={props.showNotesSettingsSheet}
        onClose={() => props.setShowNotesSettingsSheet(false)}
      />

      <TasksSettingsSheet
        isOpen={props.showTasksSettingsSheet}
        onClose={() => props.setShowTasksSettingsSheet(false)}
      />

      <CustomizeNavigationSheet
        isOpen={props.showCustomizeNavigationSheet}
        onClose={() => props.setShowCustomizeNavigationSheet(false)}
      />

      <WidgetSettingsSheet
        isOpen={props.showWidgetSettingsSheet}
        onClose={() => props.setShowWidgetSettingsSheet(false)}
      />

      <AppLockSettingsSheet
        open={props.showAppLockSettingsSheet}
        onOpenChange={props.setShowAppLockSettingsSheet}
        onSetupLock={() => {
          props.setShowAppLockSettingsSheet(false);
          props.setShowAppLockSetup(true);
        }}
      />

      {props.showAppLockSetup && (
        <div className="fixed inset-0 z-50 bg-background">
          <AppLockSetup
            onComplete={() => props.setShowAppLockSetup(false)}
            onCancel={() => props.setShowAppLockSetup(false)}
          />
        </div>
      )}

      <ToolbarOrderManager
        isOpen={props.toolbarOrder.isManagerOpen}
        onOpenChange={props.toolbarOrder.setIsManagerOpen}
        onOrderChange={props.toolbarOrder.updateOrder}
        onVisibilityChange={props.toolbarOrder.updateVisibility}
        currentOrder={props.toolbarOrder.order}
        currentVisibility={props.toolbarOrder.visibility}
      />

      <BackupSuccessDialog
        isOpen={props.showBackupSuccessDialog}
        onClose={() => props.setShowBackupSuccessDialog(false)}
        filePath={props.backupFilePath}
      />

      <ImportDataSheet
        isOpen={props.showImportSheet}
        onClose={() => props.setShowImportSheet(false)}
      />

      <CustomThemeSheet
        isOpen={props.showCustomThemeSheet}
        onClose={() => props.setShowCustomThemeSheet(false)}
        activeCustomThemeId={props.activeCustomThemeId}
        onThemeSelect={props.onCustomThemeSelect}
      />
    </>
  );
};
