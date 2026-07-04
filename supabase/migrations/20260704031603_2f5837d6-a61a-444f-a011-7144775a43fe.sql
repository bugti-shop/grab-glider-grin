-- Fix members_insert_owner_or_self_seed: the previous NOT EXISTS check compared
-- project_members_1.project_id to itself (always true), so the "no existing
-- owner row for this project" gate never actually applied. Any authenticated
-- user could seed themselves as owner on any project (privilege escalation)
-- because the guard was vacuous.
DROP POLICY IF EXISTS members_insert_owner_or_self_seed ON public.project_members;

CREATE POLICY members_insert_owner_or_self_seed
ON public.project_members
FOR INSERT
TO authenticated
WITH CHECK (
  -- Existing project owners may add anyone.
  public.project_role_of(project_id, auth.uid()) = 'owner'::public.project_role
  OR (
    -- First-owner self-seed: only allowed when the project has NO members yet.
    -- The correlated subquery now compares to the target row's project_id.
    user_id = auth.uid()
    AND role = 'owner'::public.project_role
    AND NOT EXISTS (
      SELECT 1
      FROM public.project_members pm_seed
      WHERE pm_seed.project_id = public.project_members.project_id
    )
  )
);