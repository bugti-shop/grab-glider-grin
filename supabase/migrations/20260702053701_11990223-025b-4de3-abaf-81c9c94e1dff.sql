
REVOKE EXECUTE ON FUNCTION public.is_project_member(uuid, uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.project_role_of(uuid, uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.can_edit_project(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_project_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.project_role_of(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_edit_project(uuid, uuid) TO authenticated, service_role;
