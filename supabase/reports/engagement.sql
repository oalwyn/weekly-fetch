-- Engagement report. Paste into Supabase > SQL Editor and Run (runs as the project owner; the app can't read these tables).
-- Change the 30 below to look at a different number of days. A "person" is a signed-in account, or one device when signed out.
with ev as (
  select *, coalesce(user_id::text, anon_id) as who
  from public.usage_events where at >= now() - interval '30 days'
)
select 'People who opened the site or app' as measure,                       count(distinct who)::text as value from ev where kind = 'app_open'
union all select 'People who came back on 2+ different days',               count(*)::text from (select who from ev where kind='app_open' group by who having count(distinct at::date) >= 2) r
union all select 'Visits (opens)',                                           count(*)::text from ev where kind = 'app_open'
union all select '  … on the website / in the iPhone app',                   sum((platform='web')::int)::text || ' / ' || sum((platform='ios')::int)::text from ev where kind = 'app_open'
union all select 'People who tapped "Tickets" at least once',                count(distinct who)::text from ev where kind = 'outbound_tickets'
union all select 'Ticket taps',                                              count(*)::text from ev where kind = 'outbound_tickets'
union all select 'Movie "Showtimes" taps',                                   count(*)::text from ev where kind = 'outbound_showtimes'
union all select '"More info" taps (event pages)',                           count(*)::text from ev where kind = 'outbound_more_info'
union all select '"Directions" taps',                                        count(*)::text from ev where kind = 'outbound_directions'
union all select 'People who starred something',                             count(distinct who)::text from ev where kind = 'star'
union all select 'Stars',                                                    count(*)::text from ev where kind = 'star'
union all select 'Plans locked in to a day',                                 count(*)::text from ev where kind = 'lock'
union all select 'Going / Maybe / Can''t answers',                           count(*)::text from ev where kind = 'rsvp'
union all select 'Added to calendar (app)',                                  count(*)::text from ev where kind = 'calendar_add'
union all select 'Groups created / joined / invites shared',                 sum((kind='create_group')::int)::text || ' / ' || sum((kind='join_group')::int) || ' / ' || sum((kind='share_invite')::int) from ev
union all select 'Sign-ins',                                                 count(*)::text from ev where kind = 'sign_in'
union all select 'App Store link taps (website)',                            count(*)::text from ev where kind = 'app_store'
union all select 'Accounts in total (all time)',                             (select count(*) from public.profiles)::text
union all select 'Groups in total (all time)',                               (select count(*) from public.groups)::text;

-- Top events by ticket taps and interest, last 30 days (run separately):
-- select item_id, sum((kind='outbound_tickets')::int) tickets, sum((kind='outbound_more_info')::int) info,
--        sum((kind='star')::int) stars, sum((kind='lock')::int) locked, count(distinct coalesce(user_id::text, anon_id)) people
-- from public.usage_events where at >= now() - interval '30 days' and item_id is not null
-- group by item_id order by tickets desc, people desc limit 25;

-- Weekly active people (run separately):
-- select date_trunc('week', at)::date as week, count(distinct coalesce(user_id::text, anon_id)) as people,
--        sum((kind='outbound_tickets')::int) as ticket_taps
-- from public.usage_events group by 1 order by 1 desc limit 26;
