import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { UserPlus, X, Loader2, Mail, Crown, Edit3, Eye, Link2, Copy, Sparkles, Trash2 } from 'lucide-react';
import { useProjectMembers, type ProjectRole } from '@/hooks/useProjects';
import { useHasTeamPlan } from '@/hooks/useHasTeamPlan';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  projectId: string | null;
  projectName?: string;
}

const ROLE_META: Record<ProjectRole, { label: string; icon: any; hint: string }> = {
  owner: { label: 'Owner', icon: Crown, hint: 'Full control' },
  editor: { label: 'Editor', icon: Edit3, hint: 'Can add & edit' },
  viewer: { label: 'Viewer', icon: Eye, hint: 'Read only' },
};

interface GuestLink {
  id: string;
  token: string;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export function ShareProjectSheet({ isOpen, onClose, projectId, projectName }: Props) {
  const { members, invitations, myRole, invite, removeMember, changeRole, cancelInvite, refresh } = useProjectMembers(projectId);
  const hasTeamPlan = useHasTeamPlan();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [sending, setSending] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<{ userId: string; name: string } | null>(null);
  const [guestLinks, setGuestLinks] = useState<GuestLink[]>([]);
  const [creatingLink, setCreatingLink] = useState(false);

  const isOwner = myRole === 'owner';
  const canManageGuests = isOwner && hasTeamPlan;

  useEffect(() => {
    if (!projectId || !isOwner) { setGuestLinks([]); return; }
    supabase.from('project_guest_links')
      .select('id, token, expires_at, revoked_at, created_at')
      .eq('project_id', projectId)
      .is('revoked_at', null)
      .order('created_at', { ascending: false })
      .then(({ data }) => setGuestLinks((data ?? []) as GuestLink[]));
  }, [projectId, isOwner]);

  const submit = async () => {
    const clean = email.trim();
    if (!clean) return;
    setSending(true);
    try {
      await invite(clean, role);
      toast.success(`Invitation sent to ${clean}`);
      setEmail('');
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to send invite');
    } finally { setSending(false); }
  };

  const doChangeRole = async (userId: string, next: ProjectRole) => {
    try {
      await changeRole(userId, next);
      toast.success('Role updated');
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to update role');
    }
  };

  const confirmRemove = async () => {
    if (!pendingRemoval) return;
    const { userId, name } = pendingRemoval;
    setPendingRemoval(null);
    try {
      await removeMember(userId);
      toast.success(`Removed ${name}`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to remove member');
    }
  };

  const createGuestLink = async () => {
    if (!projectId) return;
    setCreatingLink(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) throw new Error('Sign in required');
      const token = crypto.randomUUID().replace(/-/g, '');
      const { data, error } = await supabase.from('project_guest_links')
        .insert({ project_id: projectId, created_by: uid, token })
        .select('id, token, expires_at, revoked_at, created_at')
        .single();
      if (error) throw error;
      setGuestLinks((prev) => [data as GuestLink, ...prev]);
      toast.success('Guest link created');
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to create link');
    } finally { setCreatingLink(false); }
  };

  const revokeGuestLink = async (id: string) => {
    const { error } = await supabase.from('project_guest_links')
      .update({ revoked_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast.error(error.message); return; }
    setGuestLinks((prev) => prev.filter((l) => l.id !== id));
    toast.success('Guest link revoked');
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/g/${token}`;
    navigator.clipboard.writeText(url).then(
      () => toast.success('Link copied'),
      () => toast.error('Copy failed'),
    );
  };

  return (
    <Sheet open={isOpen} onOpenChange={(o) => { if (!o) { onClose(); refresh(); } }}>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Share {projectName ? `“${projectName}”` : 'project'}</SheetTitle>
        </SheetHeader>

        {isOwner && (
          <div className="mt-4 space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">Invite by email</label>
            <div className="flex gap-2">
              <Input
                type="email" inputMode="email" placeholder="teammate@company.com"
                value={email} onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submit()} disabled={sending}
              />
              <Select value={role} onValueChange={(v) => setRole(v as any)}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={submit} disabled={sending || !email.trim()}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}

        <div className="mt-6">
          <div className="text-xs font-semibold text-muted-foreground mb-2">Members ({members.length})</div>
          <div className="space-y-1">
            {members.map((m) => {
              const meta = ROLE_META[m.role];
              const initial = (m.display_name || m.email || '?').charAt(0).toUpperCase();
              const displayName = m.display_name || m.email || m.user_id.slice(0, 8);
              return (
                <div key={m.user_id} className="flex items-center gap-3 py-2">
                  <Avatar className="h-9 w-9">
                    {m.avatar_url && <AvatarImage src={m.avatar_url} />}
                    <AvatarFallback>{initial}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{displayName}</div>
                    <div className="text-xs text-muted-foreground truncate">{m.email}</div>
                  </div>
                  {isOwner && m.role !== 'owner' ? (
                    <Select value={m.role} onValueChange={(v) => doChangeRole(m.user_id, v as ProjectRole)}>
                      <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="editor">Editor</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <meta.icon className="h-3 w-3" /> {meta.label}
                    </span>
                  )}
                  {isOwner && m.role !== 'owner' && (
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8"
                      onClick={() => setPendingRemoval({ userId: m.user_id, name: displayName })}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {invitations.length > 0 && (
          <div className="mt-6">
            <div className="text-xs font-semibold text-muted-foreground mb-2">Pending invitations</div>
            <div className="space-y-1">
              {invitations.map((inv) => (
                <div key={inv.id} className="flex items-center gap-3 py-2">
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{inv.email}</div>
                    <div className="text-xs text-muted-foreground">
                      {inv.role} · expires {new Date(inv.expires_at).toLocaleDateString()}
                    </div>
                  </div>
                  {isOwner && (
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8"
                      onClick={() => cancelInvite(inv.id).then(() => toast.success('Invite cancelled')).catch((e) => toast.error(e.message))}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Guest links — Teams tier only */}
        {isOwner && (
          <div className="mt-6 border-t pt-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground">Guest links (read-only)</span>
              </div>
              {!canManageGuests && (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                  <Sparkles className="h-3 w-3" /> Teams plan
                </span>
              )}
            </div>
            {!canManageGuests ? (
              <p className="text-xs text-muted-foreground">
                Upgrade to the Teams plan to share a read-only link with anyone — no sign-in required.
              </p>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={createGuestLink} disabled={creatingLink} className="w-full">
                  {creatingLink ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" /> : <Link2 className="h-3.5 w-3.5 mr-2" />}
                  Create guest link
                </Button>
                {guestLinks.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {guestLinks.map((l) => (
                      <div key={l.id} className="flex items-center gap-2 rounded-md border p-2 text-xs">
                        <code className="flex-1 truncate text-muted-foreground">{`${window.location.origin}/g/${l.token}`}</code>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copyLink(l.token)}>
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => revokeGuestLink(l.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {!isOwner && members.length > 0 && (
          <p className="mt-4 text-xs text-muted-foreground text-center">
            Only the owner can invite or remove members.
          </p>
        )}

        <AlertDialog open={!!pendingRemoval} onOpenChange={(o) => !o && setPendingRemoval(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {pendingRemoval?.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                They will lose access to this project and be unassigned from any tasks in it.
                You can invite them back at any time.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmRemove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}
