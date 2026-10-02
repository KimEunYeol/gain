-- Existing oversized rows remain readable; new/updated rows must meet limits.
begin;
create function public.gain_valid_faqs(value jsonb) returns boolean
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
revoke all on function public.gain_valid_faqs(jsonb) from public;
grant execute on function public.gain_valid_faqs(jsonb) to anon,authenticated;
alter table public.site_settings add constraint gain_settings_size check (
 char_length(about)<=10000 and char_length(trainer)<=10000 and char_length(join_info)<=10000
 and char_length(contact_url)<=2048 and char_length(instagram_url)<=2048
 and public.gain_valid_faqs(faqs)) not valid;
do $$ declare t text; begin
 foreach t in array array['events','performances','notices','albums'] loop
   execute format('alter table public.%I add constraint gain_content_size check (
   char_length(title)<=150 and char_length(body)<=20000 and char_length(location)<=300
   and char_length(cover_path)<=512 and char_length(video_url)<=2048) not valid',t);
 end loop;
end $$;
alter table public.photos add constraint gain_photo_text_size check(char_length(caption)<=300 and char_length(path)<=512) not valid;
commit;
