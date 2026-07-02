import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import i18n from '@/i18n';
import { setPendingAiIntent, clearPendingAiIntent, PendingAiIntentKind } from './pendingAiIntent';

interface EnsureOptions {
  /** If provided, we remember this intent so the flow auto-resumes after sign-in. */
  intent?: PendingAiIntentKind;
  /** Path (pathname + search) to return to after sign-in. Defaults to the current URL. */
  returnPath?: string;
}

/**
 * Ensures the user is signed in before allowing AI features.
 * Any authenticated user (Google, Apple, email, anything) is allowed —
 * the server-side edge functions enforce paid entitlements separately.
 *
 * Pass `intent` so the scanner (or other AI flow) resumes automatically after
 * the user completes sign-in, without them having to tap the icon again.
 */
export async function ensureSignedInForAi(opts: EnsureOptions = {}): Promise<boolean> {
  const showGate = () => {
    if (opts.intent) setPendingAiIntent(opts.intent, opts.returnPath);
    toast.error(
      i18n.t('ai.signInRequired', 'Sign in to use AI features'),
      {
        description: i18n.t(
          'ai.signInRequiredDesc',
          'Even Pro subscribers need to sign in first so AI credits sync to your account.',
        ),
        duration: 6000,
        action: {
          label: i18n.t('ai.signIn', 'Sign in'),
          onClick: () => {
            try {
              window.location.assign('/auth');
            } catch {
              /* noop */
            }
          },
        },
      },
    );
  };
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      showGate();
      return false;
    }
    // Signed in — no pending intent needed.
    clearPendingAiIntent();
    return true;
  } catch {
    showGate();
    return false;
  }
}
