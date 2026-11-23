-- Hourly job that sends daily digests and invoice reminders through the `scheduled` Edge Function.
-- Before applying: in the Supabase dashboard add two Vault secrets:
--   project_url  = https://<project-ref>.supabase.co
--   cron_secret  = the same random value you set as the CRON_SECRET function secret
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'chakra-hourly',
  '5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/scheduled',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
