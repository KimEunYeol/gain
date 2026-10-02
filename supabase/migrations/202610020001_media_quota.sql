-- Conservative reservations: each new file reserves the full 2 MiB upload limit.
-- Existing objects reserve at least 2 MiB, with 2 MiB fallback for missing size.
-- Requires permission to install a trigger on storage.objects; validate in staging.
begin;
lock table storage.objects in share row exclusive mode;
create table public.gain_media_quota (
  scope text primary key, objects bigint not null default 0 check(objects>=0),
  bytes bigint not null default 0 check(bytes>=0)
);
create table public.gain_media_reservations (
  object_id uuid primary key, owner_scope text not null, bytes bigint not null
);
alter table public.gain_media_quota enable row level security;
alter table public.gain_media_reservations enable row level security;
revoke all on public.gain_media_quota, public.gain_media_reservations from public, anon, authenticated;
insert into public.gain_media_reservations
select id, 'global',
 greatest(2097152, case when metadata->>'size' ~ '^[0-9]{1,15}$'
 then (metadata->>'size')::bigint else 2*1024*1024 end)
from storage.objects where bucket_id='gain-media';
insert into public.gain_media_quota(scope,objects,bytes)
select 'global',count(*),coalesce(sum(bytes),0) from public.gain_media_reservations;

create function public.gain_media_enforce_quota() returns trigger
language plpgsql security definer set search_path='' as $$
declare r public.gain_media_reservations%rowtype; owner_key text;
begin
 if TG_OP='UPDATE' then
   if (OLD.bucket_id='gain-media' or NEW.bucket_id='gain-media')
      and (OLD.bucket_id is distinct from NEW.bucket_id or OLD.name is distinct from NEW.name or OLD.id is distinct from NEW.id)
   then raise exception '사진 경로 변경 대신 삭제 후 다시 업로드해주세요.'; end if;
   return NEW;
 end if;
 if TG_OP='DELETE' then
   if OLD.bucket_id <> 'gain-media' then return OLD; end if;
   select * into r from public.gain_media_reservations where object_id=OLD.id;
   if found then
     -- Always acquire global then user counters, including deletions.
     update public.gain_media_quota set objects=objects-1,bytes=bytes-r.bytes where scope='global';

     delete from public.gain_media_reservations where object_id=OLD.id;
   end if;
   return OLD;
 end if;
 if NEW.bucket_id <> 'gain-media' then return NEW; end if;
 owner_key := 'global';
 -- Conditional row updates serialize competing uploads; failed inserts roll back reservations.
 update public.gain_media_quota set objects=objects+1,bytes=bytes+2097152
 where scope='global' and objects<400 and bytes+2097152<=800*1024*1024;
 if not found then raise exception '사진 저장 공간이 부족해요.'; end if;

 insert into public.gain_media_reservations values(NEW.id,owner_key,2097152);
 return NEW;
end $$;
revoke all on function public.gain_media_enforce_quota() from public,anon,authenticated;
create trigger gain_media_quota_guard before insert or delete or update of bucket_id,name,id
on storage.objects for each row execute function public.gain_media_enforce_quota();
update storage.buckets set file_size_limit=2097152 where id='gain-media';
-- Replace the old snapshot SUM policy; the trigger now reserves capacity atomically.
drop policy if exists gain_media_insert on storage.objects;
create policy gain_media_insert on storage.objects for insert to authenticated
with check(bucket_id='gain-media' and public.is_gain_admin());
drop function public.gain_storage_has_room();
commit;
