
REVOKE EXECUTE ON FUNCTION public.can_view_task(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_edit_task(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_task(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_edit_task(UUID, UUID) TO authenticated, service_role;
