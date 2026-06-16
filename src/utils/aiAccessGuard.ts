import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import i18n from '@/i18n';

/**
 * Ensures the user is signed in with Google or Apple before allowing AI features.
 * Returns true only when authenticated via one of those providers.
 */
export async function ensureSignedInForAi(): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error(
        i18n.t('ai.signInRequired', 'Sign in with Google or Apple to use AI features'),
      );
      return false;
    }
    const provider = String(user.app_metadata?.provider || '').toLowerCase();
    const providers: string[] = Array.isArray((user.app_metadata as any)?.providers)
      ? ((user.app_metadata as any).providers as string[])
      : [];
    const allowed = ['google', 'apple'];
    const ok =
      allowed.includes(provider) ||
      providers.some((p) => allowed.includes(String(p).toLowerCase()));
    if (!ok) {
      toast.error(
        i18n.t('ai.signInRequired', 'Sign in with Google or Apple to use AI features'),
      );
      return false;
    }
    return true;
  } catch {
    toast.error(
      i18n.t('ai.signInRequired', 'Sign in with Google or Apple to use AI features'),
    );
    return false;
  }
}