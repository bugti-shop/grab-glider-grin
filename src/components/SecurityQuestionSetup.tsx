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
import { ShieldQuestion, ShieldCheck } from 'lucide-react';
import { useHardwareBackButton } from '@/hooks/useHardwareBackButton';
import { triggerHaptic } from '@/utils/haptics';
import { toast } from 'sonner';
import { setSecurityQuestion, getSecurityQuestion } from '@/utils/noteProtection';
import { SECURITY_QUESTIONS } from './ForgotPasswordSheet';

interface SecurityQuestionSetupProps {
  isOpen: boolean;
  onClose: () => void;
  onSetupComplete: () => void;
}

export const SecurityQuestionSetup = ({
  isOpen,
  onClose,
  onSetupComplete,
}: SecurityQuestionSetupProps) => {
  const { t } = useTranslation();
  const [selectedQuestion, setSelectedQuestion] = useState<string>('');
  const [answer, setAnswer] = useState('');
  const [hasExisting, setHasExisting] = useState(false);

  useHardwareBackButton({
    onBack: onClose,
    enabled: isOpen,
    priority: 'sheet',
  });

  useEffect(() => {
    if (isOpen) {
      const existingQuestion = getSecurityQuestion();
      setHasExisting(!!existingQuestion);
      setSelectedQuestion(existingQuestion || '');
      setAnswer('');
    }
  }, [isOpen]);

  const handleSave = async () => {
    await triggerHaptic('heavy');

    if (!selectedQuestion) {
      toast.error(t('security.selectSecurityQuestion'));
      return;
    }
    if (!answer.trim()) {
      toast.error(t('security.pleaseEnterAnswer'));
      return;
    }
    if (answer.trim().length < 2) {
      toast.error(t('security.answerMinLength'));
      return;
    }

    await setSecurityQuestion(selectedQuestion, answer.trim());
    toast.success(t('security.securityQuestionSaved'));
    onSetupComplete();
    onClose();
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader className="mb-4">
          <SheetTitle className="flex items-center gap-2">
            <ShieldQuestion className="h-5 w-5 text-primary" />
            {hasExisting ? t('security.updateSecurityQuestion') : t('security.setupSecurityQuestion')}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            {t('security.setupSecurityDesc')}
          </p>

          <div className="space-y-2">
            <Label>{t('security.securityQuestion')}</Label>
            <Select value={selectedQuestion} onValueChange={setSelectedQuestion}>
              <SelectTrigger className="h-12">
                <SelectValue placeholder={t('security.selectAQuestion')} />
              </SelectTrigger>
              <SelectContent>
                {SECURITY_QUESTIONS.map((q) => (
                  <SelectItem key={q} value={q}>
                    {q}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="answer">{t('security.yourAnswer')}</Label>
            <Input
              id="answer"
              type="text"
              placeholder={t('security.enterAnAnswer')}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              className="h-12"
            />
            <p className="text-xs text-muted-foreground">
              {t('security.answerVerifyDesc')}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Button onClick={handleSave} className="w-full">
              <ShieldCheck className="h-4 w-4 mr-2" />
              {hasExisting ? t('security.updateSecurityBtn') : t('security.saveSecurityBtn')}
            </Button>
            <Button variant="ghost" onClick={onClose} className="w-full text-muted-foreground">
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
