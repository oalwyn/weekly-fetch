// Tests supabase/v1.3-analytics.sql (engagement measurement) in an in-memory Postgres.
// Numbers in [brackets] refer to the acceptance tests in the measurement plan.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const repo = process.argv[2] || new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const db = new PGlite();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('FAIL:', m); } };
const as = async (uid) => db.exec(`select set_config('test.uid', '${uid || ''}', false)`);
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];
const throws = async (sql, params, re, m) => { try { await db.query(sql, params); ok(false, m + ' (no error)'); } catch (e) { ok(re.test(e.message), m + ' -> ' + e.message); } };
const uuid = () => crypto.randomUUID();
const count = async (where = 'true') => +(await one(`select count(*) n from analytics_events where ${where}`)).n;
const ev = (o) => JSON.stringify(Object.assign({ record_id: uuid(), anon_id: 'deviceAAA1', session_id: 'sessAAAA1', platform: 'web', environment: 'production' }, o));

await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth; create table auth.users (id uuid primary key, email text, created_at timestamptz default now(), last_sign_in_at timestamptz, raw_app_meta_data jsonb default '{}'::jsonb);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;  -- like Supabase
`);
await db.exec(fs.readFileSync(repo + '/supabase-setup.sql', 'utf8'));
for (const f of ['v1.1-groups.sql', 'v1.1-plans-extra.sql', 'v1.3-analytics.sql', 'v1.3-analytics.sql', 'v1.4-city.sql', 'v1.4-city.sql', 'v1.5-android.sql', 'v1.5-android.sql', 'v1.6-sharing.sql', 'v1.6-sharing.sql', 'v1.7-accounts.sql', 'v1.7-accounts.sql'])
  await db.exec(fs.readFileSync(repo + '/supabase/' + f, 'utf8'));
ok(true, 'scripts run (analytics and city twice)');
ok((await q(`select 1 from pg_proc where proname in ('admin_report','admin_export')`)).length === 2, 'one version of each report function (no ambiguous overloads)');
ok((await q(`select proname, pg_get_function_identity_arguments(oid) a from pg_proc where proname in ('add_group_pick','set_group_lock','join_group','leave_group','set_rsvp')`)).length === 5,
  'one version of each plan function (no ambiguous overloads)');

const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222', OWNER = '99999999-9999-9999-9999-999999999999';
await db.exec(`insert into auth.users values ('${A}'),('${B}'),('${OWNER}')`);
await db.exec(`insert into analytics_admins(user_id) values ('${OWNER}')`);
const ctx = (o = {}) => JSON.stringify(Object.assign({ session_id: 'sessUSERA1', platform: 'ios', app_version: '1.3', environment: 'production', placement: 'event_card', category: 'hol', region: 'peninsula' }, o));

// ---- group plans: server-confirmed records ----
await as(A); await q(`select set_my_name('Ann')`);
const g = (await one(`select create_group('Household', $1::jsonb) g`, [ctx()])).g;
ok(await count(`event_name = 'group_created' and evidence = 'server_confirmed' and user_id = '${A}'`) === 1, 'group_created recorded by the server');
await as(B); await q(`select set_my_name('Ben')`);
const before = await count(`event_name = 'group_joined'`);
await q(`select join_group('XXXXXX')`);
ok(await count(`event_name = 'group_joined'`) === before, '[2] failed join (wrong code) records nothing');

// [8] sharing an invite is separate from joining
await as(A);
await q(`select log_client_event($1::jsonb)`, [ev({ event_name: 'invite_share_opened', anon_id: null, group_id: g.id })]);
ok(await count(`event_name = 'group_joined'`) === 0, '[8] an invite share is not a join');
await as(B); await q(`select join_group($1, $2::jsonb)`, [g.code, ctx({ via: 'link' })]);
ok(await count(`event_name = 'group_joined' and user_id = '${B}' and props->>'via' = 'link'`) === 1, '[8] the join is recorded once membership exists');
await q(`select join_group($1)`, [g.code]);
ok(await count(`event_name = 'group_joined'`) === 1, 'joining again (already a member) records nothing');

// [1] one star → exactly one record; [3] retries / double taps don't inflate
await as(A);
await q(`select add_group_pick($1,'evt-1','{"title":"Tree lighting"}', $2::jsonb)`, [g.id, ctx()]);
ok(await count(`event_name = 'event_starred'`) === 1, '[1] one group star → one event_starred');
const s = await one(`select * from analytics_events where event_name = 'event_starred'`);
ok(s.evidence === 'server_confirmed' && s.user_id === A && s.anon_id === null && s.session_id === 'sessUSERA1' && s.category === 'hol' && s.region === 'peninsula' && s.platform === 'ios',
  'star record carries server-derived user, context, no device code');
await q(`select add_group_pick($1,'evt-1','{"title":"Tree lighting"}', $2::jsonb)`, [g.id, ctx()]);
await q(`select add_group_pick($1,'evt-1','{"title":"Tree lighting"}')`, [g.id]);
ok(await count(`event_name = 'event_starred'`) === 1, '[3] repeating the same star (retry, double tap, old app) adds nothing');
// [2] failed writes
await as(OWNER);
await throws(`select add_group_pick($1,'evt-2','{}')`, [g.id], /not a member/, '[2] non-member star refused');
ok(await count(`event_name = 'event_starred'`) === 1, '[2] the refused star recorded nothing');
await as(A);
await throws(`select set_rsvp($1,'evt-1','going')`, [g.id], /not locked in/, '[2] RSVP on an unlocked plan refused');
ok(await count(`event_name like 'rsvp%'`) === 0, '[2] the refused RSVP recorded nothing');

// locks, moves, automatic "going", RSVPs, meet-ups
await q(`select set_group_lock($1,'evt-1','2026-11-21','{}', $2::jsonb)`, [g.id, ctx()]);
ok(await count(`event_name = 'event_locked_in' and occurrence_id = 'evt-1@2026-11-21'`) === 1, 'lock recorded with occurrence id');
ok(await count(`event_name like 'rsvp%'`) === 0, "locking's automatic 'going' isn't a separate RSVP record");
await q(`select set_group_lock($1,'evt-1','2026-11-21','{}')`, [g.id]);
ok(await count(`event_name in ('event_locked_in','event_lock_moved')`) === 1, '[3] locking the same day again adds nothing');
await q(`select set_group_lock($1,'evt-1','2026-11-22','{}')`, [g.id]);
ok(await count(`event_name = 'event_lock_moved' and props->>'moved_from' = '2026-11-21' and occurrence_id = 'evt-1@2026-11-22'`) === 1, 'moving the day is event_lock_moved');
ok(await count(`event_name like 'rsvp%'`) === 0, 'moving the day (which resets answers) records no RSVP');
await as(B);
await q(`select set_rsvp($1,'evt-1','maybe')`, [g.id]);
await q(`select set_rsvp($1,'evt-1','maybe')`, [g.id]);
ok(await count(`event_name = 'rsvp_set' and user_id = '${B}' and props->>'status' = 'maybe'`) === 1, 'RSVP recorded once; same answer again adds nothing');
await q(`select set_meetup($1,'evt-1','10:30','Philz Coffee on Castro')`, [g.id]);
const mu = await one(`select * from analytics_events where event_name = 'meetup_set'`);
ok(mu && !JSON.stringify(mu).includes('Philz'), '[13] meet-up recorded without the place text');
await q(`select set_meetup($1,'evt-1','10:30','Philz Coffee on Castro')`, [g.id]);
ok(await count(`event_name = 'meetup_set'`) === 1, 'unchanged meet-up adds nothing');

// active / collaborative groups need two different members → A and B both contributed
// unstar by the last person clears the lock: unstarred + unlocked
await as(B); await q(`select add_group_pick($1,'evt-3','{}')`, [g.id]); await q(`select remove_group_pick($1,'evt-3')`, [g.id]);
ok(await count(`event_name = 'event_unstarred' and item_id = 'evt-3'`) === 1, 'unstar recorded');

// ---- client records ----
await as(null);
let r = (await one(`select log_client_event($1::jsonb) r`, [ev({ event_name: 'event_starred', item_id: 'local-1', category: 'show' })])).r;
ok(r.ok && await count(`item_id = 'local-1' and evidence = 'client_observed' and anon_id = 'deviceAAA1' and user_id is null`) === 1, '[4] signed-out local star is client_observed with the device code');
const rid = uuid();
await q(`select log_client_event($1::jsonb)`, [ev({ record_id: rid, event_name: 'outbound_booking_clicked', item_id: 'local-1', dest_host: 'Tickets.Example.com', outbound_id: uuid() })]);
r = (await one(`select log_client_event($1::jsonb) r`, [ev({ record_id: rid, event_name: 'outbound_booking_clicked', item_id: 'local-1' })])).r;
ok(r.ok && r.duplicate && await count(`record_id = '${rid}'`) === 1, '[3] the same client record sent twice is stored once');
ok((await one(`select dest_host from analytics_events where record_id = '${rid}'`)).dest_host === 'tickets.example.com', 'destination stored as host only');
r = (await one(`select log_client_event($1::jsonb) r`, [ev({ event_name: 'purchase_completed' })])).r;
ok(!r.ok && r.reason === 'unknown_event', '[9] there is no purchase event; unknown names are rejected');
ok((await q(`select 1 from pg_constraint where conname = 'analytics_events_name_check' and pg_get_constraintdef(oid) ~ 'purchase|order|booked'`)).length === 0, '[9] no event name means a purchase or booking');
r = (await one(`select log_client_event($1::jsonb) r`, [ev({ event_name: 'event_starred', group_id: g.id })])).r;
ok(!r.ok && r.reason === 'server_confirmed_only', 'a group star claimed by the client is rejected (the server records those)');
r = (await one(`select log_client_event($1::jsonb) r`, [JSON.stringify({ event_name: 'page_view', record_id: uuid() })])).r;
ok(!r.ok && r.reason === 'no_identity', 'records with neither account nor device code are rejected');

// [13] sensitive fields
await q(`select log_client_event($1::jsonb)`, [ev({ event_name: 'page_view', record_id: 'aaaaaaaa-0000-4000-8000-000000000013',
  landing_path: '/join/?c=ABC123&token=secret&email=a@b.com#access_token=xyz', source: 'News Letter!', campaign: 'Fall_2026',
  props: { email: 'a@b.com', name: 'Ann', value: 'hol', tab: 'events', huge: 'x'.repeat(2000) } })]);
const pv = await one(`select * from analytics_events where record_id = 'aaaaaaaa-0000-4000-8000-000000000013'`);
ok(pv.landing_path === '/join/' && pv.source === 'newsletter' && pv.campaign === 'fall_2026', '[13] paths lose query/fragment; source tags are reduced to safe tokens');
ok(pv.props && pv.props.value === 'hol' && pv.props.tab === 'events' && !('email' in pv.props) && !('name' in pv.props) && !('huge' in pv.props), '[13] only allowlisted properties are kept');
ok(!JSON.stringify(pv).match(/secret|a@b\.com|ABC123|xyz/), '[13] no token, email or invite code stored');

// [5] [6] identity: signed-in records never carry the device code; signing in doesn't rewrite earlier anonymous records
await as(A);
await q(`select log_client_event($1::jsonb)`, [ev({ event_name: 'outbound_info_clicked', item_id: 'x', anon_id: 'deviceAAA1' })]);
const signed = await one(`select * from analytics_events where event_name = 'outbound_info_clicked'`);
ok(signed.user_id === A && signed.anon_id === null, '[5] a signed-in record keeps the account, never the device code');
ok(await count(`anon_id = 'deviceAAA1' and user_id is not null`) === 0, '[6] no record links a device code to an account');
await as(null);
await q(`select log_client_event($1::jsonb)`, [ev({ event_name: 'page_view', anon_id: 'deviceBBB2' })]);
ok(await count(`anon_id = 'deviceBBB2' and user_id is null`) === 1, '[6] after sign-out the new device code is a separate identity');
// a client can't claim to be someone else or internal
await q(`select log_client_event($1::jsonb)`, [ev({ event_name: 'page_view', anon_id: 'deviceCCC3', user_id: A, is_internal: false, evidence: 'server_confirmed' })]);
const forged = await one(`select * from analytics_events where anon_id = 'deviceCCC3'`);
ok(forged.user_id === null && forged.evidence === 'client_observed', 'client cannot set user_id or evidence');

// [7] development and internal activity
await q(`select log_client_event($1::jsonb)`, [ev({ event_name: 'event_starred', item_id: 'dev-1', anon_id: 'deviceDEV1', environment: 'development' })]);
ok((await one(`select is_internal from analytics_events where item_id = 'dev-1'`)).is_internal === true, '[7] development records are flagged');
await as(OWNER);
await q(`select admin_mark_internal('deviceAAA1', null, 'owner laptop')`);
ok(await count(`anon_id = 'deviceAAA1' and not is_internal`) === 0, '[7] marking a device flags its past records too');
await as(null);
await q(`select log_client_event($1::jsonb)`, [ev({ event_name: 'page_view', anon_id: 'deviceAAA1' })]);
ok(await count(`anon_id = 'deviceAAA1' and not is_internal`) === 0, '[7] and its new records');
ok(+(await one(`select count(*) n from analytics_kpi where anon_id in ('deviceAAA1','deviceDEV1')`)).n === 0, '[7] none of it reaches the KPI view');

// rate limit
await as(null);
for (let i = 0; i < 125; i++) await q(`select log_client_event($1::jsonb)`, [ev({ event_name: 'page_view', anon_id: 'deviceSPAM' })]);
ok(await count(`anon_id = 'deviceSPAM'`) === 120, 'rate limit: 120 records a minute per identity');
ok(+(await one(`select coalesce(sum(n),0) n from analytics_rejects where reason = 'rate_limited'`)).n === 5, 'rejected records are counted for the health panel');

// [15] access
await as(null);
await db.exec('set role anon');
await throws(`select * from analytics_events limit 1`, [], /permission denied/, '[15] anon cannot read raw records');
await throws(`select * from analytics_kpi limit 1`, [], /permission denied/, '[15] anon cannot read the KPI view');
await throws(`select admin_report(4)`, [], /permission denied/, '[15] anon cannot call the report');
await db.exec('reset role');
await as(A); await db.exec('set role authenticated');
await throws(`select * from analytics_events limit 1`, [], /permission denied/, '[15] signed-in users cannot read raw records');
await throws(`select admin_report(4)`, [], /not authorized/, '[15] non-admin account cannot read the report');
await throws(`select admin_export('2026-01-01','2030-01-01')`, [], /not authorized/, '[15] non-admin account cannot export');
await throws(`select admin_mark_internal('deviceZZZ9')`, [], /not authorized/, '[15] non-admin cannot mark devices');
await db.exec('reset role');

// privacy: account deletion unlinks; device deletion removes
await as(B); await q(`select delete_my_account()`);
ok(await count(`user_id = '${B}'`) === 0 && await count(`event_name = 'rsvp_set'`) === 1, 'deleting an account unlinks its records (kept without the account)');
await as(OWNER);
const del = (await one(`select admin_delete_device('deviceBBB2') n`)).n;
ok(del === 1 && await count(`anon_id = 'deviceBBB2'`) === 0, 'a device code can be deleted on request');

// ---- [11] [12] reports against a fixture with known answers ----
await db.exec(`truncate analytics_events; delete from analytics_internal;`);
// this week (LA) and earlier weeks, computed in SQL so the test doesn't depend on today's date
const wk = (await one(`select _la_week(now()) w`)).w;
const fx = async (name, ident, weeksAgo, opts = {}) => {
  const ts = `(_la_week(now()) - ${7 * weeksAgo})::timestamp at time zone 'America/Los_Angeles' + interval '${opts.hours || 12} hours'`;
  await db.exec(`insert into analytics_events(record_id, event_name, received_at, anon_id, user_id, session_id, group_id, item_id, category, platform, environment, is_internal, evidence)
    values ('${uuid()}', '${name}', ${ts}, ${ident.startsWith('a') ? `'${ident}'` : 'null'}, ${ident.startsWith('a') ? 'null' : `'${ident}'`},
    '${opts.session || 'sess' + ident.slice(0, 6) + weeksAgo}', ${opts.group ? `'${opts.group}'` : 'null'}, ${opts.item ? `'${opts.item}'` : 'null'},
    ${opts.cat ? `'${opts.cat}'` : 'null'}, '${opts.platform || 'web'}', '${opts.env || 'production'}', ${opts.internal ? 'true' : 'false'}, '${opts.ev || 'client_observed'}')`);
};
// anonymous visitor 1: first seen 6 weeks ago, stars same session, returns 5 weeks ago (week 1) and 2 weeks ago (week 4)
await fx('page_view', 'aVisitor01', 6, { session: 'sessV1first' });
await fx('event_starred', 'aVisitor01', 6, { session: 'sessV1first', item: 'e1', cat: 'hol', hours: 13 });
await fx('outbound_booking_clicked', 'aVisitor01', 5, { item: 'e1', cat: 'hol', hours: 20 });   // 7 days 8 hours after first seen
await fx('event_starred', 'aVisitor01', 2, { item: 'e2', cat: 'show' });
// anonymous visitor 2: seen 6 weeks ago, first meaningful action 3 days later in another session (7-day activation, not same session)
await fx('page_view', 'aVisitor02', 6, { session: 'sessV2a' });
await fx('outbound_booking_clicked', 'aVisitor02', 6, { session: 'sessV2b', item: 'e1', cat: 'hol', hours: 80 });
// anonymous visitor 3: only browses
await fx('page_view', 'aVisitor03', 6);
// account C and D in a group, both contribute 1 week ago (collaborative); C started this week too
const G = g.id;
await db.exec(`insert into auth.users values ('cccccccc-cccc-cccc-cccc-cccccccccccc'),('dddddddd-dddd-dddd-dddd-dddddddddddd')`);
await fx('event_starred', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 1, { group: G, item: 'e3', cat: 'dog', ev: 'server_confirmed' });
await fx('rsvp_set', 'dddddddd-dddd-dddd-dddd-dddddddddddd', 1, { group: G, item: 'e3', ev: 'server_confirmed' });
await fx('event_starred', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 0, { group: G, item: 'e4', cat: 'dog', ev: 'server_confirmed' });
// excluded: development and internal
await fx('event_starred', 'aDevice999', 1, { env: 'development', internal: true, item: 'e1' });
await fx('event_starred', 'aInternal88', 1, { internal: true, item: 'e1' });

await as(OWNER);
const rep = (await one(`select admin_report(8) r`)).r;
const W = (n) => rep.weekly.find(x => x.week === (new Date(new Date(wk).getTime() - n * 7 * 864e5)).toISOString().slice(0, 10));
ok(rep.weekly.length === 8 && rep.timezone === 'America/Los_Angeles' && rep.instrumentation_start, '[11] report covers 8 LA weeks and states timezone and start date');
ok(W(6).visitors === 3 && W(6).new_visitors === 3 && W(6).wmu_anonymous === 2, '[11] week −6: 3 visitors, 3 new, 2 weekly meaningful (anonymous)');
ok(W(1).accounts === 2 && W(1).wmu_accounts === 2 && W(1).active_groups === 1 && W(1).collaborative_groups === 1, '[11] week −1: 2 accounts, 1 active and collaborative group');
ok(W(0).collaborative_groups === 0 && W(0).active_groups === 1, '[11] this week: group active but only one contributor');
ok(W(1).actions.event_starred.records === 1, '[7] development and internal stars are excluded from the totals');
const act = rep.activation.find(x => x.identity_type === 'anonymous' && x.new_identities === 3);
ok(act && act.same_session_activated === 1 && act.eligible_7d === 3 && act.activated_7d === 2, '[11] activation: 1 same-session, 2 of 3 within 7 days');
const ret = rep.retention.find(x => x.identity_type === 'anonymous');
ok(ret && ret.cohort_size === 2 && ret.week1 === 1 && ret.week2 === 0 && ret.week4 === 1, '[11] retention: week 1 = 1/2, week 2 = 0/2, week 4 = 1/2');
const young = rep.retention.find(x => x.identity_type === 'account');
ok(young && young.cohort_size === 2 && young.week1 === null && young.week2 === null && young.week4 === null, '[12] cohorts whose weeks have not ended show null (not yet eligible), not 0');
const f = rep.funnel.find(x => x.identity_type === 'anonymous');
ok(f && f.eligible === 3 && f.meaningful_action === 2 && f.booking_click === 1, '[11] funnel counts each step independently within 7 days (no star needed before a booking click)');
const e1 = rep.top_items.find(x => x.item_id === 'e1');
ok(e1 && e1.booking_clicks === 2 && e1.stars === 1, '[11] top events: e1 has 2 booking clicks, 1 star (excluded records left out)');
const exp = (await one(`select admin_export((now() - interval '60 days')::date, now()::date) r`)).r;
ok(exp.length === 10 && !exp.some(x => x.excluded_from_kpis), '[11] export of KPI records matches the fixture (10 rows)');
const expAll = (await one(`select admin_export((now() - interval '60 days')::date, now()::date, true) r`)).r;
ok(expAll.length === 12 && expAll.filter(x => x.excluded_from_kpis).length === 2, '[11] export with exclusions marks the 2 excluded rows');
ok(!JSON.stringify(exp).match(/@|Ann|Ben|email/), '[13] export holds no emails or names');

// ---- v1.4: records split by city ----
ok((await one(`select _city_of('sydney', null, 'web') c`)).c === 'sydney' && (await one(`select _city_of(null, 'syd-carols', 'web') c`)).c === 'sydney'
  && (await one(`select _city_of(null, 'tree-lighting', 'web') c`)).c === 'bayarea' && (await one(`select _city_of('Bad City!', null, 'ios') c`)).c === 'bayarea'
  && (await one(`select _city_of(null, null, 'web') c`)).c === null, 'city: sent value, else syd- ids are Sydney, other events and the iPhone app are Bay Area, else unknown');
await as(null);
await q(`select log_client_event($1::jsonb)`, [ev({ event_name: 'outbound_booking_clicked', anon_id: 'aSydney001', session_id: 'sessSYD001', item_id: 'syd-carols', city: 'sydney' })]);
await q(`select log_client_event($1::jsonb)`, [ev({ event_name: 'page_view', anon_id: 'aSydney001', session_id: 'sessSYD001', city: 'sydney' })]);
await q(`select log_client_event($1::jsonb)`, [ev({ event_name: 'event_starred', anon_id: 'aSydney002', session_id: 'sessSYD002', item_id: 'syd-bondi' })]);
await q(`select log_client_event($1::jsonb)`, [ev({ event_name: 'page_view', anon_id: 'aBayArea01', session_id: 'sessBAY001', city: 'bayarea' })]);
ok(await count(`anon_id = 'aSydney001' and city = 'sydney'`) === 2, 'city: client records keep the city they were sent with');
ok(await count(`anon_id = 'aSydney002' and city = 'sydney'`) === 1, 'city: a record without a city but with a Sydney event id is Sydney');
await as(A);
await q(`select add_group_pick($1,'syd-ferry','{"title":"Ferry"}', $2::jsonb)`, [g.id, ctx({ city: 'sydney' })]);
await q(`select add_group_pick($1,'syd-opera','{"title":"Opera"}')`, [g.id]);
await q(`select add_group_pick($1,'evt-older-app','{"title":"Old app star"}')`, [g.id]);
ok(await count(`event_name = 'event_starred' and item_id in ('syd-ferry','syd-opera') and city = 'sydney'`) === 2, 'city: group plan changes are Sydney with the city in context, or from the event id (older app)');
ok(await count(`event_name = 'event_starred' and item_id = 'evt-older-app' and city = 'bayarea'`) === 1, 'city: an older app star without context is Bay Area');
await as(OWNER);
const syd = (await one(`select admin_report(8, 'sydney') r`)).r;
const allc = (await one(`select admin_report(8) r`)).r;
const sydStars = syd.weekly.reduce((n, w) => n + ((w.actions && w.actions.event_starred && w.actions.event_starred.records) || 0), 0);
ok(syd.city === 'sydney' && sydStars === 3 && syd.top_items.every(x => x.item_id.startsWith('syd-')), 'city: the Sydney report counts only Sydney records');
const bc = Object.fromEntries(allc.by_city.map(x => [x.city, x]));
ok(bc.sydney && bc.sydney.identities === 3 && bc.sydney.booking_clicks === 1 && bc.bayarea, 'city: by_city compares cities side by side');
ok(allc.weekly.reduce((n, w) => n + w.visitors, 0) > syd.weekly.reduce((n, w) => n + w.visitors, 0), 'city: all-cities totals include more than Sydney');
const sydExp = (await one(`select admin_export((now() - interval '60 days')::date, now()::date, false, 'sydney') r`)).r;
ok(sydExp.length === 5 && sydExp.every(x => x.city === 'sydney'), 'city: export can be narrowed to one city and includes the city column');

// ---- v1.5: the Android app ----
await as(null);
await q(`select log_client_event($1::jsonb)`, [ev({ event_name: 'app_open', anon_id: 'aAndroid01', session_id: 'sessAND001', platform: 'android', app_version: 'android-1.0+1', city: 'bayarea' })]);
ok(await count(`anon_id = 'aAndroid01' and platform = 'android' and app_version = 'android-1.0+1'`) === 1, 'android: app records keep platform android');
await as(OWNER);
const andr = (await one(`select admin_report(8) r`)).r;
ok(andr.weekly.reduce((n, w) => n + (w.android_sessions || 0), 0) === 1, 'android: the report counts Android sessions');

// ---- v1.6: sharing ----
await as(null);
await q(`select log_client_event($1::jsonb)`, [ev({ event_name: 'share_opened', anon_id: 'aSharer001', session_id: 'sessSHR001', platform: 'web', item_id: 'ldn-fm-marylebone', props: { kind: 'invite', code: 'abcd2345' } })]);
await q(`select log_client_event($1::jsonb)`, [ev({ event_name: 'share_destination_opened', anon_id: 'aSharer001', session_id: 'sessSHR001', platform: 'web', props: { kind: 'invite', channel: 'web_share' } })]);
await q(`select log_client_event($1::jsonb)`, [ev({ event_name: 'share_link_landed', anon_id: 'aFriend001', session_id: 'sessFRN001', platform: 'web', item_id: 'ldn-fm-marylebone', source: 'share', medium: 'share', campaign: 'abcd2345', props: { found: true, past: false, new_visitor: true } })]);
await q(`select log_client_event($1::jsonb)`, [ev({ event_name: 'outbound_booking_clicked', anon_id: 'aFriend001', session_id: 'sessFRN001', platform: 'web', item_id: 'ldn-fm-marylebone' })]);
ok(await count(`event_name like 'share_%'`) === 3, 'sharing: the three share records are accepted');
await as(OWNER);
const shr = (await one(`select admin_sharing_report(8) r`)).r;
const tot = k => shr.weeks.reduce((n, w) => n + w[k], 0);
ok(tot('invites_opened') === 1 && tot('destinations_opened') === 1 && tot('landings') === 1 && tot('new_visitor_landings') === 1 && tot('acted_7d') === 1, 'sharing: the report links a landing to the friend\'s booking click');
ok(shr.channels.web_share === 1, 'sharing: destinations are counted by channel');
await as(null);
let denied = false; try { await q(`select admin_sharing_report(8)`); } catch (e) { denied = true; }
ok(denied, 'sharing: the report is for owners only');

// ---- v1.7: settings saved to the account ----
await as(null);
let anonDenied = false; try { await q(`select set_my_prefs('{}'::jsonb)`); } catch (e) { anonDenied = true; }
ok(anonDenied, 'prefs: signed-out callers are refused');
await as(A);
ok((await one(`select get_my_prefs() r`)).r.prefs === null, 'prefs: nothing saved yet reads as null');
const pin = { likes_off: ['sport', 'film', 'BAD!'], tour: 'done', tips: ['star', 'map'], junk: 1,
  cities: { bayarea: { home: { name: '123 Main St, Mountain View', lat: 37.386052, lon: -122.083851 }, dist: 25, home_asked: true },
            sydney: { home: null, dist: 10 }, 'Bad Key': { dist: 5 } } };
const t1 = (await one(`select set_my_prefs($1::jsonb, 'bayarea') t`, [JSON.stringify(pin)])).t;
const got = (await one(`select get_my_prefs() r`)).r;
ok(JSON.stringify(got.prefs.likes_off) === '["sport","film"]' && got.prefs.tour === 'done' && !('junk' in got.prefs), 'prefs: only known settings are kept');
ok(got.prefs.cities.bayarea.home.lat === 37.39 && got.prefs.cities.bayarea.home.lon === -122.08, 'prefs: home rounded to about 1 km');
ok(got.prefs.cities.bayarea.home.name === 'Home area', 'prefs: a street address is never stored as the home name');
ok(got.prefs.cities.sydney.home === null && got.prefs.cities.sydney.dist === 10 && !got.prefs.cities['Bad Key'], 'prefs: per-city values kept, bad keys dropped');
ok(!!t1 && got.prefs_at !== null, 'prefs: the save time comes back');
await q(`select set_my_prefs($1::jsonb, 'sydney')`, [JSON.stringify({ cities: { bayarea: { home: { name: 'Palo Alto', lat: 37.44, lon: -122.14 } } } })]);
const got2 = (await one(`select get_my_prefs() r`)).r;
ok(got2.prefs.cities.bayarea.home.name === 'Palo Alto' && !got2.prefs.likes_off, 'prefs: a save replaces the earlier one; a town name is kept');
ok((await one(`select city from user_prefs where user_id = '${A}'`)).city === 'bayarea', 'prefs: the first city is kept');
let big = false; try { await q(`select set_my_prefs($1::jsonb)`, [JSON.stringify({ tips: Array(5000).fill('x') })]); big = true; } catch (e) {}
ok(big, 'prefs: oversized lists are trimmed, not stored whole');
ok((await one(`select set_email_opt_in(true) r`)).r === true && (await one(`select get_my_prefs() r`)).r.email_opt_in === true, 'opt-in: can be switched on');
const at1 = (await one(`select email_opt_in_at t from user_prefs where user_id = '${A}'`)).t;
await q(`select set_email_opt_in(true)`);
ok(String((await one(`select email_opt_in_at t from user_prefs where user_id = '${A}'`)).t) === String(at1), 'opt-in: the first opt-in time is kept');
await q(`select set_email_opt_in(false)`);
ok((await one(`select email_opt_in, email_opt_in_at from user_prefs where user_id = '${A}'`)).email_opt_in === false, 'opt-in: can be switched off');
let notOwner = false; try { await q(`select admin_accounts()`); } catch (e) { notOwner = true; }
ok(notOwner, 'accounts list: owners only');
await db.exec(`update auth.users set email = 'ann@example.com', raw_app_meta_data = '{"provider":"apple"}' where id = '${A}'`);
await as(OWNER);
const accts = (await one(`select admin_accounts() r`)).r;
const ann = accts.find(x => x.id === A);
ok(accts.length >= 3 && ann && ann.email === 'ann@example.com' && ann.method === 'apple' && ann.saved_settings === true && ann.city === 'bayarea' && ann.name === 'Ann', 'accounts list: email, method, city, saved settings, name');
await as(A); await q(`select set_email_opt_in(true)`);
await q(`select delete_my_account()`);
ok(+(await one(`select count(*) n from user_prefs where user_id = '${A}'`)).n === 0, 'prefs: deleted with the account');

// retention job folds old records into identifier-free weekly totals
await db.exec(`insert into analytics_events(record_id, event_name, received_at, anon_id, platform, environment, evidence)
  values ('${uuid()}','page_view', now() - interval '15 months', 'aOldOne01', 'web', 'production', 'client_observed')`);
const removed = (await one(`select _analytics_retention() n`)).n;
ok(removed === 1 && +(await one(`select count(*) n from analytics_weekly where event_name = 'page_view'`)).n === 1, 'retention: records past 13 months become weekly totals');
ok((await one(`select city from analytics_weekly where event_name = 'page_view'`)).city === '', 'retention: weekly totals keep a city column');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
