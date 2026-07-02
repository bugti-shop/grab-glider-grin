import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import i18n from '@/i18n';

/**
 * Ensures the user is signed in before allowing AI features.
 * Any authenticated user (Google, Apple, email, anything) is allowed —
 * the server-side edge functions enforce paid entitlements separately.
 */
export async function ensureSignedInForAi(): Promise<boolean> {
  const showGate = () => {
    toast.error(
      i18n.t('ai.signInRequired', 'Sign in to use AI features'),
      {
        description: i18n.t(
          'ai.signInRequiredDesc',
          'Even Pro subscribers need to sign in first so AI credits sync to your account.',
        ),
        duration: 5000,
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
    return true;
  } catch {
    showGate();
    return false;
  }
}
