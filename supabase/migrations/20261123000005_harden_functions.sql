-- Only signed-in users may create a studio or claim invitations (portal_view stays public by design).
revoke execute on function public.create_workspace(text, text) from anon;
revoke execute on function public.claim_memberships() from anon;
-- Pin search_path on helper functions.
alter function private.freeze_workspace() set search_path = '';
alter function private.is_member(uuid) set search_path = '';
alter function private.is_manager(uuid) set search_path = '';
