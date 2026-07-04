import { useState, useEffect, useRef } from 'react';
import { X, Loader2, Mail, ArrowLeft, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  startEmailSignup,
  signInWithEmailPassword,
  sendPasswordReset,
} from '@/utils/emailAuth';
import { supabase } from '@/integrations/supabase/client';
import type { GoogleUser } from '@/utils/googleAuth';

type Mode = 'signin' | 'signup' | 'verify-link' | 'forgot';

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
  const [showPassword, setShowPassword] = useState(false);
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
    setOtpError(null); setResendCooldown(0); setShowPassword(false);
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
      // Supabase returns "Invalid login credentials" for both wrong-password
      // and no-such-account. Nudge the user to Create Account first so a
      // brand-new visitor doesn't get stuck on the sign-in tab.
      const raw = String(err?.message || '').toLowerCase();
      const code = String(err?.code || err?.name || '').toLowerCase();
      const looksLikeNoAccount =
        code.includes('invalid_credentials') ||
        raw.includes('invalid login credentials') ||
        raw.includes('invalid credentials') ||
        raw.includes('user not found') ||
        raw.includes('email not confirmed');
      if (looksLikeNoAccount) {
        toast({
          title: t('emailAuth.noAccountTitle', 'Please create an account first'),
          description: t(
            'emailAuth.noAccountDesc',
            "We couldn't find an account for that email. Tap Create account to sign up.",
          ),
          variant: 'destructive',
        });
        // Prefill the signup form with what they already typed so they can
        // just add a name and hit Send verification code.
        setMode('signup');
      } else {
        toast({
          title: t('emailAuth.signInFailed', 'Sign-in failed'),
          description: err?.message || '',
          variant: 'destructive',
        });
      }
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
        title: t('emailAuth.linkSent', 'Verification email sent'),
        description: t('emailAuth.linkSentDesc', 'Check your inbox and click the link to verify your email.'),
      });
      setOtpError(null);
      setMode('verify-link');
    } catch (err: any) {
      const raw = String(err?.message || '').toLowerCase();
      const code = String(err?.code || err?.name || '').toLowerCase();
      const status = Number(err?.status ?? err?.statusCode ?? 0);
      const looksLikeExisting =
        code.includes('user_already_exists') ||
        code.includes('email_exists') ||
        raw.includes('already registered') ||
        raw.includes('already been registered') ||
        raw.includes('user already') ||
        (status === 422 && raw.includes('registered'));
      if (looksLikeExisting) {
        toast({
          title: t('emailAuth.existingAccountTitle', 'This email already has an account'),
          description: t(
            'emailAuth.existingAccountDesc',
            'Please sign in with your password instead.',
          ),
          variant: 'destructive',
        });
        setMode('signin');
      } else {
        toast({
          title: t('emailAuth.signupFailed', 'Could not create account'),
          description: err?.message || '',
          variant: 'destructive',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // While the user is on the "check your email" screen, listen for the Supabase
  // session that appears the moment they click the verification link — whether
  // that happens in this same WebView (link opens the app via deep link) or on
  // a different tab (Supabase broadcasts via storage events). When it appears,
  // we're already signed in — just close the sheet.
  useEffect(() => {
    if (mode !== 'verify-link') return;
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session?.user) return;
      try {
        // Re-hydrate our local GoogleUser cache from the fresh session.
        const u = await signInWithEmailPassword(email.trim(), password).catch(async () => {
          // If password sign-in fails (edge case: user already fully signed in
          // via the link in the same WebView), fall back to session data.
          const meta = (session.user.user_metadata || {}) as Record<string, unknown>;
          return {
            email: session.user.email || email,
            name: (meta.full_name as string) || (meta.name as string) || session.user.email || email,
            picture: '',
            accessToken: session.access_token,
            uid: session.user.id,
            accessTokenExpiresAt: Date.now() + 3500 * 1000,
            expiresAt: Date.now() + 365 * 24 * 3600 * 1000,
          } as GoogleUser;
        });
        toast({
          title: t('emailAuth.accountReady', 'Account verified'),
          description: t('emailAuth.syncEnabled', 'Cloud sync is now active on this device.'),
        });
        onSignedIn?.(u);
        close();
      } catch {
        /* ignore */
      }
    });
    return () => { sub.subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Manual "I've verified — sign me in" fallback for mobile flows where the
  // link opens an external browser and the app WebView never sees the session.
  // Reuses the password the user just typed — no re-entry needed.
  const handleManualContinue = async () => {
    setLoading(true);
    try {
      const u = await signInWithEmailPassword(email.trim(), password);
      toast({ title: t('emailAuth.accountReady', 'Account verified') });
      onSignedIn?.(u);
      close();
    } catch (err: any) {
      const raw = String(err?.message || '').toLowerCase();
      if (raw.includes('email not confirmed') || raw.includes('not confirmed')) {
        toast({
          title: t('emailAuth.notVerifiedYet', 'Not verified yet'),
          description: t('emailAuth.notVerifiedYetDesc', 'Please click the verification link in your email first, then tap Continue.'),
          variant: 'destructive',
        });
      } else {
        toast({
          title: t('emailAuth.signInFailed', 'Sign-in failed'),
          description: err?.message || '',
          variant: 'destructive',
        });
      }
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
    : mode === 'verify-link' ? t('emailAuth.verifyEmail', 'Verify your email')
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
              <button onClick={() => setMode(mode === 'verify-link' ? 'signup' : 'signin')} className="p-1 -ml-1">
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
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder={t('emailAuth.passwordPlaceholder', 'Password (8+ characters)')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 rounded-xl pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={
                  showPassword
                    ? t('emailAuth.hidePassword', 'Hide password')
                    : t('emailAuth.showPassword', 'Show password')
                }
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-[#666] hover:text-[#1a1a1a] rounded-md"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
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
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder={t('emailAuth.passwordPlaceholder', 'Password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 rounded-xl pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={
                  showPassword
                    ? t('emailAuth.hidePassword', 'Hide password')
                    : t('emailAuth.showPassword', 'Show password')
                }
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-[#666] hover:text-[#1a1a1a] rounded-md"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
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

        {mode === 'verify-link' && (
          <div className="space-y-4">
            <div className="flex flex-col items-center text-center gap-2 pt-1">
              <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7 text-emerald-600" />
              </div>
              <p className="text-[15px] font-bold text-[#1a1a1a]">
                {t('emailAuth.checkYourInbox', 'Check your inbox')}
              </p>
              <p className="text-[13px] text-[#666] leading-relaxed">
                {t(
                  'emailAuth.linkInstructions',
                  'We sent a verification link to {{email}}. Tap the link in that email — it will open Flowist and sign you in automatically.',
                  { email },
                )}
              </p>
            </div>
            <Button
              onClick={handleManualContinue}
              disabled={loading}
              className="w-full h-12 rounded-xl font-bold"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {t('emailAuth.iClickedLink', "I've verified — continue")}
            </Button>
            {otpError && (
              <p className="text-[12px] text-red-600 text-center -mt-1">{otpError}</p>
            )}
            <p className="text-[11px] text-[#999] text-center leading-relaxed">
              {t(
                'emailAuth.linkSyncNote',
                "Didn't get it? Check your spam folder. The link expires in 30 minutes.",
              )}
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
