-- The Bay Area Weekend Fetch / Bay Fetch 1.1: accounts, groups, group plans, usage counts.
-- Paste this whole file into Supabase > SQL Editor > New query, then press Run. Safe to run more than once.
-- Then run v1.1-plans-extra.sql too (it updates get_group and set_group_lock; run it again after re-running this file).
--
-- Same security model as supabase-setup.sql: tables are locked (RLS on, no table access for
-- anon/authenticated); everything goes through the functions below, which check auth.uid()
-- (the signed-in person) and group membership. The old anonymous `picks` table and its
-- functions are left untouched so app 1.0.x and the website keep working during the move.

-- ---------- tables ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 30),
  created_at   timestamptz not null default now()
);

create table if not exists public.groups (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(name) between 1 and 40),
  join_code        text not null unique,
  created_by       uuid references auth.users(id) on delete set null,
  legacy_list_code text unique,                -- set when converted from an old #list- shared plan
  created_at       timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id  uuid not null references public.groups(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  role      text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists group_members_user on public.group_members(user_id);

-- A star. `who` is the user's id as text, or 'legacy:<Name>' for stars copied from an old shared
-- plan whose person hasn't signed in yet (they can claim them by converting the same plan).
create table if not exists public.group_picks (
  group_id   uuid not null references public.groups(id) on delete cascade,
  item_id    text not null check (char_length(item_id) <= 100),
  who        text not null,
  user_id    uuid references auth.users(id) on delete cascade,
  item       jsonb check (item is null or pg_column_size(item) <= 4000),
  created_at timestamptz not null default now(),
  primary key (group_id, item_id, who)
);

-- One locked-in day per item per group.
create table if not exists public.group_locks (
  group_id   uuid not null references public.groups(id) on delete cascade,
  item_id    text not null check (char_length(item_id) <= 100),
  day        date not null,
  locked_by  uuid references auth.users(id) on delete set null,
  item       jsonb check (item is null or pg_column_size(item) <= 4000),
  created_at timestamptz not null default now(),
  primary key (group_id, item_id)
);

-- Failed join-code attempts (brute-force protection).
create table if not exists public.join_attempts (
  user_id uuid not null,
  at      timestamptz not null default now()
);
create index if not exists join_attempts_user_at on public.join_attempts(user_id, at);

-- First-party usage counts (no ad networks, no cross-app tracking).
create table if not exists public.usage_events (
  id       bigserial primary key,
  at       timestamptz not null default now(),
  kind     text not null check (kind in ('app_open','event_view','star','lock','calendar_add',
                 'reminder_tapped','share_invite','join_group','create_group',
                 'outbound_more_info','outbound_directions','sign_in')),
  item_id  text check (item_id is null or char_length(item_id) <= 100),
  user_id  uuid references auth.users(id) on delete set null,
  anon_id  text check (anon_id is null or char_length(anon_id) <= 40),
  group_id uuid references public.groups(id) on delete set null,
  platform text check (platform is null or platform in ('web','ios'))
);
create index if not exists usage_events_at on public.usage_events(at);

alter table public.profiles      enable row level security;
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.group_picks   enable row level security;
alter table public.group_locks   enable row level security;
alter table public.join_attempts enable row level security;
alter table public.usage_events  enable row level security;
revoke all on table public.profiles, public.groups, public.group_members, public.group_picks,
  public.group_locks, public.join_attempts, public.usage_events from anon, authenticated;
revoke all on sequence public.usage_events_id_seq from anon, authenticated;

-- ---------- helpers (not callable from the app) ----------
create or replace function public._me() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare u uuid := auth.uid();
begin
  if u is null then raise exception 'sign in required'; end if;
  return u;
end $$;

create or replace function public._require_member(p_group uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from group_members where group_id = p_group and user_id = auth.uid()) then
    raise exception 'not a member of this group';
  end if;
end $$;

-- 6 characters, no look-alikes (0/O, 1/I/L), from a cryptographically random uuid.
create or replace function public._new_code() returns text
language plpgsql volatile security definer set search_path = public as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b bytea; code text; i int;
begin
  loop
    b := uuid_send(gen_random_uuid()); code := '';
    for i in 0..5 loop
      code := code || substr(alphabet, (get_byte(b, i) % length(alphabet)) + 1, 1);
    end loop;
    exit when not exists (select 1 from groups where join_code = code);
  end loop;
  return code;
end $$;

create or replace function public._clean_name(p text, maxlen int) returns text
language sql immutable as $$ select nullif(left(btrim(regexp_replace(coalesce(p,''), '\s+', ' ', 'g')), maxlen), '') $$;

-- ---------- profile ----------
create or replace function public.set_my_name(p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare n text := _clean_name(p_name, 30); me uuid := _me();
begin
  if n is null then raise exception 'name required'; end if;
  insert into profiles(id, display_name) values (me, n)
  on conflict (id) do update set display_name = excluded.display_name;
end $$;

create or replace function public.get_me() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := _me();
begin
  return jsonb_build_object(
    'id', me,
    'name', (select display_name from profiles where id = me),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'code', g.join_code, 'role', m.role,
               'members', (select count(*) from group_members x where x.group_id = g.id))
             order by m.joined_at)
      from group_members m join groups g on g.id = m.group_id where m.user_id = me), '[]'::jsonb));
