-- Fix: the app saves records with upsert (INSERT ... ON CONFLICT DO UPDATE). Postgres runs BEFORE INSERT
-- triggers even when the row already exists, so the invite rules (status → Invited, unlink user) were
-- being applied to edits of existing members, e.g. saving a profile photo demoted an owner to Invited.
-- Now the insert rules apply only to genuinely new rows; edits go through the UPDATE checks.
create or replace function private.guard_member() returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'UPDATE' then
    if new.workspace_id is distinct from old.workspace_id then raise exception 'workspace_id cannot change'; end if;
    if (new.role is distinct from old.role or new.user_id is distinct from old.user_id or new.status is distinct from old.status)
       and coalesce(private.role_in(new.workspace_id), '') not in ('owner', 'admin') then
      raise exception 'Only owners and admins can change roles';
    end if;
    if new.user_id is distinct from old.user_id then
      raise exception 'Accounts are linked only by signing in';
    end if;
    if old.role = 'owner' and (new.role <> 'owner' or new.status <> 'Active' or new.deleted_at is not null)
       and (select count(*) from public.members where workspace_id = new.workspace_id and role = 'owner' and status = 'Active' and deleted_at is null and id <> new.id) = 0 then
      raise exception 'A workspace needs at least one active owner';
    end if;
  end if;
  if tg_op = 'INSERT' and not exists (select 1 from public.members where id = new.id) then
    new.user_id := null;  -- linked only when that person signs in (claim_memberships)
    if new.status = 'Active' then new.status := 'Invited'; end if;
  end if;
  return new;
end $$;
