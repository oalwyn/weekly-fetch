-- v1.7: settings saved to the account, an optional email opt-in, and an accounts view for the owner (Nov 2026).
-- Apply after v1.6-sharing.sql. Safe to re-run. Doesn't touch admin_report, so no re-run order with v1.3–v1.6.
-- Order when deploying: apply this before publishing site code that calls get_my_prefs / set_my_prefs (the site
-- quietly skips syncing if they're missing, so nothing breaks either way).
--
-- What is stored (one row per account, deleted with the account):
--   prefs: the person's settings, written by the site/app: interests switched off, tour/tips seen, and per city a home
--          (a place name and coordinates rounded to about 1 km, never a street address) and the distance filter.
--   city:  the city page the settings were first saved from (for the owner's counts).
--   email_opt_in / email_opt_in_at: an unticked-by-default "email me the weekend picks" box. No emails are sent by this.

create table if not exists public.user_prefs (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  prefs           jsonb not null default '{}'::jsonb check (jsonb_typeof(prefs) = 'object' and pg_column_size(prefs) < 8000),
  prefs_at        timestamptz,
  city            text check (city is null or city ~ '^[a-z]{2,20}$'),
  email_opt_in    boolean not null default false,
  email_opt_in_at timestamptz,
  created_at      timestamptz not null default now()
);
alter table public.user_prefs enable row level security;
revoke all on table public.user_prefs from public, anon, authenticated;

-- coordinates to 2 decimals (about 1 km); names that look like a street address become "Home area"
create or replace function public._clean_prefs(p jsonb) returns jsonb
language plpgsql immutable as $$
declare out jsonb := '{}'::jsonb; c record; h jsonb; nm text; cities jsonb := '{}'::jsonb; one jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return '{}'::jsonb; end if;
  if jsonb_typeof(p->'likes_off') = 'array' then
    out := out || jsonb_build_object('likes_off', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
      select left(v #>> '{}', 12) x from jsonb_array_elements(p->'likes_off') v
      where jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^[a-z]{2,12}$' limit 40) s));
  elsif p ? 'likes_off' and jsonb_typeof(p->'likes_off') = 'null' then
    out := out || '{"likes_off": null}'::jsonb;
  end if;
  if jsonb_typeof(p->'tour') = 'string' and p->>'tour' in ('seen','done','skipped') then out := out || jsonb_build_object('tour', p->>'tour'); end if;
  if jsonb_typeof(p->'tips') = 'array' then
    out := out || jsonb_build_object('tips', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
      select v #>> '{}' x from jsonb_array_elements(p->'tips') v where (v #>> '{}') ~ '^[a-z]{2,12}$' limit 20) s));
  end if;
  if jsonb_typeof(p->'cities') = 'object' then
    for c in select key, value from jsonb_each(p->'cities') where key ~ '^[a-z]{2,20}$' and jsonb_typeof(value) = 'object' limit 10 loop
      one := '{}'::jsonb; h := c.value->'home';
      if jsonb_typeof(h) = 'object' and jsonb_typeof(h->'lat') = 'number' and jsonb_typeof(h->'lon') = 'number'
         and abs((h->>'lat')::numeric) <= 90 and abs((h->>'lon')::numeric) <= 180 then
        nm := left(coalesce(h->>'name', ''), 28);
        if nm ~ '^\s*\d+[A-Za-z]?\s+\S' or nm = '' then nm := 'Home area'; end if;
        one := one || jsonb_build_object('home', jsonb_build_object('name', nm,
                 'lat', round((h->>'lat')::numeric, 2), 'lon', round((h->>'lon')::numeric, 2)));
      elsif c.value ? 'home' then
        one := one || '{"home": null}'::jsonb;
      end if;
      if jsonb_typeof(c.value->'dist') = 'number' and (c.value->>'dist')::numeric between 0 and 500 then
        one := one || jsonb_build_object('dist', (c.value->>'dist')::numeric);
      end if;
      if jsonb_typeof(c.value->'home_asked') = 'boolean' then one := one || jsonb_build_object('home_asked', c.value->'home_asked'); end if;
      cities := cities || jsonb_build_object(c.key, one);
    end loop;
    out := out || jsonb_build_object('cities', cities);
  end if;
  return out;
end $$;

create or replace function public.get_my_prefs() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me uuid := _me(); r user_prefs;
begin
  select * into r from user_prefs where user_id = me;
  return jsonb_build_object('prefs', case when r.prefs_at is null then null else r.prefs end,
                            'prefs_at', r.prefs_at, 'email_opt_in', coalesce(r.email_opt_in, false));
end $$;

-- p_city: the city page saving them; returns the saved time, which the device keeps to know it is up to date
create or replace function public.set_my_prefs(p_prefs jsonb, p_city text default null) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare me uuid := _me(); t timestamptz := clock_timestamp(); cl jsonb := _clean_prefs(p_prefs);
  c text := case when p_city ~ '^[a-z]{2,20}$' then p_city end;
begin
  if pg_column_size(cl) >= 8000 then raise exception 'settings too large'; end if;
  insert into user_prefs(user_id, prefs, prefs_at, city) values (me, cl, t, c)
  on conflict (user_id) do update set prefs = excluded.prefs, prefs_at = excluded.prefs_at, city = coalesce(user_prefs.city, excluded.city);
  return t;
end $$;

create or replace function public.set_email_opt_in(p_on boolean, p_city text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare me uuid := _me(); c text := case when p_city ~ '^[a-z]{2,20}$' then p_city end;
begin
  insert into user_prefs(user_id, city, email_opt_in, email_opt_in_at) values (me, c, coalesce(p_on, false), case when p_on then now() end)
  on conflict (user_id) do update set email_opt_in = coalesce(p_on, false),
    email_opt_in_at = case when p_on then coalesce(case when user_prefs.email_opt_in then user_prefs.email_opt_in_at end, now()) end,
    city = coalesce(user_prefs.city, excluded.city);
  return coalesce(p_on, false);
end $$;

-- owner only: every account, for the dashboard's Accounts section and its CSV download.
-- city: where they saved settings, else the city of their first record; method: apple or email.
create or replace function public.admin_accounts() returns jsonb
language plpgsql stable security definer set search_path = public, auth as $$
declare out jsonb;
begin
  perform _require_admin();
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb) into out from (
    select u.id, u.email, u.created_at, u.last_sign_in_at,
      coalesce(u.raw_app_meta_data->>'provider', 'email') as method,
      pr.display_name as name,
      coalesce(up.city, (select e.city from analytics_events e where e.user_id = u.id and e.city is not null order by e.received_at limit 1)) as city,
      (up.prefs_at is not null) as saved_settings, up.prefs_at,
      coalesce(up.email_opt_in, false) as email_opt_in, up.email_opt_in_at,
      (select count(*) from group_members m where m.user_id = u.id) as groups,
      exists (select 1 from analytics_admins a where a.user_id = u.id) as is_admin
    from auth.users u
    left join profiles pr on pr.id = u.id
    left join user_prefs up on up.user_id = u.id) x;
  return out;
end $$;

revoke all on function public._clean_prefs(jsonb) from public, anon, authenticated;
revoke all on function public.get_my_prefs(), public.set_my_prefs(jsonb, text), public.set_email_opt_in(boolean, text), public.admin_accounts() from public, anon;
grant execute on function public.get_my_prefs(), public.set_my_prefs(jsonb, text), public.set_email_opt_in(boolean, text), public.admin_accounts() to authenticated;
