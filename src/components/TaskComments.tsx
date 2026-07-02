import { useMemo, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { MessageSquare, Send, Trash2, AtSign } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useTaskComments } from '@/hooks/useTaskComments';
import { useProjectMembers } from '@/hooks/useProjects';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  taskId: string;
  projectId?: string | null;
}

/**
 * Threaded comments with @mentions. Mention suggestions come from project
 * membership; when the task is personal (no project), @mentions are disabled.
 */
export function TaskComments({ taskId, projectId }: Props) {
  const { comments, post, remove } = useTaskComments(taskId);
  const { members } = useProjectMembers(projectId ?? null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [mentionOpen, setMentionOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useMemo(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  const mentionMap = useMemo(() => {
    const m = new Map<string, { name: string; id: string }>();
    members.forEach((mem) => {
      const name = (mem.display_name || mem.email || mem.user_id.slice(0, 8)).replace(/\s+/g, '');
      m.set(mem.user_id, { name, id: mem.user_id });
    });
    return m;
  }, [members]);

  const send = async () => {
    if (!draft.trim() || sending) return;
    // Extract mention user ids by matching @name against project members
    const mentions: string[] = [];
    for (const [id, { name }] of mentionMap) {
      const re = new RegExp(`(^|\\s)@${name}\\b`, 'i');
      if (re.test(draft)) mentions.push(id);
    }
    setSending(true);
    try {
      await post(draft, mentions);
      setDraft('');
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to post');
    } finally { setSending(false); }
  };

  const insertMention = (name: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? draft.length;
    // Replace a trailing "@" or partial with the mention
    const before = draft.slice(0, start).replace(/@[\w]*$/, '');
    const after = draft.slice(start);
    const next = `${before}@${name} ${after}`;
    setDraft(next);
    setMentionOpen(false);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = before.length + name.length + 2;
      ta.setSelectionRange(pos, pos);
    });
  };

  const renderBody = (body: string) => {
    if (!mentionMap.size) return body;
    const names = Array.from(mentionMap.values()).map((m) => m.name).join('|');
    const re = new RegExp(`@(${names})\\b`, 'gi');
    const parts: (string | JSX.Element)[] = [];
    let lastIdx = 0;
    body.replace(re, (match, name, idx) => {
      if (idx > lastIdx) parts.push(body.slice(lastIdx, idx));
      parts.push(
        <span key={`m-${idx}`} className="text-primary font-medium bg-primary/10 px-1 rounded">
          @{name}
        </span>,
      );
      lastIdx = idx + match.length;
      return match;
    });
    if (lastIdx < body.length) parts.push(body.slice(lastIdx));
    return <>{parts}</>;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <MessageSquare className="h-4 w-4" />
        Comments {comments.length > 0 && <span className="text-muted-foreground">({comments.length})</span>}
      </div>

      <div className="space-y-3">
        {comments.map((c) => {
          const initial = (c.display_name || c.email || '?').charAt(0).toUpperCase();
          return (
            <div key={c.id} className="flex gap-2 group">
              <Avatar className="h-7 w-7 flex-shrink-0">
                {c.avatar_url && <AvatarImage src={c.avatar_url} />}
                <AvatarFallback className="text-xs">{initial}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-medium truncate">
                    {c.display_name || c.email || 'Someone'}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                    {c.edited_at && ' · edited'}
                  </span>
                </div>
                <div className="text-sm whitespace-pre-wrap break-words leading-snug">
                  {renderBody(c.body)}
                </div>
              </div>
              {c.user_id === currentUserId && (
                <Button
                  variant="ghost" size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100"
                  onClick={() => remove(c.id).catch((e) => toast.error(e.message))}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          );
        })}
        {comments.length === 0 && (
          <p className="text-xs text-muted-foreground italic">No comments yet.</p>
        )}
      </div>

      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); }
          }}
          placeholder={projectId ? 'Write a comment. Use @ to mention…' : 'Write a comment…'}
          className="min-h-[70px] pr-20 resize-none"
        />
        <div className="absolute right-2 bottom-2 flex items-center gap-1">
          {projectId && mentionMap.size > 0 && (
            <Popover open={mentionOpen} onOpenChange={setMentionOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7"><AtSign className="h-3.5 w-3.5" /></Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-1">
                <div className="text-[10px] text-muted-foreground px-2 py-1">Mention a member</div>
                {Array.from(mentionMap.values()).map((m) => (
                  <button
                    key={m.id}
                    className="w-full text-left px-2 py-1.5 rounded hover:bg-accent text-sm"
                    onClick={() => insertMention(m.name)}
                  >
                    @{m.name}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          )}
          <Button size="icon" className="h-7 w-7" onClick={send} disabled={!draft.trim() || sending}>
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">⌘/Ctrl + Enter to send</p>
    </div>
  );
}
