import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Loader2, Users, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

interface InvitePreview {
  status: 'pending' | 'accepted' | 'expired';
  invite?: { email: string; role: string; expires_at: string };
  project?: { id: string; name: string; color?: string; emoji?: string };
  error?: string;
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export default function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [session, setSession] = useState<any>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(
          `${supabaseUrl}/functions/v1/accept-project-invite?token=${encodeURIComponent(token)}`,
          { headers: { apikey: supabaseAnonKey } },
        );
        const body = await res.json();
        if (!res.ok) setPreview({ status: body.status ?? 'expired', error: body.error });
        else setPreview(body);
      } catch {
        setPreview({ status: 'expired', error: 'Could not load invitation' });
      }
    })();
  }, [token]);

  const accept = async () => {
    if (!token) return;
    if (!session) {
      // Redirect through auth, come back here
      sessionStorage.setItem('pendingInviteToken', token);
      navigate(`/profile?redirect=${encodeURIComponent(`/invite/${token}`)}`);
      return;
    }
    setAccepting(true);
    try {
      const { data, error } = await supabase.functions.invoke('accept-project-invite', {
        body: { token },
      });
      if (error) throw error;
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
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md w-full p-8 text-center space-y-3">
          <XCircle className="h-12 w-12 mx-auto text-muted-foreground" />
          <h1 className="text-xl font-bold">
            {preview.status === 'accepted' ? 'Already accepted' : 'Invitation expired'}
          </h1>
          <p className="text-sm text-muted-foreground">{preview.error ?? 'Ask the project owner to send a new invitation.'}</p>
          <Button onClick={() => navigate('/')} variant="outline">Go home</Button>
        </Card>
      </div>
    );
  }

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

        <Button onClick={accept} disabled={accepting} className="w-full" size="lg">
          {accepting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
          {session ? 'Accept invitation' : 'Sign in to accept'}
        </Button>
        {session && session.user?.email && preview.invite && session.user.email.toLowerCase() !== preview.invite.email.toLowerCase() && (
          <p className="text-xs text-center text-amber-600 dark:text-amber-400">
            You're signed in as {session.user.email}. This invite is for {preview.invite.email}.
          </p>
        )}
      </Card>
    </div>
  );
}
