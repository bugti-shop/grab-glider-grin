import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Users, LogOut, Check, Loader2, Crown, UserPlus, Copy, QrCode, Eye, Pencil, ShieldCheck } from 'lucide-react';
import { useSketchCollaboration } from '@/hooks/useSketchCollaboration';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import type { CollabRole } from '@/utils/sketchCollaboration';

interface SketchCollabToolbarProps {
  collaboration: ReturnType<typeof useSketchCollaboration>;
}

export const SketchCollabToolbar = ({ collaboration }: SketchCollabToolbarProps) => {
  const { t } = useTranslation();
  const { isConnected, users, roomId, myRole, isRoomCreator, createRoom, joinExistingRoom, leave, changeUserRole } = collaboration;
  const { requireFeature } = useSubscription();
  const [loading, setLoading] = useState(false);
  const [joining, setJoining] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joinRole, setJoinRole] = useState<CollabRole>('editor');

  const handleCreate = async () => {
    if (!requireFeature('sketch_collab')) return;
    setLoading(true);
    try {
      await createRoom();
      toast.success(t('collab.roomCreated'));
    } catch (e: any) {
      toast.error(e.message || t('collab.failedToCreateRoom'));
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!requireFeature('sketch_collab')) return;
    const code = joinCode.trim().toUpperCase();
    if (!code || code.length < 4) {
      toast.error(t('collab.enterValidCode'));
      return;
    }
    setJoining(true);
    try {
      await joinExistingRoom(code, joinRole);
      toast.success(t('collab.joinedAs', { role: joinRole }));
      setShowJoinInput(false);
      setJoinCode('');
    } catch (e: any) {
      toast.error(e.message || t('collab.roomNotFound'));
    } finally {
      setJoining(false);
    }
  };

  const handleCopyCode = async () => {
    if (!roomId) return;
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      toast.success(t('collab.codeCopied'));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t('collab.failedToCopy'));
    }
  };

  const handleLeave = async () => {
    try {
      await leave();
    } catch (e) {
      console.warn('Leave failed:', e);
    }
  };

  const toggleUserRole = async (userId: string, currentRole: CollabRole | undefined) => {
    const newRole = currentRole === 'viewer' ? 'editor' : 'viewer';
    await changeUserRole(userId, newRole);
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col border-b border-border">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50">
          <Users className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{t('collab.collaborate', 'Collaborate')}</span>
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowJoinInput(!showJoinInput)}
              className="h-7 text-xs gap-1.5"
            >
              <UserPlus className="w-3.5 h-3.5" />{t('collab.join')}</Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCreate}
              disabled={loading}
              className="h-7 text-xs gap-1.5"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Crown className="w-3.5 h-3.5 text-amber-500" />}
              Create
            </Button>
          </div>
        </div>
        {showJoinInput && (
          <div className="flex flex-col gap-2 px-3 py-2 bg-muted/30">
            <div className="flex items-center gap-2">
              <Input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
                placeholder={t('collab.enterCode')}
                className="h-7 text-xs flex-1 font-mono tracking-widest text-center uppercase"
                onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                maxLength={6}
                autoFocus
              />
              <Button
                variant="default"
                size="sm"
                onClick={handleJoin}
                disabled={joining || joinCode.trim().length < 4}
                className="h-7 text-xs gap-1.5"
              >
                {joining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                Join
              </Button>
            </div>
            {/* Role selection */}
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">{t('collab.joinAs')}</span>
              <Button
                variant={joinRole === 'editor' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setJoinRole('editor')}
                className="h-6 text-[10px] gap-1 px-2"
              >
                <Pencil className="w-3 h-3" />{t('collab.editor')}</Button>
              <Button
                variant={joinRole === 'viewer' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setJoinRole('viewer')}
                className="h-6 text-[10px] gap-1 px-2"
              >
                <Eye className="w-3 h-3" />{t('collab.viewer')}</Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col border-b border-primary/20">
      {/* Room code display */}
      <div className="flex items-center justify-center gap-2 px-3 py-2 bg-primary/5">
        <span className="text-[10px] text-muted-foreground uppercase">{t('collab.roomCode')}</span>
        <span className="font-mono text-sm font-bold tracking-[0.3em] text-primary">{roomId}</span>
        <Button variant="ghost" size="sm" onClick={handleCopyCode} className="h-6 w-6 p-0">
          {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setShowQR(!showQR)} className="h-6 w-6 p-0">
          <QrCode className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* My role badge */}
      <div className="flex items-center justify-center gap-1.5 px-3 py-1 bg-primary/5">
        {myRole === 'viewer' ? (
          <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full flex items-center gap-1">
            <Eye className="w-3 h-3" /> {t('collab.viewer')}
          </span>
        ) : (
          <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full flex items-center gap-1">
            <Pencil className="w-3 h-3" /> {t('collab.editor')}
          </span>
        )}
        {isRoomCreator && (
          <span className="text-[10px] bg-amber-500/10 text-amber-600 px-2 py-0.5 rounded-full flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" /> Host
          </span>
        )}
      </div>

      {/* QR Code */}
      {showQR && (
        <div className="flex flex-col items-center gap-2 px-3 py-3 bg-background">
          <div className="bg-white p-3 rounded-lg">
            <QRCodeSVG
              value={`${window.location.origin}?collab=${roomId}`}
              size={140}
              level="M"
            />
          </div>
          <span className="text-[10px] text-muted-foreground">Scan to join room</span>
        </div>
      )}

      {/* Users & actions */}
      <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/5">
        <div className="flex items-center gap-1">
          {users.map((u) => (
            <div
              key={u.id}
              className="relative group"
            >
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 cursor-pointer"
                style={{ backgroundColor: u.color, color: '#fff' }}
                title={`${u.name} (${u.role || 'editor'})`}
                onClick={() => isRoomCreator && u.id !== collaboration.myUserId ? toggleUserRole(u.id, u.role) : undefined}
              >
                {u.name.charAt(0).toUpperCase()}
              </div>
              {/* Role indicator */}
              {u.role === 'viewer' && (
                <Eye className="w-2.5 h-2.5 absolute -bottom-0.5 -right-0.5 text-muted-foreground bg-background rounded-full" />
              )}
            </div>
          ))}
        </div>

        <span className="text-xs text-muted-foreground">
          {users.length} online
        </span>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLeave}
            className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive"
          >
            <LogOut className="w-3.5 h-3.5" />
            Leave
          </Button>
        </div>
      </div>
    </div>
  );
};
