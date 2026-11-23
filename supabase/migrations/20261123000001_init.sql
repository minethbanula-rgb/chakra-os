-- Chakra Studio OS v2 — normalized schema.
-- One table per record type, every row scoped to a workspace, soft deletes, RLS on everything.
-- Apply with `supabase db push` (CI does this on merge to main). Never edit an applied migration.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------- Workspaces & membership ----------

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  owner_name text not null default '',
  email text not null default '',
  address text not null default '',
  website text not null default '',
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  cycle_start_day int not null default 1 check (cycle_start_day between 1 and 31),
  tax_default numeric(6,3) not null default 0 check (tax_default >= 0),
  invoice_prefix text not null default 'INV-',
  monthly_target_minor bigint not null default 0,
  logo text,
  digest_time time not null default '08:30',
  auto_reminders boolean not null default false,
  timezone text not null default 'Asia/Colombo',
  week_starts_on int not null default 1 check (week_starts_on in (0, 1)),
  fx_usd numeric(14,4) not null default 300,
  fx_updated_at timestamptz,
  theme text not null default 'system',
  onboarded boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null default '',
  email text not null default '' check (email = lower(email)),
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  title text not null default '',
  status text not null default 'Invited' check (status in ('Active', 'Invited')),
  digest boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index members_ws_email on public.members(workspace_id, email) where email <> '' and deleted_at is null;
create unique index members_ws_user on public.members(workspace_id, user_id) where user_id is not null and deleted_at is null;

