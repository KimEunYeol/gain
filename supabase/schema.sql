-- Run in the SQL Editor of the dedicated, FREE gain project.
begin;
create table if not exists public.gain_admins (
 user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.gain_admins enable row level security;
revoke all on public.gain_admins from anon, authenticated;

create or replace function public.is_gain_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.gain_admins where user_id = auth.uid()) $$;
revoke all on function public.is_gain_admin() from public;
grant execute on function public.is_gain_admin() to anon, authenticated;

create table if not exists public.site_settings (
 id integer primary key check (id=1),
 about text not null default '', trainer text not null default '',
 join_info text not null default '', contact_url text not null default '',
 instagram_url text not null default '', faqs jsonb not null default '[]'::jsonb,
 check (jsonb_typeof(faqs)='array'),
 check (contact_url='' or contact_url ~ '^https://'),
 check (instagram_url='' or instagram_url ~ '^https://')
);
insert into public.site_settings(id,about,join_info) values
(1,'가인은 음악을 사랑하는 사람들이 만든 동호회입니다. 전문 보컬트레이너와 함께 노래를 배우고, 소공연과 대공연을 통해 우리의 음악을 나눕니다.','음악을 사랑하는 마음으로, 가인과 함께해요. 자세한 가입 안내는 곧 전해드리겠습니다.')
on conflict (id) do nothing;

do $$
declare table_name text;
begin
 foreach table_name in array array['events','performances','notices','albums'] loop
 execute format('create table if not exists public.%I (
 id uuid primary key default gen_random_uuid(),
 title text not null check (length(trim(title)) between 1 and 150),
 body text not null default '''',
 category text not null default ''정모'' check (category in (''정모'',''보컬 연습'',''소공연'',''대공연'')),
 starts_at timestamptz, ends_at timestamptz,
 location text not null default '''', pinned boolean not null default false,
 cover_path text not null default '''', video_url text not null default '''',
 created_at timestamptz not null default now(),
 check (ends_at is null or (starts_at is not null and ends_at >= starts_at)),
 check (video_url = '''' or video_url ~ ''^https://(www\.|m\.)?(youtube\.com|youtu\.be|instagram\.com)/'')
 )',table_name);
 end loop;
end $$;
create table if not exists public.photos (
 id uuid primary key default gen_random_uuid(),
 album_id uuid references public.albums(id) on delete cascade,
 performance_id uuid references public.performances(id) on delete cascade,
 path text not null unique,
 caption text not null default '', created_at timestamptz not null default now(),
 check ((album_id is not null)::integer + (performance_id is not null)::integer = 1)
);
create index if not exists photos_album_idx on public.photos(album_id);
create index if not exists photos_performance_idx on public.photos(performance_id);
do $$
declare table_name text;
begin
 foreach table_name in array array['site_settings','events','performances','notices','albums','photos'] loop
 execute format('alter table public.%I enable row level security',table_name);
 execute format('revoke all on public.%I from anon, authenticated',table_name);
 execute format('grant select on public.%I to anon, authenticated',table_name);
 execute format('grant insert, update, delete on public.%I to authenticated',table_name);
 execute format('drop policy if exists gain_public_read on public.%I',table_name);
 execute format('create policy gain_public_read on public.%I for select to anon,authenticated using (true)',table_name);
 execute format('drop policy if exists gain_admin_write on public.%I',table_name);
 execute format('create policy gain_admin_write on public.%I for all to authenticated using (public.is_gain_admin()) with check (public.is_gain_admin())',table_name);
 end loop;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('gain-media','gain-media',true,2097152,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=true,file_size_limit=2097152,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
create or replace function public.gain_storage_has_room() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(sum((metadata->>'size')::bigint),0) < 800*1024*1024 from storage.objects where bucket_id='gain-media' $$;
revoke all on function public.gain_storage_has_room() from public;
grant execute on function public.gain_storage_has_room() to authenticated;
drop policy if exists gain_media_read on storage.objects;
create policy gain_media_read on storage.objects for select to anon, authenticated using (bucket_id='gain-media');
drop policy if exists gain_media_insert on storage.objects;
create policy gain_media_insert on storage.objects for insert to authenticated with check (bucket_id='gain-media' and public.is_gain_admin() and public.gain_storage_has_room());
drop policy if exists gain_media_delete on storage.objects;
create policy gain_media_delete on storage.objects for delete to authenticated using (bucket_id='gain-media' and public.is_gain_admin());
commit;

-- AFTER creating an email/password user in Authentication > Users:
-- insert into public.gain_admins(user_id)
-- select id from auth.users where email = 'YOUR_ADMIN_EMAIL';
-- Disable "Allow new users to sign up" in Authentication > Sign In / Providers.
