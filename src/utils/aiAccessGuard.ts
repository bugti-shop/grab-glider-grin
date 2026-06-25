import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import i18n from '@/i18n';

/**
 * Ensures the user is signed in before allowing AI features.
 * Any authenticated user (Google, Apple, email, anything) is allowed —
 * the server-side edge functions enforce paid entitlements separately.
 */
export async function ensureSignedInForAi(): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error(
        i18n.t('ai.signInRequired', 'Sign in to use AI features'),
      );
      return false;
    }
    return true;
  } catch {
    toast.error(
      i18n.t('ai.signInRequired', 'Sign in to use AI features'),
    );
    return false;
  }
}
