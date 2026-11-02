-- Chakra OS: membership-controlled workspace with optimistic concurrency.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create table public.chakra_members (
 email text primary key check(email=lower(email)),
 role text not null check(role in ('owner','member','client')),
 client_id text, active boolean not null default true,
 check(role <> 'client' or client_id is not null)
);
create table public.chakra_workspace (
 id boolean primary key default true check(id),
 data jsonb, revision bigint not null default 0,
 updated_at timestamptz not null default now()
);
alter table public.chakra_members enable row level security;
alter table public.chakra_workspace enable row level security;
create function private.chakra_role() returns text language sql stable security definer set search_path='' as $$
 select m.role from public.chakra_members m join auth.users u on lower(u.email)=m.email
 where u.id=auth.uid() and u.email_confirmed_at is not null and m.active
$$;
revoke all on function private.chakra_role() from public;
grant execute on function private.chakra_role() to authenticated;
create policy members_read on public.chakra_members for select to authenticated
 using(email=lower(auth.jwt()->>'email') or (select private.chakra_role())='owner');
create policy members_add on public.chakra_members for insert to authenticated
 with check((select private.chakra_role())='owner' and role <> 'owner');
create policy members_edit on public.chakra_members for update to authenticated
 using((select private.chakra_role())='owner' and role <> 'owner')
 with check((select private.chakra_role())='owner' and role <> 'owner');
create policy workspace_read on public.chakra_workspace for select to authenticated
 using((select private.chakra_role()) in ('owner','member'));
create policy workspace_edit on public.chakra_workspace for update to authenticated
 using((select private.chakra_role()) in ('owner','member'))
 with check((select private.chakra_role()) in ('owner','member'));
grant select,insert,update on public.chakra_members to authenticated;
grant select,update on public.chakra_workspace to authenticated;
revoke all on public.chakra_members, public.chakra_workspace from anon;
insert into public.chakra_members(email,role) values('minethbanula@gmail.com','owner');
insert into public.chakra_workspace(id) values(true);
create function public.chakra_save(payload jsonb, expected_revision bigint) returns bigint language plpgsql security invoker set search_path='' as $$
declare r bigint;
begin
 if jsonb_typeof(payload) <> 'object' or payload->>'version' <> '1' or jsonb_typeof(payload->'projects') <> 'array' or jsonb_typeof(payload->'tasks') <> 'array' then raise exception 'Invalid workspace'; end if;
 update public.chakra_workspace set data=payload,revision=revision+1,updated_at=now() where id=true and revision=expected_revision returning revision into r;
 if r is null then raise exception 'Workspace changed or access denied. Reload cloud data before saving.'; end if;
 return r;
end $$;
revoke all on function public.chakra_save(jsonb,bigint) from public;
grant execute on function public.chakra_save(jsonb,bigint) to authenticated;
-- Portal function exposes only explicitly shared client-facing fields, never the workspace blob.
create function private.chakra_portal(requested_client text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d jsonb; c jsonb; role_name text;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 select m.role into role_name from public.chakra_members m join auth.users u on lower(u.email)=m.email
 where u.id=auth.uid() and u.email_confirmed_at is not null and m.active and (m.role in ('owner','member') or m.client_id=requested_client);
 if role_name is null then raise exception 'You do not have access to this client portal'; end if;
 select data into d from public.chakra_workspace where id=true;
 select x into c from jsonb_array_elements(d->'clients') x where x->>'id'=requested_client;
 if c is null then raise exception 'Client portal not found'; end if;
 return jsonb_build_object('client',jsonb_build_object('id',c->>'id','name',c->>'name'),
 'settings',jsonb_build_object('studio',d#>>'{settings,studio}','accent',d#>>'{settings,accent}','appLogo',d#>>'{settings,appLogo}','currency',d#>>'{settings,currency}'),
 'projects',coalesce((select jsonb_agg(jsonb_build_object('id',p->>'id','name',p->>'name','status',p->>'status','due',p->>'due','progress',p->'progress')) from jsonb_array_elements(d->'projects') p where p->>'client'=c->>'name'),'[]'::jsonb),
 'invoices',coalesce((select jsonb_agg(jsonb_build_object('number',i->>'number','issued',i->>'issued','due',i->>'due','status',i->>'status','items',i->'items','tax',i->'tax','currency',coalesce(i->>'currency',d#>>'{settings,currency}'))) from jsonb_array_elements(d->'invoices') i where i->>'client'=c->>'name' and i->>'status' <> 'Draft'),'[]'::jsonb));
end $$;
revoke all on function private.chakra_portal(text) from public;
grant execute on function private.chakra_portal(text) to authenticated;
create function public.chakra_portal(requested_client text) returns jsonb language sql security invoker set search_path='' as $$ select private.chakra_portal(requested_client) $$;
revoke all on function public.chakra_portal(text) from public;
grant execute on function public.chakra_portal(text) to authenticated;
-- Supabase may grant anon explicitly through default privileges.
revoke all on function public.chakra_portal(text), public.chakra_save(jsonb,bigint), private.chakra_portal(text), private.chakra_role() from anon;
