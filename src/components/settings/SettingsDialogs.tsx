/**
 * SettingsDialogs — All alert dialogs and dialogs for the Settings page.
 * Extracted from Settings.tsx to reduce file size.
 */
import { useTranslation } from 'react-i18next';
import { Check, Crown, Palette } from 'lucide-react';
import { themes, ThemeId } from '@/hooks/useDarkMode';
import { languages } from '@/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface SettingsDialogsProps {
  // Delete data
  showDeleteDialog: boolean;
  setShowDeleteDialog: (v: boolean) => void;
  confirmDeleteData: () => void;
  // Delete account
  showDeleteAccountDialog: boolean;
  setShowDeleteAccountDialog: (v: boolean) => void;
  deleteAccountConfirmText: string;
  setDeleteAccountConfirmText: (v: string) => void;
  handleDeleteAccount: () => void;
  // Restore
  showRestoreDialog: boolean;
  setShowRestoreDialog: (v: boolean) => void;
  confirmRestoreData: () => void;
  // Terms
  showTermsDialog: boolean;
  setShowTermsDialog: (v: boolean) => void;
  // Privacy
  showPrivacyDialog: boolean;
  setShowPrivacyDialog: (v: boolean) => void;
  // Help
  showHelpDialog: boolean;
  setShowHelpDialog: (v: boolean) => void;
  // Theme
  showThemeDialog: boolean;
  setShowThemeDialog: (v: boolean) => void;
  currentTheme: ThemeId;
  setTheme: (id: ThemeId) => void;
  isProSub: boolean;
  requireFeature: (f: string) => boolean;
  onOpenCustomTheme: () => void;
  // Language
  showLanguageDialog: boolean;
  setShowLanguageDialog: (v: boolean) => void;
  handleLanguageChange: (code: string) => void;
}

