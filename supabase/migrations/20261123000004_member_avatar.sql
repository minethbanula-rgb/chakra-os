-- Profile photos (small square data URLs, resized to 256px in the browser).
alter table public.members add column if not exists avatar text
  check (avatar is null or (avatar like 'data:image/%' and length(avatar) < 400000));
