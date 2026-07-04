import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

/**
 * Handles the redirect from Supabase confirmation / recovery emails.
 * Supabase's client (with detectSessionInUrl=true by default) parses the
 * access_token & refresh_token from the URL hash and establishes a session
 * automatically. We wait for that session, then send the user into the app —
 * fully signed in, no manual sign-in step needed.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const [message, setMessage] = useState('Verifying your email…');

  useEffect(() => {
    let cancelled = false;

    // If a session hydrates (from the URL hash), route into the app.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (session?.user) {
        setMessage('Signed in! Opening Flowist…');
        // Small delay so the toast/route transition feels intentional.
        setTimeout(() => navigate('/', { replace: true }), 400);
      }
    });

    // Also check immediately in case the session was already established.
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (data.session?.user) {
        setMessage('Signed in! Opening Flowist…');
        setTimeout(() => navigate('/', { replace: true }), 400);
      }
    });

    // Safety timeout — if nothing happens in 8s, bail to home.
    const t = window.setTimeout(() => {
      if (!cancelled) navigate('/', { replace: true });
    }, 8000);

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      window.clearTimeout(t);
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background text-foreground px-6 text-center">
      <img src="/favicon.webp?v=3" alt="Flowist" className="w-12 h-12" />
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
