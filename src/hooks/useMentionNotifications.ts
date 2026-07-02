import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { addNotification } from '@/utils/notificationStore';

/**
 * Global subscriber: whenever a new task_comment mentions the current user,
 * push an in-app notification. RLS on task_comments guarantees we only ever
 * receive rows the user is allowed to see (tasks they own or project tasks).
 */
export function useMentionNotifications() {
  useEffect(() => {
    let cancelled = false;
    let currentUserId: string | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;
      currentUserId = data.user?.id ?? null;
      if (!currentUserId) return;

      channel = supabase
        .channel('mentions-global')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'task_comments' },
          async (payload) => {
            const row: any = payload.new;
            const mentions: string[] = Array.isArray(row?.mentions) ? row.mentions : [];
            if (!currentUserId || row.user_id === currentUserId) return;
            if (!mentions.includes(currentUserId)) return;

            let authorName = 'Someone';
            try {
              const { data: prof } = await supabase
                .from('profiles').select('display_name, email').eq('id', row.user_id).maybeSingle();
              authorName = prof?.display_name || prof?.email || authorName;
            } catch { /* ignore */ }

            await addNotification({
              type: 'task',
              title: `💬 ${authorName} mentioned you`,
              message: String(row.body ?? '').slice(0, 140),
              icon: 'at-sign',
              actionPath: `/todo/today?taskId=${row.task_id}`,
            });
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);
}
