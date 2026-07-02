
-- === Enum ===
DO $$ BEGIN
  CREATE TYPE public.project_role AS ENUM ('owner', 'editor', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- === projects ===
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  emoji text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- === project_members ===
CREATE TABLE public.project_members (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.project_role NOT NULL DEFAULT 'editor',
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX idx_project_members_user ON public.project_members(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_members TO authenticated;
GRANT ALL ON public.project_members TO service_role;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;

-- === project_invitations ===
CREATE TABLE public.project_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.project_role NOT NULL DEFAULT 'editor',
  token text NOT NULL UNIQUE,
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_project_invitations_email ON public.project_invitations(lower(email));
CREATE INDEX idx_project_invitations_project ON public.project_invitations(project_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_invitations TO authenticated;
GRANT ALL ON public.project_invitations TO service_role;
ALTER TABLE public.project_invitations ENABLE ROW LEVEL SECURITY;

-- === helper functions (SECURITY DEFINER to avoid RLS recursion) ===
CREATE OR REPLACE FUNCTION public.is_project_member(_project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = _project_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.project_role_of(_project_id uuid, _user_id uuid)
RETURNS public.project_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.project_members
  WHERE project_id = _project_id AND user_id = _user_id;
$$;

CREATE OR REPLACE FUNCTION public.can_edit_project(_project_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = _project_id AND user_id = _user_id
      AND role IN ('owner', 'editor')
  );
$$;

-- === RLS: projects ===
CREATE POLICY "projects_select_members" ON public.projects
  FOR SELECT TO authenticated
  USING (public.is_project_member(id, auth.uid()));

CREATE POLICY "projects_insert_self" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "projects_update_owner" ON public.projects
  FOR UPDATE TO authenticated
  USING (public.project_role_of(id, auth.uid()) = 'owner')
  WITH CHECK (public.project_role_of(id, auth.uid()) = 'owner');

CREATE POLICY "projects_delete_owner" ON public.projects
  FOR DELETE TO authenticated
  USING (public.project_role_of(id, auth.uid()) = 'owner');

-- === RLS: project_members ===
CREATE POLICY "members_select_same_project" ON public.project_members
  FOR SELECT TO authenticated
  USING (public.is_project_member(project_id, auth.uid()));

CREATE POLICY "members_insert_owner_or_self_seed" ON public.project_members
  FOR INSERT TO authenticated
  WITH CHECK (
    -- Owner adding new members
    public.project_role_of(project_id, auth.uid()) = 'owner'
    -- Or creator seeding themselves as owner on new project
    OR (user_id = auth.uid() AND role = 'owner' AND NOT EXISTS (
      SELECT 1 FROM public.project_members WHERE project_id = project_members.project_id
    ))
  );

CREATE POLICY "members_update_owner" ON public.project_members
  FOR UPDATE TO authenticated
  USING (public.project_role_of(project_id, auth.uid()) = 'owner')
  WITH CHECK (public.project_role_of(project_id, auth.uid()) = 'owner');

CREATE POLICY "members_delete_owner_or_self" ON public.project_members
  FOR DELETE TO authenticated
  USING (
    public.project_role_of(project_id, auth.uid()) = 'owner'
    OR user_id = auth.uid()
  );

-- === RLS: project_invitations ===
CREATE POLICY "invitations_select_owner_or_invitee" ON public.project_invitations
  FOR SELECT TO authenticated
  USING (
    public.project_role_of(project_id, auth.uid()) = 'owner'
    OR invited_by = auth.uid()
    OR lower(email) = lower(coalesce((auth.jwt() ->> 'email'), ''))
  );

CREATE POLICY "invitations_insert_owner" ON public.project_invitations
  FOR INSERT TO authenticated
  WITH CHECK (
    invited_by = auth.uid()
    AND public.project_role_of(project_id, auth.uid()) = 'owner'
  );

CREATE POLICY "invitations_delete_owner" ON public.project_invitations
  FOR DELETE TO authenticated
  USING (
    public.project_role_of(project_id, auth.uid()) = 'owner'
    OR invited_by = auth.uid()
  );

-- === tasks: add project_id + assignee_id ===
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assignee_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_project ON public.tasks(project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON public.tasks(assignee_id) WHERE assignee_id IS NOT NULL;

-- Expand tasks policies: existing "tasks_owner_all" covers user_id=auth.uid().
-- Add project-member visibility & editing.
CREATE POLICY "tasks_select_project_or_assignee" ON public.tasks
  FOR SELECT TO authenticated
  USING (
    (project_id IS NOT NULL AND public.is_project_member(project_id, auth.uid()))
    OR assignee_id = auth.uid()
  );

CREATE POLICY "tasks_update_project_editors" ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    (project_id IS NOT NULL AND public.can_edit_project(project_id, auth.uid()))
    OR assignee_id = auth.uid()
  )
  WITH CHECK (
    (project_id IS NOT NULL AND public.can_edit_project(project_id, auth.uid()))
    OR assignee_id = auth.uid()
    OR user_id = auth.uid()
  );

CREATE POLICY "tasks_insert_project_editors" ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (project_id IS NULL OR public.can_edit_project(project_id, auth.uid()))
  );

-- === updated_at trigger ===
CREATE TRIGGER trg_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- === Realtime ===
ALTER PUBLICATION supabase_realtime ADD TABLE public.projects;
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.project_invitations;
ALTER TABLE public.projects REPLICA IDENTITY FULL;
ALTER TABLE public.project_members REPLICA IDENTITY FULL;
ALTER TABLE public.project_invitations REPLICA IDENTITY FULL;
