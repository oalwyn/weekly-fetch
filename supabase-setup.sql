-- The Weekly Fetch: shared "Our list" storage.
-- Paste this whole file into Supabase > SQL Editor > New query, then press Run.

create table if not exists public.picks (
  list_code  text not null,
  item_id    text not null,
  who        text not null default '',
  item       jsonb,
  created_at timestamptz not null default now(),
  primary key (list_code, item_id, who)
);

-- Lock the table: the site can only use the three functions below,
-- and only for a list whose private code it knows.
alter table public.picks enable row level security;
revoke all on table public.picks from anon, authenticated;

create or replace function public.get_picks(p_list text)
returns setof public.picks
language plpgsql security definer set search_path = public as $$
begin
  if length(p_list) < 16 then return; end if;
  return query select * from public.picks where list_code = p_list order by created_at;
end $$;

create or replace function public.add_pick(p_list text, p_item text, p_who text, p_item_json jsonb)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if length(p_list) < 16 or length(p_item) > 100 or length(coalesce(p_who,'')) > 40
     or length(coalesce(p_item_json::text,'')) > 4000 then
    raise exception 'invalid pick';
  end if;
  if (select count(*) from public.picks where list_code = p_list) >= 500 then
    raise exception 'list is full';
  end if;
  insert into public.picks(list_code, item_id, who, item)
  values (p_list, p_item, coalesce(p_who,''), p_item_json)
  on conflict (list_code, item_id, who) do update set item = excluded.item;
end $$;

create or replace function public.remove_pick(p_list text, p_item text, p_who text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from public.picks where list_code = p_list and item_id = p_item and who = coalesce(p_who,'');
end $$;

-- Tiny function the twice-weekly keep-alive job calls so the free project never pauses.
create or replace function public.ping()
returns text language sql security definer set search_path = public as $$ select 'ok'::text $$;

revoke all on function public.get_picks(text), public.add_pick(text,text,text,jsonb),
  public.remove_pick(text,text,text), public.ping() from public;
grant execute on function public.get_picks(text), public.add_pick(text,text,text,jsonb),
  public.remove_pick(text,text,text), public.ping() to anon, authenticated;
