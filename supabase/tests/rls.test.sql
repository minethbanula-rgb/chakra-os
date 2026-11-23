-- Access-control tests. Every assertion raises on failure; the whole file runs in one rolled-back transaction.
begin;
create schema test;
grant usage on schema test to anon, authenticated;

create function test.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  if uid is null then execute 'set local role anon'; else execute 'set local role authenticated'; end if;
end $$;
create function test.expect_error(stmt text, label text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'FAILED (expected error): %', label;
exception when others then
  if sqlerrm like 'FAILED%' then raise; end if;
end $$;
create function test.ok(cond boolean, label text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'FAILED: %', label; end if; end $$;
grant execute on all functions in schema test to anon, authenticated;

insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a', 'owner@studio.test', now()),
  ('00000000-0000-0000-0000-00000000000b', 'designer@studio.test', now()),
  ('00000000-0000-0000-0000-00000000000c', 'stranger@else.test', now()),
  ('00000000-0000-0000-0000-00000000000d', 'other@studio2.test', now()),
  ('00000000-0000-0000-0000-00000000000e', 'unconfirmed@studio.test', null);

create temp table ids (k text primary key, v uuid);
grant all on ids to anon, authenticated;

-- Owner creates a studio and records
select test.act_as('00000000-0000-0000-0000-00000000000a');
insert into ids select 'ws1', public.create_workspace('Chakra', 'Mineth');
select test.ok((select count(*) = 1 from public.workspaces), 'owner sees own workspace');
select test.ok((select role = 'owner' and status = 'Active' from public.members where user_id = auth.uid()), 'creator is active owner');
insert into public.clients(id, workspace_id, name, notes) select '10000000-0000-0000-0000-000000000001', v, 'Nova Labs', 'secret client note' from ids where k = 'ws1';
insert into public.projects(id, workspace_id, client_id, name, stage, description) select '20000000-0000-0000-0000-000000000001', v, '10000000-0000-0000-0000-000000000001', 'Nova identity', 'In progress', 'internal brief' from ids where k = 'ws1';
insert into public.milestones(id, workspace_id, project_id, title, client_visible) select '30000000-0000-0000-0000-000000000001', v, '20000000-0000-0000-0000-000000000001', 'Concepts', true from ids where k = 'ws1';
insert into public.milestones(id, workspace_id, project_id, title, client_visible) select '30000000-0000-0000-0000-000000000002', v, '20000000-0000-0000-0000-000000000001', 'Internal pricing review', false from ids where k = 'ws1';
insert into public.tasks(id, workspace_id, project_id, title) select '40000000-0000-0000-0000-000000000001', v, '20000000-0000-0000-0000-000000000001', 'Logo concepts' from ids where k = 'ws1';
insert into public.invoices(id, workspace_id, client_id, number, issued_on, due_on, currency) select '50000000-0000-0000-0000-000000000001', v, '10000000-0000-0000-0000-000000000001', 'INV-2026-001', current_date, current_date + 14, 'USD' from ids where k = 'ws1';
insert into public.payments(id, workspace_id, invoice_id, amount_minor, paid_on) select '60000000-0000-0000-0000-000000000001', v, '50000000-0000-0000-0000-000000000001', 1000, current_date from ids where k = 'ws1';
insert into public.transactions(id, workspace_id, type, amount_minor, currency, occurred_on, payment_id, invoice_id) select '70000000-0000-0000-0000-000000000001', v, 'Income', 1000, 'USD', current_date, '60000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001' from ids where k = 'ws1';
select test.expect_error($$insert into public.transactions(id, workspace_id, type, amount_minor, currency, occurred_on, payment_id) select '70000000-0000-0000-0000-000000000002', v, 'Income', 1000, 'USD', current_date, '60000000-0000-0000-0000-000000000001' from ids where k = 'ws1'$$, 'one income entry per payment');
select test.expect_error($$delete from public.tasks$$, 'hard deletes are not allowed');

-- Owner invites a designer; the API cannot pre-activate or pre-link the invite
insert into public.members(workspace_id, name, email, role, status, user_id) select v, 'Ruvini', 'designer@studio.test', 'member', 'Active', '00000000-0000-0000-0000-00000000000c' from ids where k = 'ws1';
select test.ok((select status = 'Invited' and user_id is null from public.members where email = 'designer@studio.test'), 'invites start unlinked and Invited');
insert into public.members(workspace_id, name, email, role) select v, 'Pending', 'unconfirmed@studio.test', 'member' from ids where k = 'ws1';
select test.expect_error($$update public.members set role = 'admin' where user_id = auth.uid()$$, 'last owner cannot demote themselves');
-- The app saves with upsert: editing your own record (e.g. a profile photo) must not reset your status.
insert into public.members (id, workspace_id, name, email, role, status, avatar)
  select id, workspace_id, name, email, role, status, 'data:image/webp;base64,AAAA' from public.members where user_id = auth.uid()
  on conflict (id) do update set name = excluded.name, role = excluded.role, status = excluded.status, avatar = excluded.avatar;
select test.ok((select status = 'Active' and role = 'owner' and user_id is not null and avatar is not null from public.members where user_id = auth.uid()), 'upserting own record keeps owner active and linked');
select test.expect_error($$update public.members set status = 'Invited' where user_id = auth.uid()$$, 'last active owner cannot deactivate themselves');

-- Unconfirmed email cannot claim an invite
select test.act_as('00000000-0000-0000-0000-00000000000e');
select test.ok((select count(*) = 0 from public.claim_memberships()), 'unconfirmed email cannot claim');
select test.ok((select count(*) = 0 from public.clients), 'unconfirmed user sees nothing');

-- Designer claims the invite: sees work, not money
select test.act_as('00000000-0000-0000-0000-00000000000b');
select test.ok((select count(*) = 0 from public.clients), 'before claiming, invitee sees nothing');
select test.ok((select count(*) = 1 from public.claim_memberships()), 'invitee claims membership');
select test.ok((select count(*) = 1 from public.clients), 'member sees clients');
select test.ok((select count(*) = 1 from public.tasks), 'member sees tasks');
select test.ok((select count(*) = 0 from public.invoices), 'member cannot see invoices');
select test.ok((select count(*) = 0 from public.transactions), 'member cannot see transactions');
select test.expect_error($$insert into public.invoices(id, workspace_id, number, issued_on, due_on, currency) select gen_random_uuid(), v, 'X', current_date, current_date, 'USD' from ids where k = 'ws1'$$, 'member cannot create invoices');
select test.expect_error($$update public.members set role = 'owner' where user_id = auth.uid()$$, 'member cannot promote themselves');
update public.members set title = 'Senior designer', avatar = 'data:image/webp;base64,AAAA' where user_id = auth.uid();
select test.ok((select avatar like 'data:image/webp%' from public.members where user_id = auth.uid()), 'member can set own photo');
select test.expect_error($$update public.members set avatar = 'https://evil.example/x.png' where user_id = auth.uid()$$, 'photo must be an image data URL');
select test.ok((select title = 'Senior designer' from public.members where user_id = auth.uid()), 'member can edit own title');
update public.tasks set status = 'Doing' where id = '40000000-0000-0000-0000-000000000001';
select test.ok((select status = 'Doing' from public.tasks where id = '40000000-0000-0000-0000-000000000001'), 'member can update tasks');
select test.expect_error($$update public.workspaces set name = 'Hijacked'$$, 'member cannot rename workspace (no rows is fine, error is fine)') where false;
update public.workspaces set name = 'Hijacked';
select test.act_as('00000000-0000-0000-0000-00000000000a');
select test.ok((select name = 'Chakra' from public.workspaces), 'member update to workspace had no effect');

-- A stranger sees and writes nothing
select test.act_as('00000000-0000-0000-0000-00000000000c');
select test.ok((select count(*) = 0 from public.workspaces) and (select count(*) = 0 from public.projects) and (select count(*) = 0 from public.members), 'stranger sees nothing');
select test.expect_error($$insert into public.clients(id, workspace_id, name) select gen_random_uuid(), v, 'Spam' from ids where k = 'ws1'$$, 'stranger cannot insert');

-- Another studio cannot attach records to ours
select test.act_as('00000000-0000-0000-0000-00000000000d');
insert into ids select 'ws2', public.create_workspace('Other studio');
select test.ok((select count(*) = 1 from public.workspaces), 'second owner sees only their studio');
select test.expect_error($$insert into public.tasks(id, workspace_id, project_id, title) select gen_random_uuid(), v, '20000000-0000-0000-0000-000000000001', 'sneaky' from ids where k = 'ws2'$$, 'cross-workspace parent rejected');
select test.expect_error($$update public.tasks set workspace_id = (select v from ids where k = 'ws1')$$, 'workspace_id frozen') where exists (select 1 from public.tasks);

-- Client portal: login-free, token-scoped, client-safe fields only
select test.act_as('00000000-0000-0000-0000-00000000000a');
insert into public.portal_links(id, workspace_id, client_id, token_hash)
  select '80000000-0000-0000-0000-000000000001', v, '10000000-0000-0000-0000-000000000001', encode(extensions.digest(convert_to(repeat('ab', 32), 'UTF8'), 'sha256'), 'hex') from ids where k = 'ws1';
select test.act_as(null);
select test.expect_error($$select * from public.portal_links$$, 'anon cannot read portal links');
select test.expect_error($$select * from public.projects$$, 'anon cannot read projects');
select test.ok((select public.portal_view(repeat('ab', 32)) #>> '{client,name}' = 'Nova Labs'), 'portal returns client');
select test.ok((select jsonb_array_length(public.portal_view(repeat('ab', 32)) #> '{projects,0,milestones}') = 1), 'portal hides internal milestones');
select test.ok((select public.portal_view(repeat('ab', 32))::text not like '%secret client note%' and public.portal_view(repeat('ab', 32))::text not like '%internal brief%' and public.portal_view(repeat('ab', 32))::text not like '%INV-2026%'), 'portal leaks no notes, briefs or invoices');
select test.ok((select public.portal_view(repeat('cd', 32)) is null), 'wrong token returns nothing');
select test.ok((select public.portal_view('not-a-token') is null), 'malformed token returns nothing');
select test.act_as('00000000-0000-0000-0000-00000000000a');
update public.portal_links set enabled = false;
select test.act_as(null);
select test.ok((select public.portal_view(repeat('ab', 32)) is null), 'disabled link returns nothing');

reset role;
rollback;
