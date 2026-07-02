import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type ProjectRole = 'owner' | 'editor' | 'viewer';

export interface Project {
  id: string;
  owner_id: string;
  name: string;
  color: string | null;
  emoji: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectMember {
  project_id: string;
  user_id: string;
  role: ProjectRole;
  joined_at: string;
  display_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
}

export interface ProjectInvitation {
  id: string;
  project_id: string;
  email: string;
  role: ProjectRole;
  invited_by: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

/** Lists all projects the current user is a member of, with realtime updates. */
export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('updated_at', { ascending: false });
    if (!error && data) setProjects(data as Project[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel('projects-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_members' }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refresh]);

  const createProject = useCallback(async (name: string, opts?: { color?: string; emoji?: string }) => {
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) throw new Error('Not signed in');
    const { data: proj, error } = await supabase
      .from('projects')
      .insert({ owner_id: uid, name, color: opts?.color ?? null, emoji: opts?.emoji ?? null })
      .select().single();
    if (error) throw error;
    // Seed self as owner (allowed by RLS for empty projects)
    await supabase.from('project_members')
      .insert({ project_id: proj.id, user_id: uid, role: 'owner' });
    await refresh();
    return proj as Project;
  }, [refresh]);

  const renameProject = useCallback(async (id: string, name: string) => {
    const { error } = await supabase.from('projects').update({ name }).eq('id', id);
    if (error) throw error;
  }, []);

  const deleteProject = useCallback(async (id: string) => {
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) throw error;
  }, []);

  return { projects, loading, refresh, createProject, renameProject, deleteProject };
}

/** Members + pending invitations for a single project, with realtime updates. */
export function useProjectMembers(projectId: string | null | undefined) {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [invitations, setInvitations] = useState<ProjectInvitation[]>([]);
  const [myRole, setMyRole] = useState<ProjectRole | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!projectId) { setMembers([]); setInvitations([]); setMyRole(null); setLoading(false); return; }
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id ?? null;

    const [{ data: memberRows }, { data: inviteRows }] = await Promise.all([
      supabase.from('project_members').select('*').eq('project_id', projectId),
      supabase.from('project_invitations').select('*').eq('project_id', projectId).is('accepted_at', null),
    ]);

    const rows = (memberRows ?? []) as ProjectMember[];
    // Enrich with profile info
    const ids = Array.from(new Set(rows.map((m) => m.user_id)));
    let profileMap = new Map<string, { display_name?: string; email?: string; avatar_url?: string }>();
    if (ids.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('id, display_name, email, avatar_url').in('id', ids);
      (profs ?? []).forEach((p: any) => profileMap.set(p.id, p));
    }
    const enriched = rows.map((m) => ({ ...m, ...(profileMap.get(m.user_id) ?? {}) }));
    setMembers(enriched);
    setInvitations((inviteRows ?? []) as ProjectInvitation[]);
    setMyRole(uid ? (rows.find((r) => r.user_id === uid)?.role ?? null) : null);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    refresh();
    if (!projectId) return;
    const channel = supabase
      .channel(`project-${projectId}-changes`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_members', filter: `project_id=eq.${projectId}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_invitations', filter: `project_id=eq.${projectId}` }, refresh)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId, refresh]);

  const invite = useCallback(async (email: string, role: 'editor' | 'viewer' = 'editor') => {
    if (!projectId) throw new Error('No project selected');
    const { data, error } = await supabase.functions.invoke('send-project-invite', {
      body: { projectId, email, role },
    });
    if (error) throw error;
    await refresh();
    return data;
  }, [projectId, refresh]);

  const removeMember = useCallback(async (userId: string) => {
    if (!projectId) return;
    // Server-enforced: only owners can remove, cannot remove other owners,
    // and the task-assignment cleanup happens transactionally.
    const { data, error } = await supabase.functions.invoke('manage-project-member', {
      body: { action: 'remove', projectId, userId },
    });
    if (error) throw new Error((data as any)?.error ?? error.message);
    if ((data as any)?.error) throw new Error((data as any).error);
    await refresh();
  }, [projectId, refresh]);

  const changeRole = useCallback(async (userId: string, role: ProjectRole) => {
    if (!projectId) return;
    const { data, error } = await supabase.functions.invoke('manage-project-member', {
      body: { action: 'change_role', projectId, userId, role },
    });
    if (error) throw new Error((data as any)?.error ?? error.message);
    if ((data as any)?.error) throw new Error((data as any).error);
    await refresh();
  }, [projectId, refresh]);

  const cancelInvite = useCallback(async (inviteId: string) => {
    const { error } = await supabase.from('project_invitations').delete().eq('id', inviteId);
    if (error) throw error;
    await refresh();
  }, [refresh]);

  return { members, invitations, myRole, loading, refresh, invite, removeMember, changeRole, cancelInvite };
}
