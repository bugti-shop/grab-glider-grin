import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, KeyRound, Loader2, Mail, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  startEmailChange,
  resendEmailChangeOtp,
  verifyEmailChangeOtp,
  classifyOtpError,
  checkOtpCooldown,
} from '@/utils/emailAuth';


interface Props {
  open: boolean;
  currentEmail: string;
  onClose: () => void;
  onEmailChanged?: (newEmail: string) => void;
}

type Step = 'enter' | 'verify';

export function ChangeEmailSheet({ open, currentEmail, onClose, onEmailChanged }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [step, setStep] = useState<Step>('enter');
  const [newEmail, setNewEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [otpError, setOtpError] = useState<string | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    timer.current = window.setTimeout(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [cooldown]);

  if (!open) return null;

  const reset = () => {
    setStep('enter'); setNewEmail(''); setOtp('');
    setLoading(false); setCooldown(0); setOtpError(null);
  };
  const close = () => { reset(); onClose(); };

  const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const handleStart = async () => {
    const target = newEmail.trim().toLowerCase();
    if (!validEmail(target)) {
      toast({ title: t('changeEmail.invalidEmail', 'Enter a valid email'), variant: 'destructive' });
      return;
    }
    if (target === currentEmail.trim().toLowerCase()) {
      toast({ title: t('changeEmail.sameEmail', 'That is already your email'), variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      await startEmailChange(target);
      toast({
        title: t('changeEmail.codeSent', 'Verification code sent'),
        description: t('changeEmail.codeSentDesc', 'Enter the 6-digit code we sent to {{email}}.', { email: target }),
      });
      setOtp(''); setOtpError(null);
      setStep('verify');
      // Sync initial cooldown from backend (Supabase just sent an email so a
      // server-side cooldown is already active). Fall back to 45s optimistically.
      setCooldown(45);
      try {
        const { retryAfter, cooldownSeconds } = await checkOtpCooldown(target, 'email_change');
        setCooldown(retryAfter > 0 ? retryAfter : cooldownSeconds);
      } catch { /* keep optimistic value */ }
    } catch (err: any) {
      const info = classifyOtpError(err);
      toast({
        title: t('changeEmail.failed', 'Could not send code'),
        description: info.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };


  const handleVerify = async () => {
    if (otp.length < 6) {
      setOtpError(t('emailAuth.enterOtp', 'Enter the 6-digit code'));
      return;
    }
    setLoading(true); setOtpError(null);
    try {
      const u = await verifyEmailChangeOtp(newEmail.trim().toLowerCase(), otp);
      toast({
        title: t('changeEmail.updated', 'Email updated'),
        description: t('changeEmail.updatedDesc', 'Your Flowist account now uses this email.'),
      });
      onEmailChanged?.(u.email);
      close();
    } catch (err: any) {
      const info = classifyOtpError(err);
      setOtpError(info.message);
      toast({
        title:
          info.code === 'expired' ? t('emailAuth.otpExpired', 'Code expired')
          : info.code === 'invalid' ? t('emailAuth.otpWrong', 'Wrong code')
          : info.code === 'network' || info.code === 'timeout' ? t('emailAuth.networkError', 'Connection problem')
          : t('emailAuth.otpInvalid', 'Verification failed'),
        description: info.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || loading) return;
    setLoading(true); setOtpError(null);
    try {
      const { cooldownSeconds } = await resendEmailChangeOtp(newEmail.trim().toLowerCase());
      setCooldown(cooldownSeconds); // server-authoritative cooldown
      toast({
        title: t('emailAuth.otpResent', 'New code sent'),
        description: t('emailAuth.otpResentDesc', 'Check your inbox for the latest 6-digit code.'),
      });
    } catch (err: any) {
      const info = classifyOtpError(err);
      // Always sync any server-provided retryAfter into the countdown so the
      // user can't spam and always sees the real remaining time.
      if (info.retryAfter && info.retryAfter > 0) setCooldown(info.retryAfter);
      toast({
        title:
          info.code === 'cooldown' ? t('emailAuth.tooSoon', 'Please wait')
          : info.code === 'rate_limited' ? t('emailAuth.rateLimited', 'Too many attempts')
          : t('emailAuth.resendFailed', 'Could not resend code'),
        description: info.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };


  return (
    <div className="fixed inset-0 z-[400] flex items-end justify-center bg-black/50 backdrop-blur-sm" onClick={close}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[480px] bg-white rounded-t-3xl p-6 pb-8 shadow-2xl animate-in slide-in-from-bottom duration-200"
        style={{ paddingBottom: 'max(var(--safe-bottom, 0px), 24px)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {step === 'verify' && (
              <button onClick={() => setStep('enter')} className="p-1 -ml-1">
                <ArrowLeft className="h-5 w-5 text-[#1a1a1a]" />
              </button>
            )}
            <div className="flex items-center gap-2">
              <img src="/favicon.webp?v=3" alt="Flowist" className="w-6 h-6" />
              <h2 className="text-[18px] font-black text-[#1a1a1a] font-['Nunito']">
                {step === 'enter'
                  ? t('changeEmail.title', 'Change your email')
                  : t('changeEmail.verifyTitle', 'Verify your new email')}
              </h2>
            </div>
          </div>
          <button onClick={close} className="p-1.5 rounded-full hover:bg-black/5">
            <X className="h-5 w-5 text-[#666]" />
          </button>
        </div>

        {step === 'enter' ? (
          <div className="space-y-3">
            <p className="text-[13px] text-[#666]">
              {t('changeEmail.intro', 'Your current email is {{current}}. We will send a 6-digit code to the new address — your email only changes after you enter it.', { current: currentEmail })}
            </p>
            <Input
              type="email"
              autoComplete="email"
              placeholder={t('changeEmail.newEmailPlaceholder', 'New email address')}
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="h-12 rounded-xl"
            />
            <Button onClick={handleStart} disabled={loading} className="w-full h-12 rounded-xl font-bold">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
              {t('changeEmail.sendCode', 'Send verification code')}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[13px] text-[#666] text-center">
              {t('changeEmail.verifyInstructions', 'We sent a 6-digit code to {{email}}. Enter it below to update your account email.', { email: newEmail })}
            </p>
            <Input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="••••••"
              value={otp}
              onChange={(e) => {
                setOtp(e.target.value.replace(/\D/g, '').slice(0, 6));
                if (otpError) setOtpError(null);
              }}
              className={`h-14 rounded-xl text-center text-2xl font-bold tracking-[0.5em] ${otpError ? 'border-red-500 focus-visible:ring-red-500' : ''}`}
            />
            {otpError && (
              <p className="text-[12px] text-red-600 text-center -mt-1">{otpError}</p>
            )}
            <Button onClick={handleVerify} disabled={loading || otp.length < 6} className="w-full h-12 rounded-xl font-bold">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <KeyRound className="h-4 w-4 mr-2" />}
              {loading ? t('emailAuth.verifying', 'Verifying…') : t('changeEmail.confirm', 'Confirm & update email')}
            </Button>
            <button
              onClick={handleResend}
              disabled={loading || cooldown > 0}
              className="w-full text-center text-[13px] text-[#666] underline py-1 disabled:no-underline disabled:opacity-60"
            >
              {cooldown > 0
                ? t('emailAuth.resendIn', 'Resend code in {{s}}s', { s: cooldown })
                : t('emailAuth.resend', 'Resend code')}
            </button>
            <p className="text-[11px] text-[#999] text-center leading-relaxed">
              {t('changeEmail.syncNote', 'Your email only changes after this code is verified — cloud sync stays on your current account until then.')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
