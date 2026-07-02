import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, Users, CheckCircle2, XCircle, Clock, AlertTriangle, MailX } from 'lucide-react';
import { toast } from 'sonner';

type Status = 'pending' | 'accepted' | 'expired' | 'invalid' | 'network_error';

interface InvitePreview {
  status: Status;
  invite?: { email: string; role: string; expires_at: string };
  project?: { id: string; name: string; color?: string; emoji?: string };
  error?: string;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const STATUS_META: Record<Exclude<Status, 'pending'>, { icon: any; title: string; hint: string; tint: string }> = {
  accepted: {
    icon: CheckCircle2, title: 'Already accepted',
    hint: 'This invitation has already been used. You should already be a member of the project.',
    tint: 'text-emerald-500',
  },
  expired: {
    icon: Clock, title: 'Invitation expired',
    hint: 'Ask the project owner to send you a fresh invitation.',
    tint: 'text-amber-500',
  },
  invalid: {
    icon: MailX, title: 'Invitation not found',
    hint: 'This link is invalid or has been revoked. Double-check the URL, or ask the project owner to resend it.',
    tint: 'text-destructive',
  },
  network_error: {
    icon: AlertTriangle, title: "Couldn't load invitation",
    hint: 'We hit a network issue reaching the server. Please try again in a moment.',
    tint: 'text-muted-foreground',
  },
};

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [session, setSession] = useState<any>(null);
  const [accepting, setAccepting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!token) { setPreview({ status: 'invalid' }); return; }
    setPreview(null);
    (async () => {
      try {
        const res = await fetch(
          `${supabaseUrl}/functions/v1/accept-project-invite?token=${encodeURIComponent(token)}`,
          { headers: { apikey: supabaseAnonKey } },
        );
        // Server distinguishes 404 (invalid) from 410 (accepted/expired)
        let body: any = {};
        try { body = await res.json(); } catch { /* ignore */ }
        if (res.status === 404) { setPreview({ status: 'invalid', error: body.error }); return; }
        if (res.ok) { setPreview(body); return; }
        const status: Status =
          body?.status === 'accepted' ? 'accepted' :
          body?.status === 'expired' ? 'expired' :
          'invalid';
        setPreview({ status, error: body?.error });
      } catch {
        setPreview({ status: 'network_error', error: 'Could not reach server' });
      }
    })();
  }, [token, reloadKey]);

  const accept = async () => {
    if (!token) return;
    if (!session) {
      sessionStorage.setItem('pendingInviteToken', token);
      navigate(`/profile?redirect=${encodeURIComponent(`/invite/${token}`)}`);
      return;
    }
    setAccepting(true);
    try {
      const { data, error } = await supabase.functions.invoke('accept-project-invite', {
        body: { token },
      });
      if (error) {
        // Edge functions return a non-2xx status → error is populated
        const msg = (data as any)?.error ?? error.message ?? 'Failed to accept';
        // If server says expired/accepted, downgrade the UI to that state
        if (/expired/i.test(msg)) setPreview((p) => ({ ...(p ?? {} as any), status: 'expired', error: msg }));
        else if (/already accepted/i.test(msg)) setPreview((p) => ({ ...(p ?? {} as any), status: 'accepted', error: msg }));
        else if (/invalid/i.test(msg)) setPreview((p) => ({ ...(p ?? {} as any), status: 'invalid', error: msg }));
        else toast.error(msg);
        return;
      }
      toast.success(`Joined ${preview?.project?.name ?? 'the project'}!`);
      navigate('/todo/today');
      return data;
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to accept');
    } finally { setAccepting(false); }
  };

  if (!preview) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (preview.status !== 'pending') {
    const meta = STATUS_META[preview.status];
    const Icon = meta.icon;
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md w-full p-8 text-center space-y-4">
          <Icon className={`h-12 w-12 mx-auto ${meta.tint}`} />
          <h1 className="text-xl font-bold">{meta.title}</h1>
          <p className="text-sm text-muted-foreground">{preview.error ?? meta.hint}</p>
          <div className="flex gap-2 justify-center pt-2">
            {preview.status === 'network_error' && (
              <Button onClick={() => setReloadKey((k) => k + 1)} variant="default">
                Try again
              </Button>
            )}
            <Button onClick={() => navigate('/')} variant="outline">Go home</Button>
          </div>
        </Card>
      </div>
    );
  }

  const wrongAccount = session?.user?.email && preview.invite &&
    session.user.email.toLowerCase() !== preview.invite.email.toLowerCase();

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-b from-background to-muted/20">
      <Card className="max-w-md w-full p-8 space-y-5">
        <div className="text-center space-y-2">
          <div className="h-16 w-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
            <Users className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">You're invited</h1>
          <p className="text-sm text-muted-foreground">
            Join <strong>{preview.project?.name ?? 'this project'}</strong> as a{' '}
            <strong>{preview.invite?.role}</strong> on Flowist.
          </p>
        </div>

        <div className="rounded-lg bg-muted/40 p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Invited email</span>
            <span className="font-medium">{preview.invite?.email}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-muted-foreground">Expires</span>
            <span className="font-medium">
              {preview.invite?.expires_at && new Date(preview.invite.expires_at).toLocaleDateString()}
            </span>
          </div>
        </div>

        <Button onClick={accept} disabled={accepting || wrongAccount} className="w-full" size="lg">
          {accepting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
          {session ? 'Accept invitation' : 'Sign in to accept'}
        </Button>
        {wrongAccount && (
          <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div>
              You're signed in as <strong>{session.user.email}</strong>, but this invite is for{' '}
              <strong>{preview.invite?.email}</strong>. Sign out and sign back in with the invited account.
              <div className="mt-2">
                <Button
                  size="sm" variant="outline"
                  onClick={async () => { await supabase.auth.signOut(); toast.info('Signed out'); }}
                >
                  Sign out
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
