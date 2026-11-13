// A stand-in for Supabase for browser tests: real v1.1 SQL in PGlite, fake email-code sign-in.
import { PGlite } from '@electric-sql/pglite';
import http from 'node:http';
import fs from 'node:fs';
const repo = process.argv[2] || new URL('../..', import.meta.url).pathname.replace(/\/$/, ''), port = +process.argv[3] || 8790;
const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth; create table auth.users (id uuid primary key default gen_random_uuid(), email text unique);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
`);
await db.exec(fs.readFileSync(repo + '/supabase-setup.sql', 'utf8'));
await db.exec(fs.readFileSync(repo + '/supabase/v1.1-groups.sql', 'utf8'));
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (sub, email) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, email, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 86400 })}.sig`;
const uidOf = auth => { try { const p = JSON.parse(Buffer.from((auth || '').split(' ')[1].split('.')[1], 'base64url')); return p.sub || null; } catch (e) { return null; } };
const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }); res.end(body === undefined ? '' : JSON.stringify(body)); };
const sessionFor = async email => {
  let u = (await db.query(`select id, email from auth.users where email = $1`, [email])).rows[0];
  if (!u) u = (await db.query(`insert into auth.users(email) values ($1) returning id, email`, [email])).rows[0];
  const user = { id: u.id, email: u.email, aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: new Date().toISOString() };
  return { access_token: jwt(u.id, u.email), refresh_token: 'r-' + u.id, token_type: 'bearer', expires_in: 86400, expires_at: Math.floor(Date.now() / 1000) + 86400, user };
};
let queue = Promise.resolve();
http.createServer((req, res) => {
  let body = ''; req.on('data', c => body += c); req.on('end', () => { queue = queue.then(() => handle(req, res, body)).catch(e => send(res, 500, { message: String(e) })); });
}).listen(port, () => console.log('fake supabase on', port));
async function handle(req, res, body){
  if (req.method === 'OPTIONS') return send(res, 204);
  const url = new URL(req.url, 'http://x'), j = body ? JSON.parse(body) : {};
  if (url.pathname === '/auth/v1/otp') return send(res, 200, {});
  if (url.pathname === '/auth/v1/verify') { if (j.token !== '123456') return send(res, 403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' }); return send(res, 200, await sessionFor(j.email)); }
  if (url.pathname === '/auth/v1/user') { const uid = uidOf(req.headers.authorization); const u = (await db.query(`select id, email from auth.users where id = $1`, [uid])).rows[0]; return u ? send(res, 200, { id: u.id, email: u.email, aud: 'authenticated', role: 'authenticated' }) : send(res, 401, { msg: 'no user' }); }
  if (url.pathname === '/auth/v1/logout') return send(res, 204);
  if (url.pathname === '/test/events') return send(res, 200, (await db.query(`select kind, item_id, user_id is not null as signed_in, anon_id is not null as anon, platform from usage_events order by id`)).rows);
  if (url.pathname === '/test/sql') return send(res, 200, (await db.query(j.sql)).rows);
  const m = url.pathname.match(/^\/rest\/v1\/rpc\/(\w+)$/);
  if (m) {
    const fn = m[1], uid = uidOf(req.headers.authorization);
    await db.exec(`reset role; select set_config('test.uid', '${uid || ''}', false); set role ${uid ? 'authenticated' : 'anon'}`);
    const keys = Object.keys(j), args = keys.map((k, i) => `${k} => $${i + 1}${/json/.test(k) ? '::jsonb' : ''}`).join(', ');
    const vals = keys.map(k => (/json/.test(k) && j[k] != null) ? JSON.stringify(j[k]) : j[k]);
    try {
      const setof = ['get_picks'].includes(fn);
      const r = await db.query(setof ? `select * from public.${fn}(${args})` : `select public.${fn}(${args}) as r`, vals);
      await db.exec('reset role');
      return send(res, 200, setof ? r.rows : (r.rows[0] ? r.rows[0].r : null));
    } catch (e) { await db.exec('reset role'); return send(res, 400, { code: 'P0001', message: e.message, details: null, hint: null }); }
  }
  send(res, 404, { message: 'not mocked: ' + url.pathname });
}
