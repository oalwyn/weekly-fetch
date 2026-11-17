-- v1.5: the Android app (Nov 2026). Records from it carry platform = 'android'.
-- Apply after v1.4-city.sql (re-run this after any re-run of v1.3 or v1.4, which would put back the web/ios-only checks).
-- Order when deploying: apply this before releasing an Android build, or its records lose their platform (they are still kept).

alter table public.analytics_events drop constraint if exists analytics_events_platform_check;
alter table public.analytics_events add constraint analytics_events_platform_check check (platform is null or platform in ('web','ios','android'));

-- ---------- record writers: accept 'android' ----------
create or replace function public._log_server(p_name text, p_group uuid, p_item text, p_occ text, p_props jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare c jsonb := _analytics_ctx(); me uuid := auth.uid(); env text;
begin
  if coalesce(current_setting('wf.silent', true), '') = '1' then return; end if;   -- account deletion clean-up isn't activity
  env := coalesce(nullif(c->>'environment', ''), 'production');
  if env not in ('production','development','test') then env := 'production'; end if;
  insert into analytics_events(record_id, event_name, received_at, client_ts, user_id, session_id, group_id, item_id, occurrence_id,
    placement, category, region, city, platform, app_version, environment, is_internal, evidence, props)
  values (gen_random_uuid(), p_name, now(),
    case when c->>'client_ts' ~ '^\d{4}-\d\d-\d\dT' then least((c->>'client_ts')::timestamptz, now() + interval '1 day') end,
    me,
    case when c->>'session_id' ~ '^[A-Za-z0-9_-]{6,40}$' then c->>'session_id' end,
    p_group, left(p_item, 100), left(p_occ, 120),
    case when c->>'placement' ~ '^[a-z0-9_]{1,40}$' then c->>'placement' end,
    case when c->>'category' ~ '^[a-z]{1,20}$' then c->>'category' end,
    case when c->>'region' ~ '^[a-z_]{1,20}$' then c->>'region' end,
    _city_of(c->>'city', p_item, c->>'platform'),
    case when c->>'platform' in ('web','ios','android') then c->>'platform' end,
    case when c->>'app_version' ~ '^[A-Za-z0-9._+-]{1,24}$' then c->>'app_version' end,
    env, env <> 'production' or _analytics_internal(me, null), 'server_confirmed', _clean_props(p_props));
end $$;

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
    placement, category, region, city, platform, app_version, environment, is_internal, evidence,
    source, medium, campaign, landing_path, outbound_id, dest_host, props)
  values (rid, nm,
    case when e->>'client_ts' ~ '^\d{4}-\d\d-\d\dT' then least((e->>'client_ts')::timestamptz, now() + interval '1 day') end,
    anon, me,
    case when e->>'session_id' ~ '^[A-Za-z0-9_-]{6,40}$' then e->>'session_id' end,
    grp, left(e->>'item_id', 100), left(e->>'occurrence_id', 120),
    case when e->>'placement' ~ '^[a-z0-9_]{1,40}$' then e->>'placement' end,
    case when e->>'category' ~ '^[a-z]{1,20}$' then e->>'category' end,
    case when e->>'region' ~ '^[a-z_]{1,20}$' then e->>'region' end,
    _city_of(e->>'city', e->>'item_id', e->>'platform'),
    case when e->>'platform' in ('web','ios','android') then e->>'platform' end,
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

-- ---------- report: Android sessions per week ----------
create or replace function public.admin_report(p_weeks int default 8, p_city text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  this_week date := _la_week(now());
  w0 date := _la_week(now()) - 7 * (greatest(1, least(coalesce(p_weeks, 8), 52)) - 1);
  out jsonb;
begin
  perform _require_admin();
  with k as (select * from analytics_kpi where p_city is null or city = p_city),
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
      (select count(distinct session_id) from k where k.week = w.week and k.platform = 'android') as android_sessions,
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
  plat as (select coalesce(platform, 'unknown') as platform, count(distinct identity) as identities, count(*) as records from k where week >= w0 group by 1),
  -- every city side by side (not narrowed by p_city)
  by_city as (
    select coalesce(c.city, 'unknown') as city,
      count(distinct c.identity) as identities,
      count(distinct c.identity) filter (where c.meaningful) as meaningful_identities,
      count(distinct c.group_id) filter (where c.plan_change and c.group_id is not null) as active_groups,
      count(*) filter (where c.event_name in ('event_detail_viewed','map_event_opened')) as views,
      count(*) filter (where c.event_name = 'event_starred') as stars,
      count(*) filter (where c.event_name = 'event_locked_in') as locks,
      count(*) filter (where c.event_name = 'outbound_booking_clicked') as booking_clicks
    from analytics_kpi c where c.week >= w0 group by 1)
  select jsonb_build_object(
    'generated_at', now(),
    'timezone', 'America/Los_Angeles',
    'week_definition', 'Monday 00:00 to Sunday 23:59:59, America/Los_Angeles; stored times are UTC',
    'from_week', w0, 'this_week', this_week,
    'city', p_city,
    'by_city', (select coalesce(jsonb_agg(to_jsonb(x) order by x.identities desc), '[]') from by_city x),
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
