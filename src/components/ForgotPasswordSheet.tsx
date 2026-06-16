import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { HelpCircle, Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react';
import { useHardwareBackButton } from '@/hooks/useHardwareBackButton';
import { triggerHaptic } from '@/utils/haptics';
import { toast } from 'sonner';
import {
  getSecurityQuestion,
  verifySecurityAnswer,
  setHiddenNotesPassword,
} from '@/utils/noteProtection';

interface ForgotPasswordSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onPasswordReset: () => void;
}

const SECURITY_QUESTIONS = [
  "What is your mother's maiden name?",
  "What was the name of your first pet?",
  "What city were you born in?",
  "What is your favorite movie?",
  "What was the name of your elementary school?",
  "What is your favorite food?",
];

export const ForgotPasswordSheet = ({
  isOpen,
  onClose,
  onPasswordReset,
}: ForgotPasswordSheetProps) => {
  const { t } = useTranslation();
  const [step, setStep] = useState<'verify' | 'reset'>('verify');
  const [securityAnswer, setSecurityAnswer] = useState('');
  const [storedQuestion, setStoredQuestion] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useHardwareBackButton({
    onBack: onClose,
    enabled: isOpen,
    priority: 'sheet',
  });

  useEffect(() => {
    if (isOpen) {
      const question = getSecurityQuestion();
      setStoredQuestion(question);
      setStep('verify');
      setSecurityAnswer('');
      setNewPassword('');
      setConfirmPassword('');
    }
  }, [isOpen]);

  const handleVerifyAnswer = async () => {
    await triggerHaptic('heavy');

    if (!securityAnswer.trim()) {
      toast.error(t('security.pleaseEnterAnswer'));
      return;
    }

    const isValid = await verifySecurityAnswer(securityAnswer);
    if (isValid) {
      setStep('reset');
      toast.success(t('security.answerVerified'));
    } else {
      toast.error(t('security.incorrectAnswer'));
    }
  };

  const handleResetPassword = async () => {
    await triggerHaptic('heavy');

    if (!newPassword) {
      toast.error(t('security.enterNewPasswordPrompt'));
      return;
    }
    if (newPassword.length < 4) {
      toast.error(t('security.passwordMinLength'));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t('security.passwordsDoNotMatch'));
      return;
    }

    await setHiddenNotesPassword(newPassword);
    toast.success(t('security.passwordResetSuccess'));
    onPasswordReset();
    onClose();
  };

  if (!storedQuestion) {
    return (
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" />
              {t('security.passwordRecovery')}
            </SheetTitle>
          </SheetHeader>

          <div className="text-center py-8">
            <ShieldCheck className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground mb-4">
              {t('security.noSecurityQuestion')}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('security.setupSecurityInSettings')}
            </p>
          </div>

          <Button variant="outline" onClick={onClose} className="w-full mt-4">
            {t('common.close')}
          </Button>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            {step === 'verify' ? (
              <>
                <HelpCircle className="h-5 w-5 text-primary" />
                {t('security.verifyIdentity')}
              </>
            ) : (
              <>
                <KeyRound className="h-5 w-5 text-primary" />
                {t('security.resetPassword')}
              </>
            )}
          </SheetTitle>
        </SheetHeader>

        {step === 'verify' ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label className="text-sm text-muted-foreground">{t('security.securityQuestion')}</Label>
              <p className="font-medium">{storedQuestion}</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="security-answer">{t('security.yourAnswer')}</Label>
              <Input
                id="security-answer"
                type="text"
                placeholder={t('security.enterYourAnswer')}
                value={securityAnswer}
                onChange={(e) => setSecurityAnswer(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleVerifyAnswer()}
                className="h-12"
              />
            </div>

            <div className="flex flex-col gap-2">
              <Button onClick={handleVerifyAnswer} className="w-full">
                {t('security.verifyAnswer')}
              </Button>
              <Button variant="ghost" onClick={onClose} className="w-full text-muted-foreground">
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <p className="text-sm text-muted-foreground">
              {t('security.enterNewPasswordBelow')}
            </p>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">{t('security.newPassword')}</Label>
                <div className="relative">
                  <Input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t('security.enterNewPassword')}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="pr-10 h-12"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm-password">{t('security.confirmPassword')}</Label>
                <Input
                  id="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={t('security.confirmNewPassword')}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleResetPassword()}
                  className="h-12"
                />
              </div>
            </div>

            <Button onClick={handleResetPassword} className="w-full">
              <KeyRound className="h-4 w-4 mr-2" />
              {t('security.resetPassword')}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

// Export security questions for use in setup
export { SECURITY_QUESTIONS };
