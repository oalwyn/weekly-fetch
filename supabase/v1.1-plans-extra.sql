-- Bay Fetch 1.1, part 2: "who's going", meet-up time and place, and "All my plans" across groups.
-- Run AFTER v1.1-groups.sql (Supabase > SQL Editor > New query > paste > Run). Safe to run more than once.
-- Same security model: locked tables, security-definer functions that check membership.

-- ---------- going / maybe / can't, per locked-in plan ----------
create table if not exists public.group_rsvps (
  group_id   uuid not null references public.groups(id) on delete cascade,
  item_id    text not null check (char_length(item_id) <= 100),
  user_id    uuid not null references auth.users(id) on delete cascade,
  status     text not null check (status in ('going','maybe','no')),
  updated_at timestamptz not null default now(),
  primary key (group_id, item_id, user_id)
);
alter table public.group_rsvps enable row level security;
revoke all on table public.group_rsvps from anon, authenticated;

-- ---------- meet-up on a locked-in plan ----------
alter table public.group_locks add column if not exists meet_time  text check (meet_time is null or meet_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
alter table public.group_locks add column if not exists meet_place text check (meet_place is null or char_length(meet_place) <= 120);
alter table public.group_locks add column if not exists meet_by    uuid references auth.users(id) on delete set null;

-- answers belong to a plan on a specific day: unlocking clears them, moving the day resets them
create or replace function public._locks_clear_rsvps() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from group_rsvps where group_id = old.group_id and item_id = old.item_id;
  return null;
end $$;
drop trigger if exists group_locks_unlock on public.group_locks;
create trigger group_locks_unlock after delete on public.group_locks
  for each row execute function public._locks_clear_rsvps();
drop trigger if exists group_locks_move on public.group_locks;
create trigger group_locks_move after update of day on public.group_locks
  for each row when (old.day is distinct from new.day) execute function public._locks_clear_rsvps();

-- usage counts for the new buttons
alter table public.usage_events drop constraint if exists usage_events_kind_check;
alter table public.usage_events add constraint usage_events_kind_check check (kind in ('app_open','event_view','star','lock',
  'calendar_add','reminder_tapped','share_invite','join_group','create_group','outbound_more_info','outbound_directions',
  'sign_in','rsvp','meetup','all_plans'));

-- ---------- functions ----------
-- Locking a plan in also marks the person who locked it as going (they can change it).
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
    insert into group_rsvps(group_id, item_id, user_id, status) values (p_group, p_item, me, 'going')
    on conflict do nothing;
  end if;
end $$;

-- p_status null clears the answer.
create or replace function public.set_rsvp(p_group uuid, p_item text, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := _me();
begin
  perform _require_member(p_group);
  if not exists (select 1 from group_locks where group_id = p_group and item_id = p_item) then
    raise exception 'that plan is not locked in';
  end if;
  if p_status is null then
    delete from group_rsvps where group_id = p_group and item_id = p_item and user_id = me;
  elsif p_status in ('going','maybe','no') then
    insert into group_rsvps(group_id, item_id, user_id, status) values (p_group, p_item, me, p_status)
    on conflict (group_id, item_id, user_id) do update set status = excluded.status, updated_at = now();
  else
    raise exception 'unknown answer';
  end if;
end $$;

-- Anyone in the group can set or clear the meet-up. p_time 'HH:MM' (24h) or null; p_place text or null.
create or replace function public.set_meetup(p_group uuid, p_item text, p_time text, p_place text) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := _me(); t text := nullif(trim(coalesce(p_time, '')), ''); pl text := nullif(left(regexp_replace(trim(coalesce(p_place, '')), '\s+', ' ', 'g'), 120), '');
begin
  perform _require_member(p_group);
  if t is not null and t !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'meet-up time should look like 10:30'; end if;
  update group_locks set meet_time = t, meet_place = pl, meet_by = case when t is null and pl is null then null else me end
  where group_id = p_group and item_id = p_item;
  if not found then raise exception 'that plan is not locked in'; end if;
end $$;

-- Everything the plans tab needs for one group, in one call (now with answers and meet-ups).
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
    'locks', coalesce((select jsonb_agg(jsonb_build_object('item_id', item_id, 'day', day, 'item', item, 'meet_time', meet_time, 'meet_place', meet_place))
                 from group_locks where group_id = p_group), '[]'::jsonb),
    'rsvps', coalesce((select jsonb_agg(jsonb_build_object('item_id', r.item_id, 'user_id', r.user_id, 'status', r.status) order by r.updated_at)
                 from group_rsvps r join group_members m on m.group_id = r.group_id and m.user_id = r.user_id
                 where r.group_id = p_group), '[]'::jsonb));
end $$;

-- "All my plans": every locked-in plan, from today on, in every group I'm in.
create or replace function public.get_my_plans() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := _me();
begin
  return coalesce((select jsonb_agg(jsonb_build_object(
      'group_id', l.group_id, 'group_name', g.name, 'item_id', l.item_id, 'day', l.day, 'item', l.item,
      'meet_time', l.meet_time, 'meet_place', l.meet_place,
      'mine', (select status from group_rsvps r where r.group_id = l.group_id and r.item_id = l.item_id and r.user_id = me),
      'answers', coalesce((select jsonb_agg(jsonb_build_object('name', coalesce(pr.display_name, 'Someone'), 'status', r.status, 'me', r.user_id = me) order by r.updated_at)
                   from group_rsvps r join group_members m2 on m2.group_id = r.group_id and m2.user_id = r.user_id
                   left join profiles pr on pr.id = r.user_id
                   where r.group_id = l.group_id and r.item_id = l.item_id), '[]'::jsonb)
    ) order by l.day, l.meet_time nulls last)
    from group_locks l
    join group_members m on m.group_id = l.group_id and m.user_id = me
    join groups g on g.id = l.group_id
    where l.day >= current_date - 1), '[]'::jsonb);
end $$;

-- Which of my groups I've starred each event in (event cards show "In Household · Friends").
create or replace function public.get_my_picks() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := _me();
begin
  return coalesce((select jsonb_agg(jsonb_build_object('group_id', p.group_id, 'item_id', p.item_id))
    from group_picks p join group_members m on m.group_id = p.group_id and m.user_id = me
    where p.user_id = me), '[]'::jsonb);
end $$;

-- ---------- who may call what ----------
revoke all on function public._locks_clear_rsvps() from public, anon, authenticated;
revoke all on function public.set_group_lock(uuid,text,date,jsonb), public.set_rsvp(uuid,text,text),
  public.set_meetup(uuid,text,text,text), public.get_group(uuid), public.get_my_plans(), public.get_my_picks() from public, anon;
grant execute on function public.set_group_lock(uuid,text,date,jsonb), public.set_rsvp(uuid,text,text),
  public.set_meetup(uuid,text,text,text), public.get_group(uuid), public.get_my_plans(), public.get_my_picks() to authenticated;

notify pgrst, 'reload schema';