export const SettingsDialogs = (props: SettingsDialogsProps) => {
  const { t, i18n } = useTranslation();

  return (
    <>
      {/* Delete Data Dialog */}
      <AlertDialog open={props.showDeleteDialog} onOpenChange={props.setShowDeleteDialog}>
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
            <AlertDialogAction onClick={props.confirmDeleteData} className="bg-destructive hover:bg-destructive/90">
              {t('dialogs.deleteEverything')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Account Dialog */}
      <AlertDialog open={props.showDeleteAccountDialog} onOpenChange={props.setShowDeleteAccountDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive">
              {t('dialogs.deleteAccountTitle', 'Delete Your Account')}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <p className="font-semibold text-destructive">
                ⚠️ {t('dialogs.deleteAccountWarning', 'This action is permanent and cannot be undone.')}
              </p>
              <p>{t('dialogs.deleteAccountDesc', 'Deleting your account will:')}</p>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>{t('dialogs.deleteAccountNotes', 'Remove all your notes, tasks, and folders')}</li>
                <li>{t('dialogs.deleteAccountSettings', 'Erase all app settings and preferences')}</li>
                <li>{t('dialogs.deleteAccountSync', 'Disconnect cloud sync')}</li>
                <li>{t('dialogs.deleteAccountSub', 'Your subscription (if any) will NOT be automatically cancelled — manage it from your device subscription settings.')}</li>
              </ul>
              <div className="pt-2">
                <p className="text-sm font-medium mb-2">
                  {t('dialogs.deleteAccountTypeConfirm', 'Type DELETE to confirm:')}
                </p>
                <input
                  type="text"
                  value={props.deleteAccountConfirmText}
                  onChange={(e) => props.setDeleteAccountConfirmText(e.target.value)}
                  placeholder="DELETE"
                  className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-destructive"
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={props.deleteAccountConfirmText !== 'DELETE'}
              onClick={props.handleDeleteAccount}
              className="bg-destructive hover:bg-destructive/90 disabled:opacity-50 disabled:pointer-events-none"
            >
              {t('dialogs.deleteAccountButton', 'Delete Account')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore Dialog */}
      <AlertDialog open={props.showRestoreDialog} onOpenChange={props.setShowRestoreDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('dialogs.restoreTitle')}</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p className="font-semibold text-warning">⚠️ {t('dialogs.restoreNotice')}</p>
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
            <AlertDialogAction onClick={props.confirmRestoreData}>
              {t('dialogs.continueRestore')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Terms of Service Dialog */}
      <Dialog open={props.showTermsDialog} onOpenChange={props.setShowTermsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{t('terms.title')}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh] pr-4">
            <div className="space-y-4 text-sm">
              {['acceptance', 'license', 'userData', 'disclaimer', 'limitations', 'modifications'].map((key, idx) => (
                <section key={key}>
                  <h3 className="font-semibold mb-2">{idx + 1}. {t(`terms.${key}`)}</h3>
                  <p className="text-muted-foreground">{t(`terms.${key}Desc`)}</p>
                </section>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Privacy Policy Dialog */}
      <Dialog open={props.showPrivacyDialog} onOpenChange={props.setShowPrivacyDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{t('privacy.title')}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh] pr-4">
            <div className="space-y-4 text-sm">
              {['infoCollect', 'localStorage', 'dataSecurity', 'thirdParty', 'dataBackup', 'changes'].map((key, idx) => (
                <section key={key}>
                  <h3 className="font-semibold mb-2">{idx + 1}. {t(`privacy.${key}`)}</h3>
                  <p className="text-muted-foreground">{t(`privacy.${key}Desc`)}</p>
                </section>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Help and Feedback Dialog */}
      <Dialog open={props.showHelpDialog} onOpenChange={props.setShowHelpDialog}>
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

      {/* Theme Switcher Dialog */}
      <Dialog open={props.showThemeDialog} onOpenChange={props.setShowThemeDialog}>
        <DialogContent className="max-w-md max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{t('settings.chooseTheme')}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh] pr-4">
            <div className="grid grid-cols-2 gap-3">
              {themes.map((theme) => {
                const isLocked = theme.id !== 'light' && theme.id !== 'dark' && !props.isProSub;
                const isActive = props.currentTheme === theme.id;
                return (
                  <button
                    key={theme.id}
                    onClick={() => {
                      if (isLocked) {
                        props.requireFeature('dark_theme_extra');
                        return;
                      }
                      props.setTheme(theme.id);
                    }}
                    aria-disabled={isLocked}
                    className={cn(
                      "relative rounded-xl p-3 border-2 transition-all text-left",
                      isActive
                        ? "border-primary ring-2 ring-primary/20"
                        : "border-border hover:border-muted-foreground/30",
                      isLocked && "opacity-70 hover:opacity-100"
                    )}
                  >
                    <div className="relative">
                      <div className={cn("w-full h-16 rounded-lg mb-2", theme.preview, isLocked && "saturate-50")} />
                      {isLocked && (
                        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/30">
                          <Crown className="h-6 w-6 drop-shadow" fill="#FFD700" color="#FFD700" />
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={cn("text-sm font-medium text-foreground truncate", isLocked && "text-muted-foreground")}>
                        {t(`settings.themeNames.${theme.id}`, theme.name)}
                      </span>
                      {isLocked && <Crown className="h-3 w-3 ml-auto flex-shrink-0" fill="#FFD700" color="#FFD700" />}
                    </div>
                    {isActive && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                        <Check className="h-3 w-3 text-primary-foreground" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 pt-4 border-t border-border">
              <Button
                variant="outline"
                className={cn("w-full gap-2", !props.isProSub && "opacity-80")}
                onClick={() => {
                  if (!props.isProSub) { props.requireFeature('dark_theme_extra'); return; }
                  props.onOpenCustomTheme();
                }}
              >
                <Palette className="h-4 w-4" />
                Custom Themes
                {!props.isProSub && <Crown className="h-3.5 w-3.5 ml-auto" fill="#FFD700" color="#FFD700" />}
              </Button>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Language Dialog */}
      <Dialog open={props.showLanguageDialog} onOpenChange={props.setShowLanguageDialog}>
        <DialogContent className="max-w-md max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>{t('settings.chooseLanguage')}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh] pr-4">
            <div className="space-y-2">
              {languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => props.handleLanguageChange(lang.code)}
                  className={cn(
                    "w-full flex items-center justify-between p-4 rounded-lg border-2 transition-all",
                    i18n.language === lang.code
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/30"
                  )}
                >
                  <div className="flex flex-col items-start">
                    <span className="font-medium text-foreground">{lang.nativeName}</span>
                    <span className="text-xs text-muted-foreground">{lang.name}</span>
                  </div>
                  {i18n.language === lang.code && (
                    <div className="w-5 h-5 bg-primary rounded-full flex items-center justify-center">
                      <Check className="h-3 w-3 text-primary-foreground" />
                    </div>
                  )}
                </button>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
};
