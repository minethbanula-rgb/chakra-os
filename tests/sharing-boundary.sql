-- Synthetic fixtures only; the production workspace and share table are restored by ROLLBACK.
begin;
update public.chakra_workspace set data='{"version":1,"settings":{"studio":"Fixture studio","email":"PRIVATE_EMAIL"},"clients":[{"id":"share-test-a","name":"Client A","email":"PRIVATE_EMAIL","notes":"PRIVATE_NOTES"},{"id":"share-test-b","name":"Client B"}],"projects":[{"name":"Allowed project","client":"Client A","status":"In Progress","description":"PRIVATE_DESCRIPTION","driveUrl":"https://drive.google.com/folder/fixture","milestones":[{"title":"Review","date":"2026-11-20","state":"Planned","notes":"PRIVATE_MILESTONE"}]},{"name":"OTHER_CLIENT_SECRET","client":"Client B"}],"invoices":[{"number":"PRIVATE_INVOICE"}],"tasks":[{"title":"PRIVATE_TASK"}]}'::jsonb where id=true;
insert into private.chakra_portal_shares(client_id,token_hash,enabled) values('share-test-a',encode(sha256(convert_to(repeat('a',64),'UTF8')),'hex'),true) on conflict(client_id) do update set token_hash=excluded.token_hash,enabled=true;
do $$declare uid uuid:=gen_random_uuid();email text;begin
 email='chakra-fixture-'||uid::text||'@example.invalid';
 insert into auth.users(id,email,email_confirmed_at) values(uid,email,now());
 insert into public.chakra_members(email,role,active) values(email,'member',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'email',email,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$begin
 if not public.chakra_manage_share('share-test-a','enable',repeat('a',64)) then raise exception 'STAFF_ENABLE_FAILED';end if;
 if not public.chakra_manage_share('share-test-a','status',repeat('a',64)) then raise exception 'STAFF_STATUS_FAILED';end if;
end $$;
reset role;
select set_config('request.jwt.claims','{}',true);
set local role anon;
do $$declare result jsonb;begin
 result=public.chakra_shared_portal(repeat('a',64));
 if result::text like '%PRIVATE_%' or result::text like '%OTHER_CLIENT%' then raise exception 'Portal leaked private data'; end if;
 if jsonb_array_length(result->'projects')<>1 or result#>>'{projects,0,milestones,0,title}'<>'Review' then raise exception 'Portal fixture mismatch'; end if;
 begin perform public.chakra_shared_portal(repeat('b',64));raise exception 'BAD_TOKEN_ACCEPTED';exception when others then if sqlerrm='BAD_TOKEN_ACCEPTED' then raise;end if;end;
 begin perform public.chakra_manage_share('share-test-a','revoke','');raise exception 'ANON_MANAGEMENT_ACCEPTED';exception when insufficient_privilege then null;end;
 begin perform data from public.chakra_workspace;raise exception 'ANON_WORKSPACE_ACCEPTED';exception when insufficient_privilege then null;end;
end $$;
reset role;
update private.chakra_portal_shares set token_hash=encode(sha256(convert_to(repeat('c',64),'UTF8')),'hex') where client_id='share-test-a';
set local role anon;
do $$begin
 begin perform public.chakra_shared_portal(repeat('a',64));raise exception 'OLD_TOKEN_ACCEPTED';exception when others then if sqlerrm='OLD_TOKEN_ACCEPTED' then raise;end if;end;
 perform public.chakra_shared_portal(repeat('c',64));
end $$;
reset role;
update private.chakra_portal_shares set enabled=false where client_id='share-test-a';
set local role anon;
do $$begin begin perform public.chakra_shared_portal(repeat('c',64));raise exception 'REVOKED_TOKEN_ACCEPTED';exception when others then if sqlerrm='REVOKED_TOKEN_ACCEPTED' then raise;end if;end;end $$;
reset role;
rollback;
