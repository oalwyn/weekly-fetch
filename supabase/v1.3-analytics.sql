-- Bay Fetch 1.3: engagement measurement (see the owner's measurement plan).
-- Run AFTER v1.1-groups.sql and v1.1-plans-extra.sql. Safe to run more than once.
-- Re-run this file after re-running either of those (it redefines some of their functions).
--
-- Design:
--  * analytics_events is the record. Nothing in the app or website can read it; only admin_* functions can, and only for
--    accounts listed in analytics_admins.
--  * Group plan changes are recorded by triggers on the plan tables, in the same transaction as the change, and only when
--    something actually changed (a retry or a double tap changes nothing, so it records nothing). evidence = server_confirmed.
--  * Everything else (local stars, link clicks, views, filters) comes from log_client_event, which validates, rate-limits and
--    de-duplicates by record_id. evidence = client_observed.
--  * The user id is always taken from the sign-in token on the server; the device code (anon_id) is only stored for signed-out
--    activity. Records never hold names, emails, invite codes, typed text or full URLs.
--  * The old usage_events table and log_event stay as they were for older app versions; reports don't use them.

-- ---------- tables ----------
create table if not exists public.analytics_events (
  record_id      uuid primary key,
  event_name     text not null,
  schema_version smallint not null default 1,
  client_ts      timestamptz,
  received_at    timestamptz not null default now(),
  anon_id        text check (anon_id is null or anon_id ~ '^[A-Za-z0-9_-]{6,40}$'),
  user_id        uuid references auth.users(id) on delete set null,
  session_id     text check (session_id is null or session_id ~ '^[A-Za-z0-9_-]{6,40}$'),
  group_id       uuid references public.groups(id) on delete set null,
  item_id        text check (item_id is null or char_length(item_id) <= 100),
  occurrence_id  text check (occurrence_id is null or char_length(occurrence_id) <= 120),
  placement      text check (placement is null or placement ~ '^[a-z0-9_]{1,40}$'),
  category       text check (category is null or category ~ '^[a-z]{1,20}$'),
  region         text check (region is null or region ~ '^[a-z_]{1,20}$'),
  platform       text check (platform is null or platform in ('web','ios')),
  app_version    text check (app_version is null or app_version ~ '^[A-Za-z0-9._+-]{1,24}$'),
  environment    text not null default 'production' check (environment in ('production','development','test')),
  is_internal    boolean not null default false,
  evidence       text not null check (evidence in ('client_observed','server_confirmed')),
  source         text check (source is null or source ~ '^[a-z0-9._-]{1,60}$'),
  medium         text check (medium is null or medium ~ '^[a-z0-9._-]{1,60}$'),
  campaign       text check (campaign is null or campaign ~ '^[a-z0-9._-]{1,100}$'),
  landing_path   text check (landing_path is null or (char_length(landing_path) <= 200 and landing_path !~ '[?#]')),
  outbound_id    uuid,
  dest_host      text check (dest_host is null or dest_host ~ '^[a-z0-9.-]{1,100}$'),
  props          jsonb check (props is null or (jsonb_typeof(props) = 'object' and octet_length(props::text) <= 1024))
);
alter table public.analytics_events drop constraint if exists analytics_events_name_check;
alter table public.analytics_events add constraint analytics_events_name_check check (event_name in (
  'page_view','app_open','event_detail_viewed','filter_applied','results_empty','map_event_opened',
  'event_starred','event_unstarred','event_locked_in','event_lock_moved','event_unlocked',
  'rsvp_set','rsvp_cleared','meetup_set','meetup_cleared','group_created','group_joined','group_left',
  'invite_share_opened','invite_shared','invite_link_copied','calendar_added',
  'outbound_booking_clicked','outbound_info_clicked','directions_clicked',
  'sign_in','sign_out','all_plans_viewed','reminder_tapped','app_store_clicked'));
create index if not exists analytics_events_received on public.analytics_events(received_at);
create index if not exists analytics_events_name_received on public.analytics_events(event_name, received_at);
create index if not exists analytics_events_user on public.analytics_events(user_id, received_at);
create index if not exists analytics_events_anon on public.analytics_events(anon_id, received_at);
create index if not exists analytics_events_group on public.analytics_events(group_id, received_at);

-- owner accounts that may read reports
create table if not exists public.analytics_admins (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
-- accounts and device codes whose activity is internal (owner, testers); excluded from every KPI, also retroactively
create table if not exists public.analytics_internal (
  id       bigserial primary key,
  user_id  uuid references auth.users(id) on delete cascade,
  anon_id  text,
  note     text check (note is null or char_length(note) <= 80),
  added_at timestamptz not null default now(),
  check ((user_id is null) <> (anon_id is null))
);
create unique index if not exists analytics_internal_user on public.analytics_internal(user_id) where user_id is not null;
create unique index if not exists analytics_internal_anon on public.analytics_internal(anon_id) where anon_id is not null;
-- rejected client records, per day and reason (instrumentation health)
create table if not exists public.analytics_rejects (
  day    date not null,
  reason text not null,
  n      integer not null default 0,
  primary key (day, reason)
);
-- identifier-free weekly totals kept after raw records expire
create table if not exists public.analytics_weekly (
  week        date not null,
  event_name  text not null,
  platform    text not null default '',
  evidence    text not null,
  records     integer not null,
  identities  integer not null,
  primary key (week, event_name, platform, evidence)
);
create table if not exists public.analytics_meta (
  key   text primary key,
  value text not null
);
insert into public.analytics_meta(key, value) values ('instrumentation_start', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
  on conflict (key) do nothing;
insert into public.analytics_meta(key, value) values ('retention_months', '13') on conflict (key) do nothing;

alter table public.analytics_events   enable row level security;
alter table public.analytics_admins   enable row level security;
alter table public.analytics_internal enable row level security;
alter table public.analytics_rejects  enable row level security;
alter table public.analytics_weekly   enable row level security;
alter table public.analytics_meta     enable row level security;
revoke all on table public.analytics_events, public.analytics_admins, public.analytics_internal, public.analytics_rejects,
  public.analytics_weekly, public.analytics_meta from anon, authenticated;
revoke all on sequence public.analytics_internal_id_seq from anon, authenticated;

-- ---------- helpers ----------
create or replace function public._analytics_internal(p_user uuid, p_anon text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from analytics_internal where (p_user is not null and user_id = p_user) or (p_anon is not null and anon_id = p_anon));
$$;

create or replace function public._analytics_reject(p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  insert into analytics_rejects(day, reason, n) values ((now() at time zone 'America/Los_Angeles')::date, left(p_reason, 40), 1)
  on conflict (day, reason) do update set n = analytics_rejects.n + 1;
  return jsonb_build_object('ok', false, 'reason', p_reason);
end $$;

create or replace function public._clean_token(p text, p_len int) returns text
language sql immutable as $$
  select nullif(left(regexp_replace(lower(coalesce(p, '')), '[^a-z0-9._-]', '', 'g'), p_len), '');
$$;

create or replace function public._clean_path(p text) returns text
language sql immutable as $$
  select nullif(left(split_part(split_part(coalesce(p, ''), '?', 1), '#', 1), 200), '');
$$;

-- only these property keys are kept; values are short strings, numbers or booleans
create or replace function public._clean_props(p jsonb) returns jsonb
language plpgsql immutable as $$
declare out jsonb := '{}'::jsonb; k text; v jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return null; end if;
  for k, v in select * from jsonb_each(p) loop
    if k = any(array['filter_type','value','status','kind','moved_from','reason','via','channel','position','count','tab','has_booking','result_count'])
       and jsonb_typeof(v) in ('string','number','boolean') then
      out := out || jsonb_build_object(k, case when jsonb_typeof(v) = 'string' then to_jsonb(left(v #>> '{}', 100)) else v end);
    end if;
  end loop;
  return nullif(out, '{}'::jsonb);
end $$;

-- context the app sends with a plan change (session, placement, ...); kept for the length of the transaction
create or replace function public._analytics_ctx() returns jsonb
language plpgsql stable as $$
declare t text := current_setting('wf.ctx', true);
begin
  if t is null or t = '' then return '{}'::jsonb; end if;
  return t::jsonb;
exception when others then return '{}'::jsonb;
end $$;

create or replace function public._analytics_set_ctx(p_ctx jsonb) returns void
language plpgsql as $$
begin
  perform set_config('wf.ctx', case when p_ctx is null or jsonb_typeof(p_ctx) <> 'object' then '' else left(p_ctx::text, 2000) end, true);
end $$;

-- write one server-confirmed record (called from the triggers)
create or replace function public._log_server(p_name text, p_group uuid, p_item text, p_occ text, p_props jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare c jsonb := _analytics_ctx(); me uuid := auth.uid(); env text;
begin
  if coalesce(current_setting('wf.silent', true), '') = '1' then return; end if;   -- account deletion clean-up isn't activity
  env := coalesce(nullif(c->>'environment', ''), 'production');
  if env not in ('production','development','test') then env := 'production'; end if;
  insert into analytics_events(record_id, event_name, received_at, client_ts, user_id, session_id, group_id, item_id, occurrence_id,
    placement, category, region, platform, app_version, environment, is_internal, evidence, props)
  values (gen_random_uuid(), p_name, now(),
    case when c->>'client_ts' ~ '^\d{4}-\d\d-\d\dT' then least((c->>'client_ts')::timestamptz, now() + interval '1 day') end,
    me,
    case when c->>'session_id' ~ '^[A-Za-z0-9_-]{6,40}$' then c->>'session_id' end,
    p_group, left(p_item, 100), left(p_occ, 120),
    case when c->>'placement' ~ '^[a-z0-9_]{1,40}$' then c->>'placement' end,
    case when c->>'category' ~ '^[a-z]{1,20}$' then c->>'category' end,
    case when c->>'region' ~ '^[a-z_]{1,20}$' then c->>'region' end,
    case when c->>'platform' in ('web','ios') then c->>'platform' end,
    case when c->>'app_version' ~ '^[A-Za-z0-9._+-]{1,24}$' then c->>'app_version' end,
    env, env <> 'production' or _analytics_internal(me, null), 'server_confirmed', _clean_props(p_props));
end $$;

-- ---------- triggers: group plan changes ----------
create or replace function public._trg_picks() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform _log_server('event_starred', new.group_id, new.item_id, null, null);
  elsif tg_op = 'DELETE' then
    if exists (select 1 from groups where id = old.group_id) then   -- not when the whole group is being removed
      perform _log_server('event_unstarred', old.group_id, old.item_id, null, null);
    end if;
  end if;
  return null;
end $$;
drop trigger if exists analytics_picks on public.group_picks;
create trigger analytics_picks after insert or delete on public.group_picks for each row execute function public._trg_picks();

create or replace function public._trg_locks() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform _log_server('event_locked_in', new.group_id, new.item_id, new.item_id || '@' || new.day, null);
  elsif tg_op = 'DELETE' then
    if exists (select 1 from groups where id = old.group_id) then
      perform _log_server('event_unlocked', old.group_id, old.item_id, old.item_id || '@' || old.day, null);
    end if;
  else
    if new.day is distinct from old.day then
      perform _log_server('event_lock_moved', new.group_id, new.item_id, new.item_id || '@' || new.day, jsonb_build_object('moved_from', old.day::text));
    end if;
    if (new.meet_time is distinct from old.meet_time) or (new.meet_place is distinct from old.meet_place) then
      perform _log_server(case when new.meet_time is null and new.meet_place is null then 'meetup_cleared' else 'meetup_set' end,
        new.group_id, new.item_id, new.item_id || '@' || new.day, null);   -- the place text itself is never recorded
    end if;
  end if;
  return null;
end $$;
drop trigger if exists analytics_locks on public.group_locks;
create trigger analytics_locks after insert or update or delete on public.group_locks for each row execute function public._trg_locks();

create or replace function public._trg_rsvps() returns trigger
language plpgsql security definer set search_path = public as $$
declare d date;
begin
  if tg_op = 'DELETE' then
    -- only when people clear their own answer (not when an unlock clears everyone's)
    if old.user_id = auth.uid() and coalesce(current_setting('wf.locking', true), '') <> '1'
       and exists (select 1 from group_locks where group_id = old.group_id and item_id = old.item_id) then
      perform _log_server('rsvp_cleared', old.group_id, old.item_id, null, null);
    end if;
    return null;
  end if;
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then return null; end if;
  if new.user_id is distinct from auth.uid() then return null; end if;
  -- the automatic "going" when you lock a plan in is part of locking it, not a separate answer
  if tg_op = 'INSERT' and coalesce(current_setting('wf.locking', true), '') = '1' then return null; end if;
  select day into d from group_locks where group_id = new.group_id and item_id = new.item_id;
  perform _log_server('rsvp_set', new.group_id, new.item_id, case when d is not null then new.item_id || '@' || d end, jsonb_build_object('status', new.status));
  return null;
end $$;
drop trigger if exists analytics_rsvps on public.group_rsvps;
create trigger analytics_rsvps after insert or update or delete on public.group_rsvps for each row execute function public._trg_rsvps();

create or replace function public._trg_members() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.role = 'owner' then
      perform _log_server('group_created', new.group_id, null, null, null);
    else
      perform _log_server('group_joined', new.group_id, null, null, jsonb_build_object('via', coalesce(_analytics_ctx()->>'via', 'code')));
    end if;
  elsif tg_op = 'DELETE' and old.user_id = auth.uid() then
    perform _log_server('group_left', case when exists (select 1 from groups where id = old.group_id) then old.group_id end, null, null, null);
  end if;
  return null;
end $$;
drop trigger if exists analytics_members on public.group_members;
create trigger analytics_members after insert or delete on public.group_members for each row execute function public._trg_members();

-- ---------- plan RPCs: same behavior as before, plus an optional context argument ----------
-- (dropped and recreated so the app can call them with or without p_ctx_json; older app versions keep working)
drop function if exists public.add_group_pick(uuid, text, jsonb);
drop function if exists public.add_group_pick(uuid, text, jsonb, jsonb);
create function public.add_group_pick(p_group uuid, p_item text, p_item_json jsonb, p_ctx_json jsonb default null) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := _me();
begin
  perform _analytics_set_ctx(p_ctx_json);
  perform _require_member(p_group);
  if (select count(*) from group_picks where group_id = p_group) >= 1000 then raise exception 'plan is full'; end if;
  insert into group_picks(group_id, item_id, who, user_id, item) values (p_group, p_item, me::text, me, p_item_json)
  on conflict (group_id, item_id, who) do update set item = excluded.item;
end $$;

drop function if exists public.remove_group_pick(uuid, text);
drop function if exists public.remove_group_pick(uuid, text, jsonb);
create function public.remove_group_pick(p_group uuid, p_item text, p_ctx_json jsonb default null) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := _me();
begin
  perform _analytics_set_ctx(p_ctx_json);
  perform _require_member(p_group);
  delete from group_picks where group_id = p_group and item_id = p_item and who = me::text;
  -- the last star on an item clears its locked-in day (same rule as before)
  if not exists (select 1 from group_picks where group_id = p_group and item_id = p_item) then
    delete from group_locks where group_id = p_group and item_id = p_item;
  end if;
end $$;

drop function if exists public.set_group_lock(uuid, text, date, jsonb);
drop function if exists public.set_group_lock(uuid, text, date, jsonb, jsonb);
create function public.set_group_lock(p_group uuid, p_item text, p_day date, p_item_json jsonb, p_ctx_json jsonb default null) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := _me();
begin
  perform _analytics_set_ctx(p_ctx_json);
  perform _require_member(p_group);
  if p_day is null then
    delete from group_locks where group_id = p_group and item_id = p_item;
  else
    perform set_config('wf.locking', '1', true);   -- answers reset or added by locking aren't separate RSVP records
    insert into group_locks(group_id, item_id, day, locked_by, item) values (p_group, p_item, p_day, me, p_item_json)
    on conflict (group_id, item_id) do update set day = excluded.day, locked_by = excluded.locked_by, item = coalesce(excluded.item, group_locks.item);
    insert into group_rsvps(group_id, item_id, user_id, status) values (p_group, p_item, me, 'going')
    on conflict do nothing;
    perform set_config('wf.locking', '', true);
  end if;
end $$;

drop function if exists public.set_rsvp(uuid, text, text);
drop function if exists public.set_rsvp(uuid, text, text, jsonb);
create function public.set_rsvp(p_group uuid, p_item text, p_status text, p_ctx_json jsonb default null) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := _me();
begin
  perform _analytics_set_ctx(p_ctx_json);
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

drop function if exists public.set_meetup(uuid, text, text, text);
drop function if exists public.set_meetup(uuid, text, text, text, jsonb);
create function public.set_meetup(p_group uuid, p_item text, p_time text, p_place text, p_ctx_json jsonb default null) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := _me(); t text := nullif(trim(coalesce(p_time, '')), ''); pl text := nullif(left(regexp_replace(trim(coalesce(p_place, '')), '\s+', ' ', 'g'), 120), '');
begin
  perform _analytics_set_ctx(p_ctx_json);
  perform _require_member(p_group);
  if t is not null and t !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then raise exception 'meet-up time should look like 10:30'; end if;
  update group_locks set meet_time = t, meet_place = pl, meet_by = case when t is null and pl is null then null else me end
  where group_id = p_group and item_id = p_item;
  if not found then raise exception 'that plan is not locked in'; end if;
end $$;

drop function if exists public.create_group(text);
drop function if exists public.create_group(text, jsonb);
create function public.create_group(p_name text, p_ctx_json jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me(); n text := _clean_name(p_name, 40); g groups;
begin
  perform _analytics_set_ctx(p_ctx_json);
  if n is null then raise exception 'group name required'; end if;
  if (select count(*) from group_members where user_id = me) >= 20 then raise exception 'too many groups'; end if;
  insert into groups(name, join_code, created_by) values (n, _new_code(), me) returning * into g;
  insert into group_members(group_id, user_id, role) values (g.id, me, 'owner');
  return jsonb_build_object('id', g.id, 'name', g.name, 'code', g.join_code);
end $$;

drop function if exists public.join_group(text);
drop function if exists public.join_group(text, jsonb);
create function public.join_group(p_code text, p_ctx_json jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me(); c text := upper(regexp_replace(coalesce(p_code,''), '[^A-Za-z0-9]', '', 'g')); g groups;
begin
  perform _analytics_set_ctx(p_ctx_json);
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

drop function if exists public.leave_group(uuid);
drop function if exists public.leave_group(uuid, jsonb);
create function public.leave_group(p_group uuid, p_ctx_json jsonb default null) returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := _me(); was_owner boolean;
begin
  if p_ctx_json is not null then perform _analytics_set_ctx(p_ctx_json); end if;
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

-- account deletion: same as before, but the clean-up it causes isn't recorded as activity
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare me uuid := _me(); r record;
begin
  perform set_config('wf.silent', '1', true);
  for r in select group_id from group_members where user_id = me loop
    perform leave_group(r.group_id);       -- hands over ownership or removes empty groups
  end loop;
  delete from join_attempts where user_id = me;
  delete from auth.users where id = me;  -- cascades to profiles, stars; usage records lose their user link
end $$;

-- moving an old shared list into a group copies its stars and days: recorded as one group_created / group_joined, not as new stars
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
    perform set_config('wf.silent', '1', true);
    insert into group_picks(group_id, item_id, who, item, created_at)
      select g.id, item_id, 'legacy:' || _clean_name(who, 30), item, created_at from picks
      where list_code = p_list and who not like '\_\_lock\_\_%' and _clean_name(who, 30) is not null
      on conflict do nothing;
    insert into group_locks(group_id, item_id, day, item, created_at)
      select distinct on (item_id) g.id, item_id, substr(who, 9)::date, item, created_at from picks
      where list_code = p_list and who ~ '^__lock__\d{4}-\d{2}-\d{2}$'
      order by item_id, created_at desc
      on conflict do nothing;
    perform set_config('wf.silent', '', true);
  else
    insert into group_members(group_id, user_id) values (g.id, me) on conflict do nothing;
  end if;
  if oldname is not null then   -- claim this person's old stars
    perform set_config('wf.silent', '1', true);
    insert into group_picks(group_id, item_id, who, user_id, item, created_at)
      select group_id, item_id, me::text, me, item, created_at from group_picks
      where group_id = g.id and who = 'legacy:' || oldname
      on conflict do nothing;
    delete from group_picks where group_id = g.id and who = 'legacy:' || oldname;
    perform set_config('wf.silent', '', true);
  end if;
  return jsonb_build_object('id', g.id, 'name', g.name, 'code', g.join_code);
end $$;

-- ---------- client records ----------
create or replace function public.log_client_event(p_event_json jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e jsonb := p_event_json; me uuid := auth.uid(); nm text; anon text; ident text; rid uuid; env text; grp uuid; inserted int;
  client_names text[] := array['page_view','app_open','event_detail_viewed','filter_applied','results_empty','map_event_opened',
    'event_starred','event_unstarred','event_locked_in','event_lock_moved','event_unlocked',
    'invite_share_opened','invite_shared','invite_link_copied','calendar_added',
    'outbound_booking_clicked','outbound_info_clicked','directions_clicked',
    'sign_in','sign_out','all_plans_viewed','reminder_tapped','app_store_clicked'];
begin
  if e is null or jsonb_typeof(e) <> 'object' or octet_length(e::text) > 4096 then return _analytics_reject('bad_payload'); end if;
  nm := e->>'event_name';
  if nm is null or not (nm = any(client_names)) then return _analytics_reject('unknown_event'); end if;
  begin rid := (e->>'record_id')::uuid; exception when others then rid := null; end;
  if rid is null then return _analytics_reject('no_record_id'); end if;
  -- the device code is only kept for signed-out activity
  anon := case when me is null and e->>'anon_id' ~ '^[A-Za-z0-9_-]{6,40}$' then e->>'anon_id' end;
  ident := coalesce(me::text, anon);
  if ident is null then return _analytics_reject('no_identity'); end if;
  -- star / lock records from the app are only for plans kept on the device; group plans are recorded by the server
  if nm in ('event_starred','event_unstarred','event_locked_in','event_lock_moved','event_unlocked') and coalesce(e->>'group_id', '') <> '' then
    return _analytics_reject('server_confirmed_only');
  end if;
  -- rate limits per identity
  if (select count(*) from analytics_events where (me is not null and user_id = me or me is null and anon_id = anon)
        and received_at > now() - interval '1 minute') >= 120
     or (select count(*) from analytics_events where (me is not null and user_id = me or me is null and anon_id = anon)
        and received_at > now() - interval '1 day') >= 3000 then
    return _analytics_reject('rate_limited');
  end if;
  begin grp := (e->>'group_id')::uuid; exception when others then grp := null; end;
  if grp is not null and (me is null or not exists (select 1 from group_members where group_id = grp and user_id = me)) then grp := null; end if;
  env := coalesce(e->>'environment', 'production');
  if env not in ('production','development','test') then env := 'production'; end if;
  insert into analytics_events(record_id, event_name, client_ts, anon_id, user_id, session_id, group_id, item_id, occurrence_id,
    placement, category, region, platform, app_version, environment, is_internal, evidence,
    source, medium, campaign, landing_path, outbound_id, dest_host, props)
  values (rid, nm,
    case when e->>'client_ts' ~ '^\d{4}-\d\d-\d\dT' then least((e->>'client_ts')::timestamptz, now() + interval '1 day') end,
    anon, me,
    case when e->>'session_id' ~ '^[A-Za-z0-9_-]{6,40}$' then e->>'session_id' end,
    grp, left(e->>'item_id', 100), left(e->>'occurrence_id', 120),
    case when e->>'placement' ~ '^[a-z0-9_]{1,40}$' then e->>'placement' end,
    case when e->>'category' ~ '^[a-z]{1,20}$' then e->>'category' end,
    case when e->>'region' ~ '^[a-z_]{1,20}$' then e->>'region' end,
    case when e->>'platform' in ('web','ios') then e->>'platform' end,
    case when e->>'app_version' ~ '^[A-Za-z0-9._+-]{1,24}$' then e->>'app_version' end,
    env, env <> 'production' or _analytics_internal(me, anon), 'client_observed',
    _clean_token(e->>'source', 60), _clean_token(e->>'medium', 60), _clean_token(e->>'campaign', 100), _clean_path(e->>'landing_path'),
    case when e->>'outbound_id' ~ '^[0-9a-f-]{36}$' then (e->>'outbound_id')::uuid end,
    case when lower(e->>'dest_host') ~ '^[a-z0-9.-]{1,100}$' then lower(e->>'dest_host') end,
    _clean_props(e->'props'))
  on conflict (record_id) do nothing;
  get diagnostics inserted = row_count;
  return jsonb_build_object('ok', true, 'duplicate', inserted = 0);
exception when others then
  return _analytics_reject('invalid');
end $$;

-- ---------- reporting (owner only) ----------
create or replace function public.analytics_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from analytics_admins where user_id = auth.uid());
$$;

create or replace function public._require_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not analytics_is_admin() then raise exception 'not authorized'; end if;
end $$;

-- the records every KPI is computed from: production, not internal (re-checked against the current internal list)
drop view if exists public.analytics_kpi;
create or replace view public.analytics_kpi with (security_invoker = true) as
select e.*,
  case when e.user_id is not null then 'u:' || e.user_id::text when e.anon_id is not null then 'a:' || e.anon_id end as identity,
  case when e.user_id is not null then 'account' when e.anon_id is not null then 'anonymous' end as identity_type,
  (date_trunc('week', e.received_at at time zone 'America/Los_Angeles'))::date as week,
  (e.event_name in ('event_starred','event_locked_in','calendar_added','outbound_booking_clicked')
    or (e.evidence = 'server_confirmed' and e.event_name in ('event_lock_moved','rsvp_set','meetup_set'))) as meaningful,
  (e.evidence = 'server_confirmed' and e.event_name in ('event_starred','event_unstarred','event_locked_in','event_lock_moved',
    'event_unlocked','rsvp_set','rsvp_cleared','meetup_set','meetup_cleared')) as plan_change
from public.analytics_events e
where e.environment = 'production' and not e.is_internal
  and not exists (select 1 from public.analytics_internal i where (e.user_id is not null and i.user_id = e.user_id) or (e.anon_id is not null and i.anon_id = e.anon_id));
revoke all on public.analytics_kpi from anon, authenticated;

create or replace function public._la_week(t timestamptz) returns date
language sql immutable as $$ select (date_trunc('week', t at time zone 'America/Los_Angeles'))::date $$;

-- Everything the dashboard shows, in one call. p_weeks: how many reporting weeks (Mon–Sun, Los Angeles time) back from this one.
create or replace function public.admin_report(p_weeks int default 8) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  this_week date := _la_week(now());
  w0 date := _la_week(now()) - 7 * (greatest(1, least(coalesce(p_weeks, 8), 52)) - 1);
  out jsonb;
begin
  perform _require_admin();
  with k as (select * from analytics_kpi),
  firsts as (
    select identity, identity_type,
      min(received_at) as first_seen,
      (array_agg(session_id order by received_at))[1] as first_session,
      min(received_at) filter (where meaningful) as first_meaningful,
      (array_agg(session_id order by received_at) filter (where meaningful))[1] as fm_session
    from k where identity is not null group by 1, 2),
  wk as (select generate_series(w0, this_week, interval '7 days')::date as week),
  weekly as (
    select w.week,
      (select count(distinct anon_id) from k where k.week = w.week and k.user_id is null) as visitors,
      (select count(distinct user_id) from k where k.week = w.week) as accounts,
      (select count(*) from firsts f where _la_week(f.first_seen) = w.week and f.identity_type = 'anonymous') as new_visitors,
      (select count(*) from firsts f where _la_week(f.first_seen) = w.week and f.identity_type = 'account') as new_accounts,
      (select count(distinct anon_id) from k where k.week = w.week and k.user_id is null and k.meaningful) as wmu_anonymous,
      (select count(distinct user_id) from k where k.week = w.week and k.meaningful) as wmu_accounts,
      (select count(distinct group_id) from k where k.week = w.week and k.plan_change and k.group_id is not null) as active_groups,
      (select count(*) from (select group_id from k where k.week = w.week and k.plan_change and k.group_id is not null and k.user_id is not null
          group by group_id having count(distinct user_id) >= 2) c) as collaborative_groups,
      (select count(distinct session_id) from k where k.week = w.week and k.platform = 'web') as web_sessions,
      (select count(distinct session_id) from k where k.week = w.week and k.platform = 'ios') as ios_sessions,
      (select jsonb_object_agg(event_name, jsonb_build_object('records', n, 'identities', ids)) from (
          select event_name, count(*) n, count(distinct identity) ids from k where k.week = w.week group by 1) a) as actions
    from wk w),
  -- activation: cohorts by week of first observation
  activation as (
    select _la_week(first_seen) as week, identity_type,
      count(*) as new_identities,
      count(*) filter (where fm_session is not null and fm_session = first_session) as same_session_activated,
      count(*) filter (where first_seen <= now() - interval '7 days') as eligible_7d,
      count(*) filter (where first_seen <= now() - interval '7 days' and first_meaningful <= first_seen + interval '7 days') as activated_7d
    from firsts where first_seen >= w0 group by 1, 2),
  -- retention: cohorts by week of first meaningful action; week k counts only once it has fully ended
  cohorts as (select identity, identity_type, _la_week(first_meaningful) as cw from firsts where first_meaningful is not null),
  retention as (
    select c.cw as cohort_week, c.identity_type, count(*) as cohort_size,
      case when c.cw + 7 < this_week then count(*) filter (where exists (select 1 from k where k.identity = c.identity and k.meaningful and k.week = c.cw + 7)) end as week1,
      case when c.cw + 14 < this_week then count(*) filter (where exists (select 1 from k where k.identity = c.identity and k.meaningful and k.week = c.cw + 14)) end as week2,
      case when c.cw + 28 < this_week then count(*) filter (where exists (select 1 from k where k.identity = c.identity and k.meaningful and k.week = c.cw + 28)) end as week4
    from cohorts c where c.cw >= w0 group by 1, 2),
  top_items as (
    select item_id, max(category) as category, max(region) as region,
      count(*) filter (where event_name = 'event_detail_viewed') as detail_views,
      count(*) filter (where event_name = 'map_event_opened') as map_opens,
      count(*) filter (where event_name = 'event_starred') as stars,
      count(*) filter (where event_name = 'event_locked_in') as locks,
      count(*) filter (where event_name = 'outbound_booking_clicked') as booking_clicks,
      count(*) filter (where event_name = 'outbound_info_clicked') as info_clicks,
      count(distinct identity) as identities
    from k where week >= w0 and item_id is not null group by 1
    order by booking_clicks desc, stars desc, identities desc limit 30),
  by_category as (
    select coalesce(category, 'unknown') as category,
      count(*) filter (where event_name in ('event_detail_viewed','map_event_opened')) as views,
      count(*) filter (where event_name = 'event_starred') as stars,
      count(*) filter (where event_name = 'event_locked_in') as locks,
      count(*) filter (where event_name = 'outbound_booking_clicked') as booking_clicks
    from k where week >= w0 and item_id is not null group by 1),
  by_region as (
    select coalesce(region, 'unknown') as region,
      count(*) filter (where event_name in ('event_detail_viewed','map_event_opened')) as views,
      count(*) filter (where event_name = 'event_starred') as stars,
      count(*) filter (where event_name = 'event_locked_in') as locks,
      count(*) filter (where event_name = 'outbound_booking_clicked') as booking_clicks
    from k where week >= w0 and item_id is not null group by 1),
  -- funnel: identities first seen in the window at least 7 days ago; each step within 7 days of first seen; no step required
  funnel as (
    select f.identity_type, count(*) as eligible,
      count(*) filter (where exists (select 1 from k where k.identity = f.identity and k.event_name in ('event_detail_viewed','map_event_opened','outbound_info_clicked') and k.received_at <= f.first_seen + interval '7 days')) as looked_at_event,
      count(*) filter (where f.first_meaningful <= f.first_seen + interval '7 days') as meaningful_action,
      count(*) filter (where exists (select 1 from k where k.identity = f.identity and k.event_name = 'outbound_booking_clicked' and k.received_at <= f.first_seen + interval '7 days')) as booking_click
    from firsts f where f.first_seen >= w0 and f.first_seen <= now() - interval '7 days' group by 1),
  acq as (
    select identity_type, case when src = 'direct' then 'direct/unknown' else src end as source, count(*) as identities from (
      select f.identity, f.identity_type,
        coalesce((select k.source from k where k.identity = f.identity and k.source is not null order by k.received_at limit 1), 'direct/unknown') as src
      from firsts f where f.first_seen >= w0) x group by 1, 2),
  plat as (select coalesce(platform, 'unknown') as platform, count(distinct identity) as identities, count(*) as records from k where week >= w0 group by 1)
  select jsonb_build_object(
    'generated_at', now(),
    'timezone', 'America/Los_Angeles',
    'week_definition', 'Monday 00:00 to Sunday 23:59:59, America/Los_Angeles; stored times are UTC',
    'from_week', w0, 'this_week', this_week,
    'instrumentation_start', (select value from analytics_meta where key = 'instrumentation_start'),
    'retention_months', (select value from analytics_meta where key = 'retention_months'),
    'weekly', (select coalesce(jsonb_agg(to_jsonb(x) order by x.week), '[]') from weekly x),
    'activation', (select coalesce(jsonb_agg(to_jsonb(x) order by x.week, x.identity_type), '[]') from activation x),
    'retention', (select coalesce(jsonb_agg(to_jsonb(x) order by x.cohort_week, x.identity_type), '[]') from retention x),
    'top_items', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from top_items x),
    'by_category', (select coalesce(jsonb_agg(to_jsonb(x) order by x.stars desc), '[]') from by_category x),
    'by_region', (select coalesce(jsonb_agg(to_jsonb(x) order by x.stars desc), '[]') from by_region x),
    'funnel', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from funnel x),
    'acquisition', (select coalesce(jsonb_agg(to_jsonb(x) order by x.identities desc), '[]') from acq x),
    'platforms', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from plat x),
    'health', jsonb_build_object(
      'by_day', (select coalesce(jsonb_agg(to_jsonb(d) order by d.day desc), '[]') from (
          select (received_at at time zone 'America/Los_Angeles')::date as day, coalesce(platform, 'unknown') as platform, evidence, environment, is_internal, count(*) as records
          from analytics_events where received_at > now() - interval '14 days' group by 1, 2, 3, 4, 5) d),
      'rejects', (select coalesce(jsonb_agg(to_jsonb(r) order by r.day desc), '[]') from analytics_rejects r where r.day > (now() - interval '14 days')::date),
      'app_versions', (select coalesce(jsonb_agg(to_jsonb(v)), '[]') from (
          select coalesce(platform, 'unknown') as platform, coalesce(app_version, 'unknown') as app_version, count(*) as records
          from analytics_events where received_at > now() - interval '14 days' group by 1, 2 order by 3 desc) v),
      'excluded_last_14_days', (select count(*) from analytics_events e where received_at > now() - interval '14 days'
          and not exists (select 1 from analytics_kpi k where k.record_id = e.record_id)),
      'internal_entries', (select count(*) from analytics_internal))
  ) into out;
  return out;
end $$;

-- raw records for CSV export (admin only). p_include_excluded adds development/internal records, marked as such.
create or replace function public.admin_export(p_from date, p_to date, p_include_excluded boolean default false) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare out jsonb;
begin
  perform _require_admin();
  select coalesce(jsonb_agg(to_jsonb(x) order by x.received_at), '[]') into out from (
    select e.record_id, e.event_name, e.schema_version, e.received_at, e.client_ts,
      case when e.user_id is not null then 'u:' || e.user_id::text when e.anon_id is not null then 'a:' || e.anon_id end as identity,
      e.session_id, e.group_id, e.item_id, e.occurrence_id, e.placement, e.category, e.region, e.platform, e.app_version,
      e.environment, e.is_internal, (k.record_id is null) as excluded_from_kpis, e.evidence,
      e.source, e.medium, e.campaign, e.landing_path, e.outbound_id, e.dest_host, e.props
    from analytics_events e left join analytics_kpi k on k.record_id = e.record_id
    where e.received_at >= p_from::timestamp at time zone 'America/Los_Angeles'
      and e.received_at < (p_to + 1)::timestamp at time zone 'America/Los_Angeles'
      and (p_include_excluded or k.record_id is not null)
    order by e.received_at limit 100000) x;
  return out;
end $$;

-- mark a device (its code) or an account as internal; admins only. Excludes it from every KPI, including past weeks.
create or replace function public.admin_mark_internal(p_anon text default null, p_user uuid default null, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _require_admin();
  if p_anon is not null and p_anon ~ '^[A-Za-z0-9_-]{6,40}$' then
    insert into analytics_internal(anon_id, note) values (p_anon, left(p_note, 80)) on conflict do nothing;
    update analytics_events set is_internal = true where anon_id = p_anon;
  end if;
  if p_user is not null then
    insert into analytics_internal(user_id, note) values (p_user, left(p_note, 80)) on conflict do nothing;
    update analytics_events set is_internal = true where user_id = p_user;
  end if;
end $$;

-- privacy request: delete everything recorded for a signed-out device code
create or replace function public.admin_delete_device(p_anon text) returns integer
language plpgsql security definer set search_path = public as $$
declare n int; m int;
begin
  perform _require_admin();
  delete from analytics_events where anon_id = p_anon; get diagnostics n = row_count;
  delete from usage_events where anon_id = p_anon; get diagnostics m = row_count;
  return n + m;
end $$;

-- retention: fold records older than the retention period into identifier-free weekly totals, then delete them
create or replace function public._analytics_retention() returns integer
language plpgsql security definer set search_path = public as $$
declare months int := coalesce((select value::int from analytics_meta where key = 'retention_months'), 13);
        cutoff timestamptz; n int;
begin
  cutoff := (_la_week(now() - make_interval(months => months)))::timestamp at time zone 'America/Los_Angeles';   -- whole weeks only
  insert into analytics_weekly(week, event_name, platform, evidence, records, identities)
  select _la_week(received_at), event_name, coalesce(platform, ''), evidence, count(*),
         count(distinct coalesce(user_id::text, anon_id))
  from analytics_kpi where received_at < cutoff group by 1, 2, 3, 4
  on conflict (week, event_name, platform, evidence) do update
    set records = analytics_weekly.records + excluded.records, identities = greatest(analytics_weekly.identities, excluded.identities);
  delete from analytics_events where received_at < cutoff; get diagnostics n = row_count;
  delete from analytics_rejects where day < (cutoff at time zone 'America/Los_Angeles')::date;
  return n;
end $$;

-- nightly at 3:15am Los Angeles (11:15 UTC); skipped where pg_cron isn't available (tests)
do $$
begin
  perform cron.schedule('analytics-retention', '15 11 * * *', 'select public._analytics_retention()');
exception when others then null;
end $$;

-- ---------- who may call what ----------
revoke all on function public._analytics_internal(uuid,text), public._analytics_reject(text), public._clean_token(text,int),
  public._clean_path(text), public._clean_props(jsonb), public._analytics_ctx(), public._analytics_set_ctx(jsonb),
  public._log_server(text,uuid,text,text,jsonb), public._trg_picks(), public._trg_locks(), public._trg_rsvps(), public._trg_members(),
  public._require_admin(), public._la_week(timestamptz), public._analytics_retention() from public, anon, authenticated;
revoke all on function public.add_group_pick(uuid,text,jsonb,jsonb), public.remove_group_pick(uuid,text,jsonb),
  public.set_group_lock(uuid,text,date,jsonb,jsonb), public.set_rsvp(uuid,text,text,jsonb), public.set_meetup(uuid,text,text,text,jsonb),
  public.create_group(text,jsonb), public.join_group(text,jsonb), public.leave_group(uuid,jsonb),
  public.admin_report(int), public.admin_export(date,date,boolean), public.admin_mark_internal(text,uuid,text),
  public.admin_delete_device(text), public.analytics_is_admin(), public.log_client_event(jsonb) from public, anon;
grant execute on function public.add_group_pick(uuid,text,jsonb,jsonb), public.remove_group_pick(uuid,text,jsonb),
  public.set_group_lock(uuid,text,date,jsonb,jsonb), public.set_rsvp(uuid,text,text,jsonb), public.set_meetup(uuid,text,text,text,jsonb),
  public.create_group(text,jsonb), public.join_group(text,jsonb), public.leave_group(uuid,jsonb),
  public.admin_report(int), public.admin_export(date,date,boolean), public.admin_mark_internal(text,uuid,text),
  public.admin_delete_device(text), public.analytics_is_admin() to authenticated;
grant execute on function public.log_client_event(jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
