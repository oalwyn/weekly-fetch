// Tests supabase/v1.1-groups.sql in an in-memory Postgres with a stand-in for Supabase's auth schema.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
const repo = process.argv[2] || new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const db = new PGlite();
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('FAIL:', m); } };
const as = async (uid) => db.exec(`select set_config('test.uid', '${uid || ''}', false)`);
const rpc = async (sql, params = []) => (await db.query(sql, params)).rows;
const throws = async (sql, params, re, m) => { try { await db.query(sql, params); ok(false, m + ' (no error)'); } catch (e) { ok(re.test(e.message), m + ' -> ' + e.message); } };

await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;  -- like Supabase
`);
await db.exec(fs.readFileSync(repo + '/supabase-setup.sql', 'utf8'));
await db.exec(fs.readFileSync(repo + '/supabase/v1.1-groups.sql', 'utf8'));
await db.exec(fs.readFileSync(repo + '/supabase/v1.1-groups.sql', 'utf8'));   // must be safe to run twice
await db.exec(fs.readFileSync(repo + '/supabase/v1.1-plans-extra.sql', 'utf8'));
await db.exec(fs.readFileSync(repo + '/supabase/v1.1-plans-extra.sql', 'utf8'));   // must be safe to run twice
ok(true, 'script runs twice');

const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222', C = '33333333-3333-3333-3333-333333333333';
await db.exec(`insert into auth.users values ('${A}'),('${B}'),('${C}')`);

// signed out
await as(null);
await throws('select public.get_me()', [], /sign in required/, 'signed-out get_me refused');

// names and groups
await as(A); await rpc(`select set_my_name('  Olivier  ')`);
const g = (await rpc(`select create_group('Our household') g`))[0].g;
ok(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/.test(g.code), 'join code is 6 clear characters: ' + g.code);
const me = (await rpc(`select get_me() m`))[0].m;
ok(me.name === 'Olivier' && me.groups.length === 1 && me.groups[0].role === 'owner', 'get_me shows name and owned group');

await as(B); await rpc(`select set_my_name('Sam')`);
ok((await rpc(`select join_group('ZZZZZZ') g`))[0].g.error === 'no group with that code', 'wrong code refused');
const j = (await rpc(`select join_group($1) g`, [g.code.toLowerCase().split('').join(' ')]))[0].g;   // forgiving about case/spaces
ok(j.id === g.id, 'join with code (any case, spaces) works');

await as(C);
await throws(`select get_group($1)`, [g.id], /not a member/, 'non-member cannot read group');
await throws(`select add_group_pick($1,'x','{}')`, [g.id], /not a member/, 'non-member cannot star');

// stars, locks, last-star clears lock
await as(A); await rpc(`select add_group_pick($1,'evt-1','{"title":"Tree lighting"}')`, [g.id]);
await as(B); await rpc(`select add_group_pick($1,'evt-1','{"title":"Tree lighting"}')`, [g.id]);
await rpc(`select set_group_lock($1,'evt-1','2026-11-21','{"title":"Tree lighting"}')`, [g.id]);
let st = (await rpc(`select get_group($1) s`, [g.id]))[0].s;
ok(st.picks.length === 2 && st.locks.length === 1 && st.locks[0].day === '2026-11-21', 'two stars and a locked day');
ok(st.picks.map(p => p.name).sort().join() === 'Olivier,Sam', 'stars show names');
await as(A); await rpc(`select remove_group_pick($1,'evt-1')`, [g.id]);
st = (await rpc(`select get_group($1) s`, [g.id]))[0].s;
ok(st.picks.length === 1 && st.locks.length === 1, 'lock stays while someone still has it starred');
await as(B); await rpc(`select remove_group_pick($1,'evt-1')`, [g.id]);
st = (await rpc(`select get_group($1) s`, [g.id]))[0].s;
ok(st.picks.length === 0 && st.locks.length === 0, 'last star removed clears the lock');
await rpc(`select set_group_lock($1,'evt-2','2026-11-22',null)`, [g.id]);
await rpc(`select set_group_lock($1,'evt-2',null,null)`, [g.id]);
st = (await rpc(`select get_group($1) s`, [g.id]))[0].s;
ok(st.locks.length === 0, 'unlock (make it a maybe) works');

// who's going, meet-up, all my plans
const day = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10), day2 = new Date(Date.now() + 4 * 864e5).toISOString().slice(0, 10);
await as(A); await rpc(`select add_group_pick($1,'evt-3','{"title":"Parade"}')`, [g.id]);
await throws(`select set_rsvp($1,'evt-3','going')`, [g.id], /not locked in/, 'no answers before a plan is locked in');
await rpc(`select set_group_lock($1,'evt-3',$2,'{"title":"Parade"}')`, [g.id, day]);
st = (await rpc(`select get_group($1) s`, [g.id]))[0].s;
ok(st.rsvps.length === 1 && st.rsvps[0].user_id === A && st.rsvps[0].status === 'going', 'locking it in marks you as going');
await as(B); await rpc(`select set_rsvp($1,'evt-3','no')`, [g.id]);
await throws(`select set_rsvp($1,'evt-3','perhaps')`, [g.id], /unknown answer/, 'unknown answer refused');
await rpc(`select set_meetup($1,'evt-3','10:30','  Rengstorff   Park lot ')`, [g.id]);
await throws(`select set_meetup($1,'evt-3','25:00','x')`, [g.id], /should look like/, 'bad meet-up time refused');
await throws(`select set_meetup($1,'nope','10:00','x')`, [g.id], /not locked in/, 'meet-up needs a locked plan');
st = (await rpc(`select get_group($1) s`, [g.id]))[0].s;
const lk = st.locks.find(l => l.item_id === 'evt-3');
ok(lk.meet_time === '10:30' && lk.meet_place === 'Rengstorff Park lot', 'meet-up saved and tidied');
ok(st.rsvps.find(r => r.user_id === B).status === 'no', 'answer saved');
await as(C);
await throws(`select set_rsvp($1,'evt-3','going')`, [g.id], /not a member/, 'non-member cannot answer');
await throws(`select set_meetup($1,'evt-3','09:00','x')`, [g.id], /not a member/, 'non-member cannot set meet-up');
// a second group for A, with a plan the same day
await as(A); const g2 = (await rpc(`select create_group('Friends') g`))[0].g;
await rpc(`select add_group_pick($1,'evt-4','{"title":"Hike"}')`, [g2.id]);
await rpc(`select set_group_lock($1,'evt-4',$2,'{"title":"Hike"}')`, [g2.id, day]);
const mpk = (await rpc(`select get_my_picks() p`))[0].p;
ok(mpk.length === 2 && mpk.some(x => x.group_id === g.id && x.item_id === 'evt-3') && mpk.some(x => x.group_id === g2.id && x.item_id === 'evt-4'), 'get_my_picks lists my stars in each group');
let mp = (await rpc(`select get_my_plans() p`))[0].p;
ok(mp.length === 2 && mp.map(x => x.group_name).sort().join() === 'Friends,Our household', 'all my plans spans both groups');
const pa = mp.find(x => x.item_id === 'evt-3');
ok(pa.mine === 'going' && pa.meet_time === '10:30' && pa.answers.length === 2 && pa.answers.some(x => x.name === 'Sam' && x.status === 'no'), 'all my plans shows my answer, meet-up and who is going');
await as(B); mp = (await rpc(`select get_my_plans() p`))[0].p;
ok(mp.length === 1 && mp[0].item_id === 'evt-3', "others don't see my other group's plans");
// moving the day resets answers (except the mover's own going); meet-up stays
await rpc(`select set_group_lock($1,'evt-3',$2,null)`, [g.id, day2]);
st = (await rpc(`select get_group($1) s`, [g.id]))[0].s;
ok(st.rsvps.length === 1 && st.rsvps[0].user_id === B && st.rsvps[0].status === 'going' && st.locks.find(l => l.item_id === 'evt-3').meet_time === '10:30', 'moving the day resets answers, keeps meet-up');
await rpc(`select set_meetup($1,'evt-3',null,null)`, [g.id]);
await rpc(`select set_rsvp($1,'evt-3',null)`, [g.id]);
st = (await rpc(`select get_group($1) s`, [g.id]))[0].s;
ok(st.rsvps.length === 0 && st.locks.find(l => l.item_id === 'evt-3').meet_time === null, 'answer and meet-up can be cleared');
await rpc(`select set_rsvp($1,'evt-3','maybe')`, [g.id]);
await rpc(`select set_group_lock($1,'evt-3',null,null)`, [g.id]);
ok((await rpc(`select count(*)::int n from group_rsvps where item_id = 'evt-3'`))[0].n === 0, 'unlocking clears answers');
await as(A); await rpc(`select leave_group($1)`, [g2.id]);
await as(B);

// owner-only code rotation
await throws(`select rotate_join_code($1)`, [g.id], /only the group owner/, 'member cannot rotate code');
await as(A); const nc = (await rpc(`select rotate_join_code($1) c`, [g.id]))[0].c;
ok(nc !== g.code, 'owner rotates code');

// converting an old anonymous list
const L = 'abcdefghijklmnopqrstuvwx';
await db.exec(`insert into picks(list_code,item_id,who,item) values
  ('${L}','evt-9','Olivier','{"title":"Market"}'),('${L}','evt-9','Dana','{"title":"Market"}'),
  ('${L}','evt-8','Dana','{"title":"Walk"}'),('${L}','evt-9','__lock__2026-11-28','{"title":"Market"}')`);
await as(A);
const cg = (await rpc(`select convert_legacy_list($1,'Tahoe crew','Olivier') g`, [L]))[0].g;
st = (await rpc(`select get_group($1) s`, [cg.id]))[0].s;
ok(st.picks.length === 3 && st.locks.length === 1 && st.locks[0].day === '2026-11-28', 'old list copied: 3 stars, 1 lock');
ok(st.picks.filter(p => p.user_id === A).length === 1 && st.picks.filter(p => p.name === 'Dana' && !p.user_id).length === 2, 'my old stars claimed, Dana kept as legacy');
await as(B);
const cg2 = (await rpc(`select convert_legacy_list($1,'ignored','Dana') g`, [L]))[0].g;
st = (await rpc(`select get_group($1) s`, [cg.id]))[0].s;
ok(cg2.id === cg.id && st.members.length === 2 && st.picks.filter(p => p.user_id === B).length === 2, 'second person joins same group and claims Dana stars');
await throws(`select convert_legacy_list('short','x','y')`, [], /invalid list code/, 'bad list code refused');

// leaving: ownership hands over; last out removes the group
await as(A); await rpc(`select leave_group($1)`, [cg.id]);
await as(B); const m2 = (await rpc(`select get_me() m`))[0].m;
ok(m2.groups.find(x => x.id === cg.id).role === 'owner', 'ownership passes on when owner leaves');
await rpc(`select leave_group($1)`, [cg.id]);
ok((await rpc(`select count(*)::int n from groups where id = $1`, [cg.id]))[0].n === 0, 'last person out removes the group');

// brute-force protection
await as(C);
for (let i = 0; i < 20; i++) { try { await db.query(`select join_group('QQQQQ${i % 10}')`); } catch (e) {} }
await throws(`select join_group($1)`, [nc], /too many attempts/, 'join blocked after 20 wrong codes in an hour');

// account deletion
await as(B); await rpc(`select delete_my_account()`);
ok((await rpc(`select count(*)::int n from auth.users where id = $1`, [B]))[0].n === 0, 'account deleted');
ok((await rpc(`select count(*)::int n from group_members where user_id = $1`, [B]))[0].n === 0, 'memberships deleted');
ok((await rpc(`select count(*)::int n from groups where id = $1`, [g.id]))[0].n === 1, 'group survives with remaining member');

// permissions as the real app roles
await db.exec(`set role authenticated`); await as(A);
await throws(`select * from public.groups`, [], /permission denied/, 'app cannot read tables directly');
await throws(`select * from public.usage_events`, [], /permission denied/, 'app cannot read usage counts');
await throws(`select public._new_code()`, [], /permission denied/, 'helpers not callable');
ok((await rpc(`select get_me() m`))[0].m.groups.length === 1, 'signed-in role can call get_me');
await rpc(`select log_event('star','evt-1',$1,null,'web')`, [g.id]);
await db.exec(`reset role; set role anon`); await as(null);
await rpc(`select log_event('app_open',null,null,'anon-xyz','ios')`);
await throws(`select get_me()`, [], /permission denied/, 'signed-out role cannot call account functions');
await throws(`select log_event('hack')`, [], /check constraint|violates/, 'unknown event kinds refused');
await db.exec(`reset role`);
const ev = await rpc(`select kind, user_id, anon_id, group_id from usage_events order by id`);
ok(ev.length === 2 && ev[0].user_id === A && ev[0].group_id === g.id && ev[1].anon_id === 'anon-xyz' && ev[1].user_id === null, 'usage counts recorded correctly');

// old anonymous functions still work for app 1.0.x
await db.exec(`set role anon`);
ok((await rpc(`select count(*)::int n from get_picks($1)`, [L]))[0].n === 4, 'old shared-plan functions untouched');
await db.exec(`reset role`);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
