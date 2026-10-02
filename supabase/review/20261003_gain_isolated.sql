-- Single transaction: all schema/bucket/policies/quota changes roll back on failure.
-- Shared project allocation: Gain 250 MiB + Iam9P 250 MiB = 500 MiB planned.
begin;
-- REVIEW ONLY: never run against production as part of build/test/deployment.
-- Parent dashboard evidence: existing gain-music-club project is FREE and shared
-- with Iam9P. This creates new gain tables; never copies/mutates public.photos.
-- First verify grants, schema exposure, PostgreSQL role ownership, trigger privileges
-- and existing bucket/object/policy names in an isolated Supabase clone.
-- Apply once only after explicit remote authorization. No credentials here.
-- PostgREST exposure of gain is a separate reviewed dashboard configuration.
create schema gain;
revoke all on schema gain from public;
grant usage on schema gain to anon, authenticated;

-- Derived from schema.sql; isolated schema and bucket.
-- Run in the SQL Editor of the existing FREE project, after isolated review.
create table if not exists gain.gain_admins (
 user_id uuid primary key references auth.users(id) on delete cascade
);
alter table gain.gain_admins enable row level security;
revoke all on gain.gain_admins from anon, authenticated;

create or replace function gain.is_gain_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from gain.gain_admins where user_id = auth.uid()) $$;
revoke all on function gain.is_gain_admin() from public;
grant execute on function gain.is_gain_admin() to anon, authenticated;

create table if not exists gain.site_settings (
 id integer primary key check (id=1),
 about text not null default '', trainer text not null default '',
 join_info text not null default '', contact_url text not null default '',
 instagram_url text not null default '', faqs jsonb not null default '[]'::jsonb,
 check (jsonb_typeof(faqs)='array'),
 check (contact_url='' or contact_url ~ '^https://'),
 check (instagram_url='' or instagram_url ~ '^https://')
);
insert into gain.site_settings(id,about,join_info) values
(1,'가인은 음악을 사랑하는 사람들이 만든 동호회입니다. 전문 보컬트레이너와 함께 노래를 배우고, 소공연과 대공연을 통해 우리의 음악을 나눕니다.','음악을 사랑하는 마음으로, 가인과 함께해요. 자세한 가입 안내는 곧 전해드리겠습니다.')
on conflict (id) do nothing;