-- Role of the signed-in user in a workspace (null = no access). SECURITY DEFINER avoids RLS recursion.
create function private.role_in(ws uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.members m
  where m.workspace_id = ws and m.user_id = auth.uid() and m.deleted_at is null and m.status = 'Active'
  limit 1
$$;
revoke all on function private.role_in(uuid) from public;
grant execute on function private.role_in(uuid) to authenticated;

create function private.is_member(ws uuid) returns boolean language sql stable as $$ select private.role_in(ws) is not null $$;
create function private.is_manager(ws uuid) returns boolean language sql stable as $$ select private.role_in(ws) in ('owner', 'admin') $$;
grant execute on function private.is_member(uuid), private.is_manager(uuid) to authenticated;

-- ---------- Records ----------

create table public.clients (
  id uuid primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null, status text not null default 'Active' check (status in ('Active', 'Paused', 'Former')),
  industry text not null default '', website text not null default '', location text not null default '', notes text not null default '',
  flagged boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table public.contacts (
  id uuid primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id),
  name text not null default '', email text not null default '', phone text not null default '', is_primary boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table public.projects (
  id uuid primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid references public.clients(id),
  name text not null,
  stage text not null default 'Planning' check (stage in ('Lead', 'Planning', 'In progress', 'Review', 'Delivered', 'Archived')),
  on_hold boolean not null default false,
  start_on date, due_on date,
  budget_minor bigint not null default 0,
  description text not null default '',
  drive_url text not null default '' check (drive_url = '' or drive_url like 'https://%'),
  owner_id uuid references public.members(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table public.milestones (
  id uuid primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id),
  title text not null, due_on date,
  status text not null default 'Planned' check (status in ('Planned', 'In progress', 'Complete')),
  client_visible boolean not null default true, position double precision not null default 0, completed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table public.tasks (
  id uuid primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id),
  title text not null, notes text not null default '',
  status text not null default 'To do' check (status in ('To do', 'Doing', 'Review', 'Done')),
  priority text not null default 'Medium' check (priority in ('Low', 'Medium', 'High')),
  due_on date, assignee_id uuid references public.members(id),
  position double precision not null default 0,
  recurrence text not null default 'none' check (recurrence in ('none', 'daily', 'weekly', 'monthly')),
  completed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table public.checklist_items (
  id uuid primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid not null references public.tasks(id),
  text text not null default '', done boolean not null default false, position double precision not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table public.invoices (
  id uuid primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid references public.clients(id), project_id uuid references public.projects(id),
  number text not null, issued_on date not null, due_on date not null,
  status text not null default 'Draft' check (status in ('Draft', 'Sent', 'Partially paid', 'Paid', 'Void')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  tax_rate numeric(6,3) not null default 0 check (tax_rate >= 0),
  advance_pct numeric(5,2) not null default 0 check (advance_pct between 0 and 100),
  notes text not null default '', sent_at timestamptz,
  last_reminder_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create unique index invoices_ws_number on public.invoices(workspace_id, number) where deleted_at is null;

create table public.invoice_items (
  id uuid primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id),
  description text not null default '', qty numeric(12,3) not null default 1, rate_minor bigint not null default 0,
  position double precision not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table public.payments (
  id uuid primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id),
  amount_minor bigint not null check (amount_minor > 0), paid_on date not null, method text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table public.transactions (
  id uuid primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade,
  type text not null check (type in ('Income', 'Expense')),
  title text not null default '', amount_minor bigint not null check (amount_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'), occurred_on date not null, category text not null default 'Other',
  invoice_id uuid references public.invoices(id), payment_id uuid references public.payments(id), subscription_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
-- One income entry per payment, so a retried save can never double-count revenue.
create unique index transactions_payment on public.transactions(payment_id) where payment_id is not null and deleted_at is null;

create table public.subscriptions (
  id uuid primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null, amount_minor bigint not null default 0, currency text not null default 'USD',
  cycle text not null default 'monthly' check (cycle in ('monthly', 'yearly')),
  renews_on date not null, auto_renew boolean not null default true, remind_days int not null default 3,
  website text not null default '', status text not null default 'Active' check (status in ('Active', 'Paused')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

-- Only a SHA-256 fingerprint of each portal token is stored. The token itself is shown once to staff.
create table public.portal_links (
  id uuid primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade,
  client_id uuid not null references public.clients(id),
  token_hash text not null check (token_hash ~ '^[a-f0-9]{64}$'),
  enabled boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create unique index portal_links_hash on public.portal_links(token_hash);

create table public.templates (
  id uuid primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null, milestones jsonb not null default '[]', tasks jsonb not null default '[]',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

create table public.activity (
  id uuid primary key, workspace_id uuid not null references public.workspaces(id) on delete cascade,
  entity text not null, entity_id uuid not null, text text not null, actor_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);

-- Log of emails sent by scheduled jobs (digests, reminders) so nothing is sent twice.
create table public.email_log (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  kind text not null, ref text not null, sent_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique (kind, ref, sent_on)
);

-- ---------- Indexes ----------
create index on public.tasks(workspace_id, due_on) where deleted_at is null;
create index on public.tasks(project_id);
create index on public.milestones(project_id);
create index on public.checklist_items(task_id);
create index on public.invoice_items(invoice_id);
create index on public.payments(invoice_id);
create index on public.transactions(workspace_id, occurred_on);
create index on public.contacts(client_id);
create index on public.projects(workspace_id, client_id);
create index on public.invoices(workspace_id, status, due_on);

-- ---------- Integrity: children must belong to the parent's workspace ----------
create function private.same_workspace() returns trigger language plpgsql security definer set search_path = '' as $$
declare parent_table text := tg_argv[0]; parent_col text := tg_argv[1]; parent_id uuid; parent_ws uuid;
begin
  execute format('select ($1).%I', parent_col) using new into parent_id;
  if parent_id is null then return new; end if;
  execute format('select workspace_id from public.%I where id = $1', parent_table) using parent_id into parent_ws;
  if parent_ws is distinct from new.workspace_id then
    raise exception '% % belongs to another workspace', parent_table, parent_id;
  end if;
  return new;
end $$;

create trigger contacts_ws before insert or update on public.contacts for each row execute function private.same_workspace('clients', 'client_id');
create trigger projects_ws before insert or update on public.projects for each row execute function private.same_workspace('clients', 'client_id');
create trigger milestones_ws before insert or update on public.milestones for each row execute function private.same_workspace('projects', 'project_id');
create trigger tasks_ws before insert or update on public.tasks for each row execute function private.same_workspace('projects', 'project_id');
create trigger tasks_assignee_ws before insert or update on public.tasks for each row execute function private.same_workspace('members', 'assignee_id');
create trigger checklist_ws before insert or update on public.checklist_items for each row execute function private.same_workspace('tasks', 'task_id');
create trigger invoices_client_ws before insert or update on public.invoices for each row execute function private.same_workspace('clients', 'client_id');
create trigger invoices_project_ws before insert or update on public.invoices for each row execute function private.same_workspace('projects', 'project_id');
create trigger invoice_items_ws before insert or update on public.invoice_items for each row execute function private.same_workspace('invoices', 'invoice_id');
create trigger payments_ws before insert or update on public.payments for each row execute function private.same_workspace('invoices', 'invoice_id');
create trigger transactions_ws before insert or update on public.transactions for each row execute function private.same_workspace('invoices', 'invoice_id');
create trigger portal_links_ws before insert or update on public.portal_links for each row execute function private.same_workspace('clients', 'client_id');

-- workspace_id never changes after insert
create function private.freeze_workspace() returns trigger language plpgsql as $$
begin
  if new.workspace_id is distinct from old.workspace_id then raise exception 'workspace_id cannot change'; end if;
  return new;
end $$;

-- ---------- Row-level security ----------
alter table public.workspaces enable row level security;
create policy ws_read on public.workspaces for select to authenticated using (private.is_member(id));
create policy ws_update on public.workspaces for update to authenticated using (private.is_manager(id)) with check (private.is_manager(id));
grant select, update on public.workspaces to authenticated;

alter table public.members enable row level security;
create policy members_read on public.members for select to authenticated using (private.is_member(workspace_id));
create policy members_insert on public.members for insert to authenticated
  with check (private.is_manager(workspace_id) and (role <> 'owner' or private.role_in(workspace_id) = 'owner'));
create policy members_update on public.members for update to authenticated
  using (private.is_manager(workspace_id) and (role <> 'owner' or private.role_in(workspace_id) = 'owner'))
  with check (private.is_manager(workspace_id) and (role <> 'owner' or private.role_in(workspace_id) = 'owner'));
-- Members may edit their own name/title/digest preference (role changes are blocked by the trigger below).
create policy members_self on public.members for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on public.members to authenticated;

-- Runs as the caller (not SECURITY DEFINER): inside trusted server functions current_user is the
-- function owner, so these checks only apply to requests coming straight from the API.
create function private.guard_member() returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  if tg_op = 'UPDATE' then
    if new.workspace_id is distinct from old.workspace_id then raise exception 'workspace_id cannot change'; end if;
    if (new.role is distinct from old.role or new.user_id is distinct from old.user_id or new.status is distinct from old.status)
       and coalesce(private.role_in(new.workspace_id), '') not in ('owner', 'admin') then
      raise exception 'Only owners and admins can change roles';
    end if;
    if old.role = 'owner' and (new.role <> 'owner' or new.deleted_at is not null)
       and (select count(*) from public.members where workspace_id = new.workspace_id and role = 'owner' and deleted_at is null and id <> new.id) = 0 then
      raise exception 'A workspace needs at least one owner';
    end if;
  end if;
  if tg_op = 'INSERT' then
    new.user_id := null;  -- linked only when that person signs in (claim_memberships)
    if new.status = 'Active' then new.status := 'Invited'; end if;
  end if;
  return new;
end $$;
create trigger members_guard before insert or update on public.members for each row execute function private.guard_member();

-- Shared helper for the record tables.
do $$
declare t text;
begin
  -- Visible to every member
  foreach t in array array['clients', 'contacts', 'projects', 'milestones', 'tasks', 'checklist_items', 'templates', 'activity'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (private.is_member(workspace_id))', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (private.is_member(workspace_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (private.is_member(workspace_id)) with check (private.is_member(workspace_id))', t || '_update', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('create trigger %I before update on public.%I for each row execute function private.freeze_workspace()', t || '_freeze', t);
  end loop;
  -- Money: owners and admins only
  foreach t in array array['invoices', 'invoice_items', 'payments', 'transactions', 'subscriptions', 'portal_links'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (private.is_manager(workspace_id))', t || '_read', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (private.is_manager(workspace_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (private.is_manager(workspace_id)) with check (private.is_manager(workspace_id))', t || '_update', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('create trigger %I before update on public.%I for each row execute function private.freeze_workspace()', t || '_freeze', t);
  end loop;
end $$;
-- No DELETE grants anywhere: the app soft-deletes. email_log is server-only.
alter table public.email_log enable row level security;
revoke all on public.email_log from anon, authenticated;
revoke all on all tables in schema public from anon;
-- Supabase grants DELETE/TRUNCATE on new tables by default; the app only soft-deletes.
revoke delete, truncate, references, trigger on all tables in schema public from authenticated;

-- ---------- RPCs ----------

-- First sign-in: create a studio and become its owner.
create function public.create_workspace(studio_name text, owner_name text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare ws uuid; mail text;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  select lower(email) into mail from auth.users where id = auth.uid();
  insert into public.workspaces(name, owner_name, email) values (studio_name, owner_name, coalesce(mail, '')) returning id into ws;
  insert into public.members(workspace_id, user_id, name, email, role, status)
    values (ws, auth.uid(), coalesce(nullif(owner_name, ''), split_part(mail, '@', 1)), coalesce(mail, ''), 'owner', 'Active');
  return ws;
end $$;
revoke all on function public.create_workspace(text, text) from public;
grant execute on function public.create_workspace(text, text) to authenticated;

-- Link invitations to the signed-in account by confirmed email. Returns workspaces now accessible.
create function public.claim_memberships() returns setof uuid
language plpgsql security definer set search_path = '' as $$
declare mail text; confirmed timestamptz;
begin
  if auth.uid() is null then return; end if;
  select lower(email), email_confirmed_at into mail, confirmed from auth.users where id = auth.uid();
  if mail is null or confirmed is null then return; end if;
  update public.members set user_id = auth.uid(), status = 'Active', updated_at = now()
    where email = mail and user_id is null and deleted_at is null;
  return query select workspace_id from public.members where user_id = auth.uid() and deleted_at is null and status = 'Active';
end $$;
revoke all on function public.claim_memberships() from public;
grant execute on function public.claim_memberships() to authenticated;

-- Public, login-free client portal. Returns only client-safe fields; never invoices, notes, tasks or contacts.
create function public.portal_view(token text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare link public.portal_links; result jsonb;
begin
  if token is null or token !~ '^[a-f0-9]{64}$' then return null; end if;
  select * into link from public.portal_links
   where token_hash = encode(extensions.digest(convert_to(token, 'UTF8'), 'sha256'), 'hex') and enabled and deleted_at is null;
  if link.id is null then return null; end if;
  select jsonb_build_object(
    'studio', jsonb_build_object('name', w.name, 'logo', w.logo, 'email', w.email, 'website', w.website),
    'client', jsonb_build_object('name', c.name),
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', p.name, 'stage', p.stage, 'onHold', p.on_hold, 'startOn', p.start_on, 'dueOn', p.due_on, 'driveUrl', nullif(p.drive_url, ''),
        'milestones', coalesce((select jsonb_agg(jsonb_build_object('title', m.title, 'dueOn', m.due_on, 'status', m.status) order by m.due_on nulls last, m.position)
                                 from public.milestones m where m.project_id = p.id and m.client_visible and m.deleted_at is null), '[]'::jsonb),
        'tasksDone', (select count(*) from public.tasks t where t.project_id = p.id and t.status = 'Done' and t.deleted_at is null),
        'tasksTotal', (select count(*) from public.tasks t where t.project_id = p.id and t.deleted_at is null)
      ) order by p.due_on nulls last)
      from public.projects p
      where p.client_id = c.id and p.deleted_at is null and p.stage in ('Planning', 'In progress', 'Review', 'Delivered')
    ), '[]'::jsonb)
  ) into result
  from public.clients c join public.workspaces w on w.id = c.workspace_id
  where c.id = link.client_id and c.deleted_at is null;
  return result;
end $$;
revoke all on function public.portal_view(text) from public;
grant execute on function public.portal_view(text) to anon, authenticated;

-- ---------- Realtime ----------
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['workspaces', 'members', 'clients', 'contacts', 'projects', 'milestones', 'tasks', 'checklist_items', 'invoices', 'invoice_items', 'payments', 'transactions', 'subscriptions', 'portal_links', 'templates', 'activity'] loop
      execute format('alter publication supabase_realtime add table public.%I', t);
    end loop;
  end if;
end $$;
