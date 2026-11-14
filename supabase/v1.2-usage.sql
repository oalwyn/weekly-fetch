-- Bay Fetch 1.2: more usage counts (tickets, showtimes, filters, interests).
-- Run AFTER v1.1-plans-extra.sql (Supabase > SQL Editor > New query > paste > Run). Safe to run more than once.
alter table public.usage_events drop constraint if exists usage_events_kind_check;
alter table public.usage_events add constraint usage_events_kind_check check (kind in ('app_open','event_view','star','lock',
  'calendar_add','reminder_tapped','share_invite','join_group','create_group','outbound_more_info','outbound_directions',
  'sign_in','rsvp','meetup','all_plans',
  'outbound_tickets','outbound_showtimes','filter','interests','app_store'));
create index if not exists usage_events_kind_at on public.usage_events(kind, at);
