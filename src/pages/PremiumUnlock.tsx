/**
 * Web-only premium unlock route: /premium-unlock
 *
 * SECURITY: The unlock code is NEVER shipped in the client bundle. The admin
 * must type it into the input below. The server (premium-web-unlock edge
 * function) compares it against the ADMIN_UNLOCK_CODE env var. If it matches
 * AND the caller is signed in, a real `web_premium_unlock` entitlement is
 * granted server-side. All other clients (AI extract, web clipper, etc.)
 * then see Pro via the normal entitlement path — there is no separate
 * client-supplied bypass anymore.
 */
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { setSetting } from '@/utils/settingsStorage';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const PremiumUnlock = () => {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('premium-web-unlock', {
        body: { code: code.trim() },
      });
      if (fnErr) throw fnErr;
      if (!data || (data as { ok?: boolean }).ok !== true) {
        throw new Error('Invalid code');
      }
      try {
        await setSetting('flowist_admin_bypass', true);
        localStorage.setItem('flowist_stripe_plan', 'team');
        localStorage.setItem('flowist_rc_product', 'com.flowist.app.team.year');
      } catch {}
      try { window.dispatchEvent(new Event('adminBypassActivated')); } catch {}
      setOk(true);
      setTimeout(() => navigate('/', { replace: true }), 800);
    } catch (err) {
      console.warn('PremiumUnlock: unlock failed', err);
      setError('Invalid code or you are not signed in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground px-6">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 text-center">
        <h1 className="text-2xl font-bold">Premium Unlock</h1>
        {ok ? (
          <p className="text-sm text-muted-foreground">Unlocked. Redirecting…</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Enter your admin unlock code. You must be signed in.
            </p>
            <Input
              type="password"
              autoComplete="off"
              placeholder="Unlock code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={busy}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button type="submit" disabled={busy || !code.trim()} className="w-full">
              {busy ? 'Unlocking…' : 'Unlock'}
            </Button>
          </>
        )}
      </form>
    </div>
  );
};

export default PremiumUnlock;
