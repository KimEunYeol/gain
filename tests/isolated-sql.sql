\set ON_ERROR_STOP on
create role anon;
create role authenticated;
create schema auth;
create table auth.users(id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth to anon,authenticated;
grant execute on function auth.uid() to anon,authenticated;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
alter table storage.objects enable row level security;
grant usage on schema storage to anon,authenticated;
grant select,insert,delete on storage.objects to anon,authenticated;
-- Simulate Iam9P table: Gain migration must preserve its structure and data.
create table public.photos(id integer primary key,private_note text);
insert into public.photos values(1,'legacy fixture');
\i supabase/review/20261003_gain_isolated.sql
insert into auth.users values('00000000-0000-0000-0000-000000000001','admin@example.invalid');
insert into gain.gain_admins values('00000000-0000-0000-0000-000000000001');
set role anon;
select id from gain.site_settings;
do $$ begin
 begin insert into gain.notices(title) values('anonymous'); raise exception 'anonymous write unexpectedly succeeded';
 exception when insufficient_privilege then null; end;
 begin select * from gain.gain_admins; raise exception 'admin identities unexpectedly readable';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',false);
do $$ begin
 begin insert into gain.notices(title) values('non-admin'); raise exception 'non-admin write unexpectedly succeeded';
 exception when insufficient_privilege then null; end;
 begin insert into storage.objects(bucket_id,name) values('gain-public-media-v1','unauthorized.webp'); raise exception 'non-admin upload unexpectedly succeeded';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);
insert into gain.notices(title) values('admin isolated fixture');
insert into storage.objects(bucket_id,name) select 'gain-public-media-v1',n||'.webp' from generate_series(1,125)n;
do $$ begin
 begin insert into storage.objects(bucket_id,name) values('gain-public-media-v1','overflow.webp'); raise exception 'quota unexpectedly bypassed';
 exception when raise_exception then if SQLERRM not like '%저장 공간%' then raise; end if; end;
end $$;
delete from storage.objects where bucket_id='gain-public-media-v1' and name='1.webp';
insert into storage.objects(bucket_id,name) values('gain-public-media-v1','reclaimed.webp');
reset role;
-- Other buckets are untouched by quota counters.
insert into storage.objects(bucket_id,name) values('legacy-bucket','legacy.webp');
do $$ begin
 if (select count(*) from public.photos where private_note='legacy fixture')<>1 then raise exception 'legacy data changed'; end if;
 if (select objects from gain.gain_media_quota where scope='global')<>125 then raise exception 'quota counter incorrect'; end if;
 if (select bytes from gain.gain_media_quota where scope='global')<>250*1024*1024 then raise exception 'quota byte counter incorrect'; end if;
 begin insert into gain.notices(title,body) values('oversized',repeat('x',20001)); raise exception 'content size bypass';
 exception when check_violation then null; end;
end $$;
select 'isolated PostgreSQL RLS, quota rollback/reclaim and legacy preservation passed' as result;
