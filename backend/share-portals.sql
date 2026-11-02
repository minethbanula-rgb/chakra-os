-- Additive, idempotent migration. Existing authenticated workspace policies remain intact.
create table if not exists private.chakra_portal_shares (
 client_id text primary key,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 enabled boolean not null default true,
 updated_at timestamptz not null default now()
);
alter table private.chakra_portal_shares enable row level security;
revoke all on table private.chakra_portal_shares from public, anon, authenticated;
drop policy if exists deny_direct_share_access on private.chakra_portal_shares;
create policy deny_direct_share_access on private.chakra_portal_shares for all to anon, authenticated using(false) with check(false);

create or replace function private.chakra_manage_share(requested_client text, operation text, share_token text)
returns boolean language plpgsql security definer set search_path='' as $$
declare d jsonb; token_digest text;
begin
 if auth.uid() is null or coalesce(private.chakra_role(),'') not in ('owner','member') then raise exception 'Staff access required'; end if;
 select data into d from public.chakra_workspace where id=true;
 if not exists(select 1 from jsonb_array_elements(coalesce(d->'clients','[]'::jsonb)) c where c->>'id'=requested_client) then raise exception 'Save this client to the cloud workspace first'; end if;
 token_digest=encode(sha256(convert_to(coalesce(share_token,''),'UTF8')),'hex');
 if operation='status' then
  return exists(select 1 from private.chakra_portal_shares where client_id=requested_client and enabled and token_hash=token_digest);
 elsif operation='revoke' then
  update private.chakra_portal_shares set enabled=false,updated_at=now() where client_id=requested_client;
  return false;
 elsif operation='enable' then
  if (select count(*) from jsonb_array_elements(coalesce(d->'clients','[]'::jsonb)) c where c->>'name'=(select c2->>'name' from jsonb_array_elements(d->'clients') c2 where c2->>'id'=requested_client limit 1))<>1 then raise exception 'Client company names must be unique before sharing'; end if;
  if share_token is null or share_token !~ '^[a-f0-9]{64}$' then raise exception 'A secure share token is required'; end if;
  insert into private.chakra_portal_shares(client_id,token_hash,enabled) values(requested_client,token_digest,true)
   on conflict(client_id) do update set token_hash=excluded.token_hash,enabled=true,updated_at=now();
  return true;
 end if;
 raise exception 'Invalid sharing operation';
end $$;
revoke all on function private.chakra_manage_share(text,text,text) from public, anon;
grant execute on function private.chakra_manage_share(text,text,text) to authenticated;
create or replace function public.chakra_manage_share(requested_client text, operation text, share_token text)
returns boolean language sql security invoker set search_path='' as $$select private.chakra_manage_share(requested_client,operation,share_token)$$;
revoke all on function public.chakra_manage_share(text,text,text) from public, anon;
grant execute on function public.chakra_manage_share(text,text,text) to authenticated;

-- The anonymous capability is this random token, never a client id or the publishable API key.
-- All privileged table reads stay in the private schema and return only this explicit allowlist.
create or replace function private.chakra_shared_portal(share_token text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare requested_client text; d jsonb; c jsonb;
begin
 if share_token is null or share_token !~ '^[a-f0-9]{64}$' then raise exception 'Share link unavailable'; end if;
 select client_id into requested_client from private.chakra_portal_shares
  where enabled and token_hash=encode(sha256(convert_to(share_token,'UTF8')),'hex');
 if requested_client is null then raise exception 'Share link unavailable'; end if;
 select data into d from public.chakra_workspace where id=true;
 select value into c from jsonb_array_elements(coalesce(d->'clients','[]'::jsonb)) where value->>'id'=requested_client;
 if c is null then raise exception 'Share link unavailable'; end if;
 if (select count(*) from jsonb_array_elements(coalesce(d->'clients','[]'::jsonb)) other_client where other_client->>'name'=c->>'name')<>1 then raise exception 'Share link unavailable'; end if;
 return jsonb_build_object(
  'client',jsonb_build_object('name',c->>'name'),
  'settings',jsonb_build_object('studio',d#>>'{settings,studio}','accent',d#>>'{settings,accent}','appLogo',d#>>'{settings,appLogo}'),
  'projects',coalesce((select jsonb_agg(jsonb_build_object(
   'name',p->>'name','status',p->>'status','due',p->>'due',
   'driveUrl',case when p->>'driveUrl' ~ '^https://(drive|docs)\.google\.com/' then p->>'driveUrl' else null end,
   'milestones',coalesce((select jsonb_agg(jsonb_build_object('title',m->>'title','date',m->>'date','state',m->>'state')) from jsonb_array_elements(case when jsonb_typeof(p->'milestones')='array' then p->'milestones' else '[]'::jsonb end) m),'[]'::jsonb)
  )) from jsonb_array_elements(coalesce(d->'projects','[]'::jsonb)) p where p->>'client'=c->>'name'),'[]'::jsonb)
 );
end $$;
revoke all on function private.chakra_shared_portal(text) from public, anon, authenticated;
grant usage on schema private to anon;
grant execute on function private.chakra_shared_portal(text) to anon, authenticated;
create or replace function public.chakra_shared_portal(share_token text)
returns jsonb language sql security invoker set search_path='' as $$select private.chakra_shared_portal(share_token)$$;
revoke all on function public.chakra_shared_portal(text) from public, anon, authenticated;
grant execute on function public.chakra_shared_portal(text) to anon, authenticated;
