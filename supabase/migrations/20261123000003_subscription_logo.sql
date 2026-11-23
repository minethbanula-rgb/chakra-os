-- Subscriptions can carry an uploaded logo; when empty the app shows the website's favicon.
alter table public.subscriptions add column if not exists logo text;
