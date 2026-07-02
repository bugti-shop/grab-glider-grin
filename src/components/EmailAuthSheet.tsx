import { useState, useEffect, useRef } from 'react';
import { X, Loader2, Mail, KeyRound, ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  startEmailSignup,
  resendSignupOtp,
  verifySignupOtp,
  signInWithEmailPassword,
  sendPasswordReset,
} from '@/utils/emailAuth';
import type { GoogleUser } from '@/utils/googleAuth';

type Mode = 'signin' | 'signup' | 'otp' | 'forgot';

interface Props {
  open: boolean;
  onClose: () => void;
  onSignedIn?: (user: GoogleUser) => void;
}

export function EmailAuthSheet({ open, onClose, onSignedIn }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [otpError, setOtpError] = useState<string | null>(null);
  const cooldownTimer = useRef<number | null>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    cooldownTimer.current = window.setTimeout(
      () => setResendCooldown((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => {
      if (cooldownTimer.current) window.clearTimeout(cooldownTimer.current);
    };
  }, [resendCooldown]);

  if (!open) return null;

  const startCooldown = () => setResendCooldown(45);

  const reset = () => {
    setMode('signin');
    setEmail(''); setPassword(''); setName(''); setOtp('');
    setOtpError(null); setResendCooldown(0);
  };

  const close = () => { reset(); onClose(); };

  const handleSignIn = async () => {
    if (!email || !password) {
      toast({ title: t('emailAuth.missingFields', 'Enter email and password'), variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const u = await signInWithEmailPassword(email.trim(), password);
      toast({ title: t('emailAuth.signedIn', 'Signed in') });
      onSignedIn?.(u);
      close();
    } catch (err: any) {
      toast({
        title: t('emailAuth.signInFailed', 'Sign-in failed'),
        description: err?.message || '',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleStartSignup = async () => {
    if (!email || !password) {
      toast({ title: t('emailAuth.missingFields', 'Enter email and password'), variant: 'destructive' });
      return;
    }
    if (password.length < 8) {
      toast({ title: t('emailAuth.weakPassword', 'Use at least 8 characters'), variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      await startEmailSignup(email.trim(), password, name.trim() || undefined);
      toast({
        title: t('emailAuth.otpSent', 'Verification code sent'),
        description: t('emailAuth.otpSentDesc', 'Check your inbox for a 6-digit code from Flowist.'),
      });
      setOtp('');
      setOtpError(null);
      startCooldown();
      setMode('otp');
    } catch (err: any) {
      toast({
        title: t('emailAuth.signupFailed', 'Could not create account'),
        description: err?.message || '',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length < 6) {
      setOtpError(t('emailAuth.enterOtp', 'Enter the 6-digit code'));
      return;
    }
    setLoading(true);
    setOtpError(null);
    try {
      // Cloud sync + session only persist AFTER Supabase confirms this OTP.
      const u = await verifySignupOtp(email.trim(), otp);
      toast({
        title: t('emailAuth.accountReady', 'Account verified'),
        description: t('emailAuth.syncEnabled', 'Cloud sync is now active on this device.'),
      });
      onSignedIn?.(u);
      close();
    } catch (err: any) {
      const msg = err?.message || t('emailAuth.otpInvalid', 'Invalid or expired code');
      setOtpError(msg);
      toast({
        title: t('emailAuth.otpInvalid', 'Invalid or expired code'),
        description: msg,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || loading) return;
    setLoading(true);
    setOtpError(null);
    try {
      await resendSignupOtp(email.trim());
      startCooldown();
      toast({
        title: t('emailAuth.otpResent', 'New code sent'),
        description: t('emailAuth.otpResentDesc', 'Check your inbox for the latest 6-digit code.'),
      });
    } catch (err: any) {
      toast({
        title: t('emailAuth.resendFailed', 'Could not resend code'),
        description: err?.message || '',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async () => {
    if (!email) {
      toast({ title: t('emailAuth.missingEmail', 'Enter your email'), variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      await sendPasswordReset(email.trim());
      toast({
        title: t('emailAuth.resetSent', 'Reset email sent'),
        description: t('emailAuth.resetSentDesc', 'Check your inbox for password reset instructions.'),
      });
      setMode('signin');
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message || '', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const title =
    mode === 'signup' ? t('emailAuth.createAccount', 'Create your Flowist account')
    : mode === 'otp' ? t('emailAuth.verifyEmail', 'Verify your email')
    : mode === 'forgot' ? t('emailAuth.resetPassword', 'Reset password')
    : t('emailAuth.signInTitle', 'Sign in with email');

  return (
    <div
      className="fixed inset-0 z-[400] flex items-end justify-center bg-black/50 backdrop-blur-sm"
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[480px] bg-white rounded-t-3xl p-6 pb-8 shadow-2xl animate-in slide-in-from-bottom duration-200"
        style={{ paddingBottom: 'max(var(--safe-bottom, 0px), 24px)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {mode !== 'signin' && mode !== 'signup' && (
              <button onClick={() => setMode(mode === 'otp' ? 'signup' : 'signin')} className="p-1 -ml-1">
                <ArrowLeft className="h-5 w-5 text-[#1a1a1a]" />
              </button>
            )}
            <div className="flex items-center gap-2">
              <img src="/favicon.webp?v=3" alt="Flowist" className="w-6 h-6" />
              <h2 className="text-[18px] font-black text-[#1a1a1a] font-['Nunito']">{title}</h2>
            </div>
          </div>
          <button onClick={close} className="p-1.5 rounded-full hover:bg-black/5">
            <X className="h-5 w-5 text-[#666]" />
          </button>
        </div>

        {mode === 'signup' && (
          <div className="space-y-3">
            <Input
              type="text"
              placeholder={t('emailAuth.namePlaceholder', 'Your name (optional)')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-12 rounded-xl"
            />
            <Input
              type="email"
              autoComplete="email"
              placeholder={t('emailAuth.emailPlaceholder', 'Email address')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 rounded-xl"
            />
            <Input
              type="password"
              autoComplete="new-password"
              placeholder={t('emailAuth.passwordPlaceholder', 'Password (8+ characters)')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 rounded-xl"
            />
            <Button onClick={handleStartSignup} disabled={loading} className="w-full h-12 rounded-xl font-bold">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
              {t('emailAuth.sendCode', 'Send verification code')}
            </Button>
            <p className="text-center text-[13px] text-[#666]">
              {t('emailAuth.alreadyHave', 'Already have an account?')}{' '}
              <button onClick={() => setMode('signin')} className="font-bold text-[#1a1a1a] underline">
                {t('emailAuth.signIn', 'Sign in')}
              </button>
            </p>
          </div>
        )}

        {mode === 'signin' && (
          <div className="space-y-3">
            <Input
              type="email"
              autoComplete="email"
              placeholder={t('emailAuth.emailPlaceholder', 'Email address')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 rounded-xl"
            />
            <Input
              type="password"
              autoComplete="current-password"
              placeholder={t('emailAuth.passwordPlaceholder', 'Password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 rounded-xl"
            />
            <Button onClick={handleSignIn} disabled={loading} className="w-full h-12 rounded-xl font-bold">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('emailAuth.signIn', 'Sign in')}
            </Button>
            <div className="flex justify-between text-[13px]">
              <button onClick={() => setMode('forgot')} className="text-[#666] underline">
                {t('emailAuth.forgot', 'Forgot password?')}
              </button>
              <button onClick={() => setMode('signup')} className="font-bold text-[#1a1a1a] underline">
                {t('emailAuth.createAccountShort', 'Create account')}
              </button>
            </div>
          </div>
        )}

        {mode === 'otp' && (
          <div className="space-y-3">
            <p className="text-[13px] text-[#666] text-center">
              {t('emailAuth.otpInstructions', 'We sent a 6-digit code to {{email}}. Enter it below to finish creating your account.', { email })}
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
            <Button onClick={handleVerifyOtp} disabled={loading || otp.length < 6} className="w-full h-12 rounded-xl font-bold">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <KeyRound className="h-4 w-4 mr-2" />}
              {loading
                ? t('emailAuth.verifying', 'Verifying…')
                : t('emailAuth.verify', 'Verify & continue')}
            </Button>
            <button
              onClick={handleResend}
              disabled={loading || resendCooldown > 0}
              className="w-full text-center text-[13px] text-[#666] underline py-1 disabled:no-underline disabled:opacity-60"
            >
              {resendCooldown > 0
                ? t('emailAuth.resendIn', 'Resend code in {{s}}s', { s: resendCooldown })
                : t('emailAuth.resend', 'Resend code')}
            </button>
            <p className="text-[11px] text-[#999] text-center leading-relaxed">
              {t('emailAuth.syncNote', 'Cloud sync activates the moment your code is verified.')}
            </p>
          </div>
        )}

        {mode === 'forgot' && (
          <div className="space-y-3">
            <p className="text-[13px] text-[#666]">
              {t('emailAuth.forgotIntro', 'Enter your email and we will send you a link to reset your password.')}
            </p>
            <Input
              type="email"
              placeholder={t('emailAuth.emailPlaceholder', 'Email address')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 rounded-xl"
            />
            <Button onClick={handleForgot} disabled={loading} className="w-full h-12 rounded-xl font-bold">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {t('emailAuth.sendResetLink', 'Send reset link')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
