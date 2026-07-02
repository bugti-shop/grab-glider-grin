import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { UserPlus, X, Loader2, Mail, Crown, Edit3, Eye } from 'lucide-react';
import { useProjectMembers, type ProjectRole } from '@/hooks/useProjects';
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

export function ShareProjectSheet({ isOpen, onClose, projectId, projectName }: Props) {
  const { members, invitations, myRole, invite, removeMember, changeRole, cancelInvite } = useProjectMembers(projectId);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [sending, setSending] = useState(false);

  const isOwner = myRole === 'owner';

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

  return (
    <Sheet open={isOpen} onOpenChange={(o) => !o && onClose()}>
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
              return (
                <div key={m.user_id} className="flex items-center gap-3 py-2">
                  <Avatar className="h-9 w-9">
                    {m.avatar_url && <AvatarImage src={m.avatar_url} />}
                    <AvatarFallback>{initial}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{m.display_name || m.email || m.user_id.slice(0, 8)}</div>
                    <div className="text-xs text-muted-foreground truncate">{m.email}</div>
                  </div>
                  {isOwner && m.role !== 'owner' ? (
                    <Select value={m.role} onValueChange={(v) => changeRole(m.user_id, v as ProjectRole).catch((e) => toast.error(e.message))}>
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
                    <Button variant="ghost" size="icon" className="h-8 w-8"
                      onClick={() => removeMember(m.user_id).then(() => toast.success('Removed')).catch((e) => toast.error(e.message))}>
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
                    <Button variant="ghost" size="icon" className="h-8 w-8"
                      onClick={() => cancelInvite(inv.id).then(() => toast.success('Invite cancelled')).catch((e) => toast.error(e.message))}>
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {!isOwner && members.length > 0 && (
          <p className="mt-4 text-xs text-muted-foreground text-center">
            Only the owner can invite or remove members.
          </p>
        )}
      </SheetContent>
    </Sheet>
  );
}