end $$;

-- ---------- groups ----------
create or replace function public.create_group(p_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me(); n text := _clean_name(p_name, 40); g groups;
begin
  if n is null then raise exception 'group name required'; end if;
  if (select count(*) from group_members where user_id = me) >= 20 then raise exception 'too many groups'; end if;
  insert into groups(name, join_code, created_by) values (n, _new_code(), me) returning * into g;
  insert into group_members(group_id, user_id, role) values (g.id, me, 'owner');
  return jsonb_build_object('id', g.id, 'name', g.name, 'code', g.join_code);
end $$;

create or replace function public.join_group(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me(); c text := upper(regexp_replace(coalesce(p_code,''), '[^A-Za-z0-9]', '', 'g')); g groups;
begin
  if (select count(*) from join_attempts where user_id = me and at > now() - interval '1 hour') >= 20 then
    raise exception 'too many attempts, try again later';
  end if;
  select * into g from groups where join_code = c;
  if g.id is null then
    -- returned, not raised: raising would also undo this note of the failed attempt
    insert into join_attempts(user_id) values (me);
    return jsonb_build_object('error', 'no group with that code');
  end if;
  if (select count(*) from group_members where user_id = me) >= 20 then raise exception 'too many groups'; end if;
  if (select count(*) from group_members where group_id = g.id) >= 50 then raise exception 'group is full'; end if;
  insert into group_members(group_id, user_id) values (g.id, me) on conflict do nothing;
  return jsonb_build_object('id', g.id, 'name', g.name, 'code', g.join_code);
end $$;

create or replace function public.leave_group(p_group uuid) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := _me(); was_owner boolean;
begin
  select role = 'owner' into was_owner from group_members where group_id = p_group and user_id = me;
  delete from group_picks where group_id = p_group and user_id = me;
  delete from group_members where group_id = p_group and user_id = me;
  if not exists (select 1 from group_members where group_id = p_group) then
    delete from groups where id = p_group;                       -- last one out: remove the group
  elsif was_owner then                                            -- hand ownership to the longest-standing member
    update group_members set role = 'owner'
    where group_id = p_group and user_id = (select user_id from group_members where group_id = p_group order by joined_at limit 1);
  end if;
  -- stars removed: clear locks nobody has starred any more
  delete from group_locks l where l.group_id = p_group
    and not exists (select 1 from group_picks p where p.group_id = l.group_id and p.item_id = l.item_id);
end $$;

create or replace function public.rename_group(p_group uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare n text := _clean_name(p_name, 40);
begin
  perform _me(); perform _require_member(p_group);
  if n is null then raise exception 'group name required'; end if;
  update groups set name = n where id = p_group;
end $$;

create or replace function public.rotate_join_code(p_group uuid) returns text
language plpgsql security definer set search_path = public as $$
declare me uuid := _me(); c text;
begin
  if not exists (select 1 from group_members where group_id = p_group and user_id = me and role = 'owner') then
    raise exception 'only the group owner can change the code';
  end if;
  c := _new_code(); update groups set join_code = c where id = p_group; return c;
end $$;

-- Everything the plans tab needs for one group, in one call.
create or replace function public.get_group(p_group uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform _me(); perform _require_member(p_group);
  return jsonb_build_object(
    'group', (select jsonb_build_object('id', id, 'name', name, 'code', join_code) from groups where id = p_group),
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', m.user_id, 'name', coalesce(pr.display_name, 'Someone'), 'role', m.role) order by m.joined_at)
                 from group_members m left join profiles pr on pr.id = m.user_id where m.group_id = p_group), '[]'::jsonb),
    'picks', coalesce((select jsonb_agg(jsonb_build_object('item_id', p.item_id, 'who', p.who, 'user_id', p.user_id,
                 'name', case when p.user_id is null then substr(p.who, 8) else coalesce(pr.display_name, 'Someone') end, 'item', p.item) order by p.created_at)
                 from group_picks p left join profiles pr on pr.id = p.user_id where p.group_id = p_group), '[]'::jsonb),
    'locks', coalesce((select jsonb_agg(jsonb_build_object('item_id', item_id, 'day', day, 'item', item)) from group_locks where group_id = p_group), '[]'::jsonb));
end $$;

-- ---------- stars and locked-in days ----------
create or replace function public.add_group_pick(p_group uuid, p_item text, p_item_json jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := _me();
begin
  perform _require_member(p_group);
  if (select count(*) from group_picks where group_id = p_group) >= 1000 then raise exception 'plan is full'; end if;
  insert into group_picks(group_id, item_id, who, user_id, item) values (p_group, p_item, me::text, me, p_item_json)
  on conflict (group_id, item_id, who) do update set item = excluded.item;
end $$;

create or replace function public.remove_group_pick(p_group uuid, p_item text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := _me();
begin
  perform _require_member(p_group);
  delete from group_picks where group_id = p_group and item_id = p_item and who = me::text;
  -- the last star on an item clears its locked-in day (same rule as before)
  if not exists (select 1 from group_picks where group_id = p_group and item_id = p_item) then
    delete from group_locks where group_id = p_group and item_id = p_item;
  end if;
end $$;

-- p_day null = unlock ("make it a maybe").
create or replace function public.set_group_lock(p_group uuid, p_item text, p_day date, p_item_json jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := _me();
begin
  perform _require_member(p_group);
  if p_day is null then
    delete from group_locks where group_id = p_group and item_id = p_item;
  else
    insert into group_locks(group_id, item_id, day, locked_by, item) values (p_group, p_item, p_day, me, p_item_json)
    on conflict (group_id, item_id) do update set day = excluded.day, locked_by = excluded.locked_by, item = coalesce(excluded.item, group_locks.item);
  end if;
end $$;

-- ---------- moving an old anonymous #list- plan into a group ----------
-- Anyone who has the old list code could already read and change that list, so holding the code
-- is enough to convert it or join the group it became. p_my_old_name: the first name this person
-- used on the old list (their stars become theirs; everyone else's stay as 'legacy:Name').
create or replace function public.convert_legacy_list(p_list text, p_group_name text, p_my_old_name text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me(); g groups; oldname text := _clean_name(p_my_old_name, 30);
begin
  if length(coalesce(p_list,'')) < 16 then raise exception 'invalid list code'; end if;
  select * into g from groups where legacy_list_code = p_list;
  if g.id is null then
    if not exists (select 1 from picks where list_code = p_list) then raise exception 'that shared plan is empty or does not exist'; end if;
    insert into groups(name, join_code, created_by, legacy_list_code)
      values (coalesce(_clean_name(p_group_name, 40), 'Our weekend plans'), _new_code(), me, p_list) returning * into g;
    insert into group_members(group_id, user_id, role) values (g.id, me, 'owner');
    insert into group_picks(group_id, item_id, who, item, created_at)
      select g.id, item_id, 'legacy:' || _clean_name(who, 30), item, created_at from picks
      where list_code = p_list and who not like '\_\_lock\_\_%' and _clean_name(who, 30) is not null
      on conflict do nothing;
    insert into group_locks(group_id, item_id, day, item, created_at)
      select distinct on (item_id) g.id, item_id, substr(who, 9)::date, item, created_at from picks
      where list_code = p_list and who ~ '^__lock__\d{4}-\d{2}-\d{2}$'
      order by item_id, created_at desc
      on conflict do nothing;
  else
    insert into group_members(group_id, user_id) values (g.id, me) on conflict do nothing;
  end if;
  if oldname is not null then   -- claim this person's old stars
    insert into group_picks(group_id, item_id, who, user_id, item, created_at)
      select group_id, item_id, me::text, me, item, created_at from group_picks
      where group_id = g.id and who = 'legacy:' || oldname
      on conflict do nothing;
    delete from group_picks where group_id = g.id and who = 'legacy:' || oldname;
  end if;
  return jsonb_build_object('id', g.id, 'name', g.name, 'code', g.join_code);
end $$;

-- ---------- account deletion (required by Apple) ----------
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := _me(); r record;
begin
  for r in select group_id from group_members where user_id = me loop
    perform leave_group(r.group_id);       -- hands over ownership or removes empty groups
  end loop;
  delete from join_attempts where user_id = me;
  delete from auth.users where id = me;  -- cascades to profiles, stars; usage counts lose their user link
end $$;

-- ---------- usage counts ----------
-- Signed-in calls record the user; signed-out calls only a random per-device id. Never readable by the app.
create or replace function public.log_event(p_kind text, p_item text default null, p_group uuid default null,
                                            p_anon text default null, p_platform text default null) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if p_group is not null and (me is null or not exists (select 1 from group_members where group_id = p_group and user_id = me)) then
    p_group := null;
  end if;
  insert into usage_events(kind, item_id, user_id, anon_id, group_id, platform)
  values (p_kind, left(p_item, 100), me, case when me is null then left(p_anon, 40) end, p_group, p_platform);
end $$;

-- ---------- who may call what ----------
revoke all on function public._me(), public._require_member(uuid), public._new_code(), public._clean_name(text,int) from public, anon, authenticated;
revoke all on function public.set_my_name(text), public.get_me(), public.create_group(text), public.join_group(text),
  public.leave_group(uuid), public.rename_group(uuid,text), public.rotate_join_code(uuid), public.get_group(uuid),
  public.add_group_pick(uuid,text,jsonb), public.remove_group_pick(uuid,text), public.set_group_lock(uuid,text,date,jsonb),
  public.convert_legacy_list(text,text,text), public.delete_my_account(), public.log_event(text,text,uuid,text,text) from public, anon;
-- (Supabase grants new functions to anon by default, so "from public" alone isn't enough.)
grant execute on function public.set_my_name(text), public.get_me(), public.create_group(text), public.join_group(text),
  public.leave_group(uuid), public.rename_group(uuid,text), public.rotate_join_code(uuid), public.get_group(uuid),
  public.add_group_pick(uuid,text,jsonb), public.remove_group_pick(uuid,text), public.set_group_lock(uuid,text,date,jsonb),
  public.convert_legacy_list(text,text,text), public.delete_my_account() to authenticated;
grant execute on function public.log_event(text,text,uuid,text,text) to anon, authenticated;

notify pgrst, 'reload schema';
