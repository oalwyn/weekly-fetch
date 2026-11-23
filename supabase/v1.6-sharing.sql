-- v1.6: sharing (Nov 2026). "Invite someone" (a public event link) and "Share our weekend" (a photo card made on the phone).
-- Apply after v1.5-android.sql (re-run this after any re-run of v1.3/v1.4/v1.5, which would put back the shorter event lists).
-- Order when deploying: apply this before publishing site code that sends these records (unknown names are rejected, nothing breaks).
-- What is recorded: share_opened (kind invite|memory), share_card_made (template a|b), share_destination_opened (channel:
-- share_sheet|web_share|copy_link|save_image|share_image; "opened", never "posted"), share_link_landed (someone opened a shared
-- event link; props: found, past, new_visitor). The share code (8 random letters, not tied to a person) is the campaign on the
-- landing and props.code on the share, so a landing can be matched to the share that made it. No photo content is ever sent.

-- props: also keep the sharing fields (the share code is 8 random letters, not tied to a person)
create or replace function public._clean_props(p jsonb) returns jsonb
language plpgsql immutable as $$
declare out jsonb := '{}'::jsonb; k text; v jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return null; end if;
  for k, v in select * from jsonb_each(p) loop
    if k = any(array['filter_type','value','status','kind','moved_from','reason','via','channel','position','count','tab','has_booking','result_count',
                     'found','past','new_visitor','template','code'])
       and jsonb_typeof(v) in ('string','number','boolean') then
      out := out || jsonb_build_object(k, case when jsonb_typeof(v) = 'string' then to_jsonb(left(v #>> '{}', 100)) else v end);
    end if;
  end loop;
  return nullif(out, '{}'::jsonb);
end $$;

alter table public.analytics_events drop constraint if exists analytics_events_name_check;
alter table public.analytics_events add constraint analytics_events_name_check check (event_name in (
  'page_view','app_open','event_detail_viewed','filter_applied','results_empty','map_event_opened',
  'event_starred','event_unstarred','event_locked_in','event_lock_moved','event_unlocked',
  'rsvp_set','rsvp_cleared','meetup_set','meetup_cleared','group_created','group_joined','group_left',
  'invite_share_opened','invite_shared','invite_link_copied','calendar_added',
  'outbound_booking_clicked','outbound_info_clicked','directions_clicked',
  'sign_in','sign_out','all_plans_viewed','reminder_tapped','app_store_clicked',
  'share_opened','share_card_made','share_destination_opened','share_link_landed'));

create or replace function public.log_client_event(p_event_json jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e jsonb := p_event_json; me uuid := auth.uid(); nm text; anon text; ident text; rid uuid; env text; grp uuid; inserted int;
  client_names text[] := array['page_view','app_open','event_detail_viewed','filter_applied','results_empty','map_event_opened',
    'event_starred','event_unstarred','event_locked_in','event_lock_moved','event_unlocked',
    'invite_share_opened','invite_shared','invite_link_copied','calendar_added',
    'outbound_booking_clicked','outbound_info_clicked','directions_clicked',
    'sign_in','sign_out','all_plans_viewed','reminder_tapped','app_store_clicked',
    'share_opened','share_card_made','share_destination_opened','share_link_landed'];
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

-- ---------- report: does sharing bring new people who then do something? ----------
create or replace function public.admin_sharing_report(p_weeks int default 8, p_city text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  this_week date := _la_week(now());
  w0 date := _la_week(now()) - 7 * (greatest(1, least(coalesce(p_weeks, 8), 52)) - 1);
  out jsonb;
begin
  perform _require_admin();
  with k as (select * from analytics_kpi where (p_city is null or city = p_city)),
  wk as (select generate_series(w0, this_week, interval '7 days')::date as week),
  shares as (select week, props->>'kind' as kind, event_name, props->>'channel' as channel from k
             where event_name in ('share_opened','share_card_made','share_destination_opened') and week >= w0),
  landings as (select identity, received_at, week, coalesce((props->>'new_visitor')::boolean, false) as new_visitor,
                      coalesce((props->>'past')::boolean, false) as past
               from k where event_name = 'share_link_landed' and week >= w0),
  landed as (select l.*,
               exists (select 1 from k m where m.identity = l.identity and m.meaningful
                       and m.received_at between l.received_at and l.received_at + interval '7 days') as acted,
               exists (select 1 from k m where m.identity = l.identity and m.event_name in ('outbound_info_clicked','outbound_booking_clicked','event_starred','group_joined')
                       and m.received_at between l.received_at and l.received_at + interval '7 days') as engaged,
               exists (select 1 from k m where m.identity = l.identity and m.event_name = 'app_store_clicked'
                       and m.received_at between l.received_at and l.received_at + interval '7 days') as store_click
             from landings l)
  select jsonb_build_object(
    'generated_at', now(), 'city', p_city,
    'definitions', jsonb_build_object(
      'invites_opened', 'Times someone tapped Invite someone',
      'memories_opened', 'Times someone started a Share our weekend card',
      'cards_made', 'Memory cards rendered for sharing or saving',
      'destinations_opened', 'Share sheets opened, links copied or images saved (opened, not confirmed posted)',
      'landings', 'Shared event links opened',
      'new_visitor_landings', 'Shared links opened on a device that had never visited before',
      'acted_7d', 'Landings followed within 7 days by a meaningful action (star, lock in, calendar, booking click, group plan)',
      'engaged_7d', 'Landings followed within 7 days by a star, More info or booking click, or joining a group',
      'store_clicks_7d', 'Landings followed within 7 days by an app store link click (a click, not an install)'),
    'weeks', (select coalesce(jsonb_agg(jsonb_build_object(
        'week', wk.week,
        'invites_opened', (select count(*) from shares s where s.week = wk.week and s.event_name = 'share_opened' and s.kind = 'invite'),
        'memories_opened', (select count(*) from shares s where s.week = wk.week and s.event_name = 'share_opened' and s.kind = 'memory'),
        'cards_made', (select count(*) from shares s where s.week = wk.week and s.event_name = 'share_card_made'),
        'destinations_opened', (select count(*) from shares s where s.week = wk.week and s.event_name = 'share_destination_opened'),
        'landings', (select count(*) from landed l where l.week = wk.week),
        'new_visitor_landings', (select count(*) from landed l where l.week = wk.week and l.new_visitor),
        'acted_7d', (select count(*) from landed l where l.week = wk.week and l.acted),
        'engaged_7d', (select count(*) from landed l where l.week = wk.week and l.engaged),
        'store_clicks_7d', (select count(*) from landed l where l.week = wk.week and l.store_click)
      ) order by wk.week), '[]'::jsonb) from wk),
    'channels', (select coalesce(jsonb_object_agg(coalesce(channel, 'unknown'), n), '{}'::jsonb)
                 from (select channel, count(*) n from shares where event_name = 'share_destination_opened' group by 1) c)
  ) into out;
  return out;
end $$;
revoke all on function public.admin_sharing_report(int, text) from public, anon;
grant execute on function public.admin_sharing_report(int, text) to authenticated;
