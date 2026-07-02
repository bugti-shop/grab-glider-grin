import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  body: string;
  mentions: string[];
  edited_at: string | null;
  created_at: string;
  // Enriched
  display_name?: string | null;
  avatar_url?: string | null;
  email?: string | null;
}

/**
 * Realtime comments for a single task, with author profile enrichment.
 * Reads and writes are gated by RLS on `task_comments`, so callers only
 * ever see rows they are actually allowed to.
 */
export function useTaskComments(taskId: string | null | undefined) {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!taskId) { setComments([]); setLoading(false); return; }
    const { data, error } = await supabase
      .from('task_comments')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });
    if (error) { setLoading(false); return; }
    const rows = (data ?? []) as TaskComment[];
    const ids = Array.from(new Set(rows.map((r) => r.user_id)));
    let profs = new Map<string, any>();
    if (ids.length) {
      const { data: p } = await supabase
        .from('profiles').select('id, display_name, avatar_url, email').in('id', ids);
      (p ?? []).forEach((row: any) => profs.set(row.id, row));
    }
    setComments(rows.map((r) => ({ ...r, ...(profs.get(r.user_id) ?? {}) })));
    setLoading(false);
  }, [taskId]);

  useEffect(() => {
    refresh();
    if (!taskId) return;
    const channel = supabase
      .channel(`task-comments-${taskId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'task_comments', filter: `task_id=eq.${taskId}` },
        refresh,
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [taskId, refresh]);

  const post = useCallback(async (body: string, mentions: string[] = []) => {
    if (!taskId) throw new Error('No task');
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) throw new Error('Sign in to comment');
    const trimmed = body.trim();
    if (!trimmed) return null;
    const { error } = await supabase.from('task_comments')
      .insert({ task_id: taskId, user_id: uid, body: trimmed.slice(0, 4000), mentions });
    if (error) throw error;
  }, [taskId]);

  const remove = useCallback(async (commentId: string) => {
    const { error } = await supabase.from('task_comments').delete().eq('id', commentId);
    if (error) throw error;
  }, []);

  const edit = useCallback(async (commentId: string, body: string) => {
    const trimmed = body.trim().slice(0, 4000);
    if (!trimmed) return;
    const { error } = await supabase.from('task_comments')
      .update({ body: trimmed, edited_at: new Date().toISOString() })
      .eq('id', commentId);
    if (error) throw error;
  }, []);

  return { comments, loading, refresh, post, remove, edit };
}
