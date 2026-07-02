
-- =========================================================
-- task_comments
-- =========================================================
CREATE TABLE public.task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  mentions UUID[] NOT NULL DEFAULT '{}',
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX task_comments_task_idx ON public.task_comments(task_id, created_at);
CREATE INDEX task_comments_user_idx ON public.task_comments(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_comments TO authenticated;
GRANT ALL ON public.task_comments TO service_role;

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

-- Helper: can current user see this task? (owns it OR is a member of its project)
CREATE OR REPLACE FUNCTION public.can_view_task(_task_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = _task_id
      AND (
        t.user_id = _user_id
        OR (t.project_id IS NOT NULL AND public.is_project_member(t.project_id, _user_id))
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_task(_task_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = _task_id
      AND (
        t.user_id = _user_id
        OR (t.project_id IS NOT NULL AND public.can_edit_project(t.project_id, _user_id))
      )
  );
$$;

CREATE POLICY "View comments on visible tasks"
  ON public.task_comments FOR SELECT TO authenticated
  USING (public.can_view_task(task_id, auth.uid()));

CREATE POLICY "Insert own comments on visible tasks"
  ON public.task_comments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_view_task(task_id, auth.uid()));

CREATE POLICY "Edit own comments"
  ON public.task_comments FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Delete own comments or project editors"
  ON public.task_comments FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.can_edit_task(task_id, auth.uid()));

CREATE TRIGGER task_comments_set_updated_at
  BEFORE UPDATE ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.task_comments;
ALTER TABLE public.task_comments REPLICA IDENTITY FULL;

-- =========================================================
-- project_guest_links
-- =========================================================
CREATE TABLE public.project_guest_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX project_guest_links_project_idx ON public.project_guest_links(project_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_guest_links TO authenticated;
GRANT ALL ON public.project_guest_links TO service_role;

ALTER TABLE public.project_guest_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners view guest links"
  ON public.project_guest_links FOR SELECT TO authenticated
  USING (public.project_role_of(project_id, auth.uid()) = 'owner');

CREATE POLICY "Owners create guest links"
  ON public.project_guest_links FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.project_role_of(project_id, auth.uid()) = 'owner');

CREATE POLICY "Owners revoke guest links"
  ON public.project_guest_links FOR UPDATE TO authenticated
  USING (public.project_role_of(project_id, auth.uid()) = 'owner')
  WITH CHECK (public.project_role_of(project_id, auth.uid()) = 'owner');

CREATE POLICY "Owners delete guest links"
  ON public.project_guest_links FOR DELETE TO authenticated
  USING (public.project_role_of(project_id, auth.uid()) = 'owner');

ALTER PUBLICATION supabase_realtime ADD TABLE public.project_guest_links;