do $$
declare table_name text;
begin
 foreach table_name in array array['events','performances','notices','albums'] loop
 execute format('create table if not exists gain.%I (
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
create table if not exists gain.photos (
 id uuid primary key default gen_random_uuid(),
 album_id uuid references gain.albums(id) on delete cascade,
 performance_id uuid references gain.performances(id) on delete cascade,
 path text not null unique,
 caption text not null default '', created_at timestamptz not null default now(),
 check ((album_id is not null)::integer + (performance_id is not null)::integer = 1)
);
create index if not exists photos_album_idx on gain.photos(album_id);
create index if not exists photos_performance_idx on gain.photos(performance_id);
do $$
declare table_name text;
begin
 foreach table_name in array array['site_settings','events','performances','notices','albums','photos'] loop
 execute format('alter table gain.%I enable row level security',table_name);
 execute format('revoke all on gain.%I from anon, authenticated',table_name);
 execute format('grant select on gain.%I to anon, authenticated',table_name);
 execute format('grant insert, update, delete on gain.%I to authenticated',table_name);
 execute format('drop policy if exists gain_public_read on gain.%I',table_name);
 execute format('create policy gain_public_read on gain.%I for select to anon,authenticated using (true)',table_name);
 execute format('drop policy if exists gain_admin_write on gain.%I',table_name);
 execute format('create policy gain_admin_write on gain.%I for all to authenticated using (gain.is_gain_admin()) with check (gain.is_gain_admin())',table_name);
 end loop;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('gain-public-media-v1','gain-public-media-v1',true,2097152,array['image/jpeg','image/png','image/webp'])
; -- New bucket only; existing same-named bucket fails for manual review.
create or replace function gain.gain_storage_has_room() returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(sum((metadata->>'size')::bigint),0) < 250*1024*1024 from storage.objects where bucket_id='gain-public-media-v1' $$;
revoke all on function gain.gain_storage_has_room() from public;
grant execute on function gain.gain_storage_has_room() to authenticated;
drop policy if exists gain_media_read_isolated_v1 on storage.objects;
create policy gain_media_read_isolated_v1 on storage.objects for select to anon, authenticated using (bucket_id='gain-public-media-v1');
drop policy if exists gain_media_insert_isolated_v1 on storage.objects;
create policy gain_media_insert_isolated_v1 on storage.objects for insert to authenticated with check (bucket_id='gain-public-media-v1' and gain.is_gain_admin() and gain.gain_storage_has_room());
drop policy if exists gain_media_delete_isolated_v1 on storage.objects;
create policy gain_media_delete_isolated_v1 on storage.objects for delete to authenticated using (bucket_id='gain-public-media-v1' and gain.is_gain_admin());

-- AFTER creating an email/password user in Authentication > Users:
-- insert into gain.gain_admins(user_id)
-- select id from auth.users where email = 'YOUR_ADMIN_EMAIL';
-- Disable "Allow new users to sign up" in Authentication > Sign In / Providers.

-- Derived from 202610020001_media_quota.sql; isolated schema and bucket.
-- Conservative reservations: each new file reserves the full 2 MiB upload limit.
-- Existing objects reserve at least 2 MiB, with 2 MiB fallback for missing size.
-- Requires permission to install a trigger on storage.objects; validate in staging.
lock table storage.objects in share row exclusive mode;
create table gain.gain_media_quota (
  scope text primary key, objects bigint not null default 0 check(objects>=0),
  bytes bigint not null default 0 check(bytes>=0)
);
create table gain.gain_media_reservations (
  object_id uuid primary key, owner_scope text not null, bytes bigint not null
);
alter table gain.gain_media_quota enable row level security;
alter table gain.gain_media_reservations enable row level security;
revoke all on gain.gain_media_quota, gain.gain_media_reservations from public, anon, authenticated;
insert into gain.gain_media_reservations
select id, 'global',
 greatest(2097152, case when metadata->>'size' ~ '^[0-9]{1,15}$'
 then (metadata->>'size')::bigint else 2*1024*1024 end)
from storage.objects where bucket_id='gain-public-media-v1';
insert into gain.gain_media_quota(scope,objects,bytes)
select 'global',count(*),coalesce(sum(bytes),0) from gain.gain_media_reservations;

create function gain.gain_media_enforce_quota() returns trigger
language plpgsql security definer set search_path='' as $$
declare r gain.gain_media_reservations%rowtype; owner_key text;
begin
 if TG_OP='UPDATE' then
   if (OLD.bucket_id='gain-public-media-v1' or NEW.bucket_id='gain-public-media-v1')
      and (OLD.bucket_id is distinct from NEW.bucket_id or OLD.name is distinct from NEW.name or OLD.id is distinct from NEW.id)
   then raise exception '사진 경로 변경 대신 삭제 후 다시 업로드해주세요.'; end if;
   return NEW;
 end if;
 if TG_OP='DELETE' then
   if OLD.bucket_id <> 'gain-public-media-v1' then return OLD; end if;
   select * into r from gain.gain_media_reservations where object_id=OLD.id;
   if found then
     -- Always acquire global then user counters, including deletions.
     update gain.gain_media_quota set objects=objects-1,bytes=bytes-r.bytes where scope='global';

     delete from gain.gain_media_reservations where object_id=OLD.id;
   end if;
   return OLD;
 end if;
 if NEW.bucket_id <> 'gain-public-media-v1' then return NEW; end if;
 owner_key := 'global';
 -- Conditional row updates serialize competing uploads; failed inserts roll back reservations.
 update gain.gain_media_quota set objects=objects+1,bytes=bytes+2097152
 where scope='global' and objects<125 and bytes+2097152<=250*1024*1024;
 if not found then raise exception '사진 저장 공간이 부족해요.'; end if;

 insert into gain.gain_media_reservations values(NEW.id,owner_key,2097152);
 return NEW;
end $$;
revoke all on function gain.gain_media_enforce_quota() from public,anon,authenticated;
create trigger gain_media_quota_guard_isolated_v1 before insert or delete or update of bucket_id,name,id
on storage.objects for each row execute function gain.gain_media_enforce_quota();
update storage.buckets set file_size_limit=2097152 where id='gain-public-media-v1';
-- Replace the old snapshot SUM policy; the trigger now reserves capacity atomically.
drop policy if exists gain_media_insert_isolated_v1 on storage.objects;
create policy gain_media_insert_isolated_v1 on storage.objects for insert to authenticated
with check(bucket_id='gain-public-media-v1' and gain.is_gain_admin());
drop function gain.gain_storage_has_room();


-- Derived from 202610020002_content_limits.sql; isolated schema and bucket.
-- Existing oversized rows remain readable; new/updated rows must meet limits.
create function gain.gain_valid_faqs(value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare item jsonb;
begin
 if jsonb_typeof(value) is distinct from 'array' then return false; end if;
 if jsonb_array_length(value)>30 then return false; end if;
 for item in select * from jsonb_array_elements(value) loop
   if jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item->'question') is distinct from 'string'
      or jsonb_typeof(item->'answer') is distinct from 'string'
      or char_length(trim(item->>'question')) not between 1 and 300
      or char_length(trim(item->>'answer')) not between 1 and 3000
      or char_length(item->>'question')>300 or char_length(item->>'answer')>3000
      or (item - 'question' - 'answer') <> '{}'::jsonb then return false; end if;
 end loop;
 return true;
end $$;
revoke all on function gain.gain_valid_faqs(jsonb) from public;
grant execute on function gain.gain_valid_faqs(jsonb) to anon,authenticated;
alter table gain.site_settings add constraint gain_settings_size check (
 char_length(about)<=10000 and char_length(trainer)<=10000 and char_length(join_info)<=10000
 and char_length(contact_url)<=2048 and char_length(instagram_url)<=2048
 and gain.gain_valid_faqs(faqs)) not valid;
do $$ declare t text; begin
 foreach t in array array['events','performances','notices','albums'] loop
   execute format('alter table gain.%I add constraint gain_content_size check (
   char_length(title)<=150 and char_length(body)<=20000 and char_length(location)<=300
   and char_length(cover_path)<=512 and char_length(video_url)<=2048) not valid',t);
 end loop;
end $$;
alter table gain.photos add constraint gain_photo_text_size check(char_length(caption)<=300 and char_length(path)<=512) not valid;
commit;
