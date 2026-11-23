// Tests supabase/functions/apple-revoke (the same file Supabase runs) in Node, with Apple and Supabase faked.
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { webcrypto as wc } from 'node:crypto';
const repo = process.argv[2] || new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wfar-')), 'f.mjs');
fs.copyFileSync(repo + '/supabase/functions/apple-revoke/index.ts', tmp);
const F = await import(tmp);
let pass = 0, fail = 0; const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const kp = await wc.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const der = Buffer.from(await wc.subtle.exportKey('pkcs8', kp.privateKey)).toString('base64');
const pem = `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----`;
// client secret is a valid ES256 JWT for the right client
const cs = await F.clientSecret(await F.importP8(pem), 'io.github.oalwyn.weekendfetch', 'TEAM', 'KID', 1000);
const [h, b, s] = cs.split('.');
const valid = await wc.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, kp.publicKey, Buffer.from(s, 'base64url'), new TextEncoder().encode(h + '.' + b));
const hd = JSON.parse(Buffer.from(h, 'base64url')), pl = JSON.parse(Buffer.from(b, 'base64url'));
ok(valid && hd.alg === 'ES256' && hd.kid === 'KID', 'client secret: ES256 signature verifies');
ok(pl.iss === 'TEAM' && pl.sub === 'io.github.oalwyn.weekendfetch' && pl.aud === 'https://appleid.apple.com' && pl.exp - pl.iat === 300, 'client secret: claims');
// the whole flow with fake Supabase and Apple
const idTok = sub => 'x.' + Buffer.from(JSON.stringify({ sub })).toString('base64url') + '.y';
let calls = [], userResp, appleSub = 'apple-sub-1';
globalThis.fetch = async (url, o = {}) => {
  calls.push([String(url), o.body ? String(o.body) : '']);
  if (String(url).endsWith('/auth/v1/user')) return new Response(JSON.stringify(userResp), { status: userResp ? 200 : 401 });
  if (String(url).endsWith('/auth/token')) return new Response(JSON.stringify({ refresh_token: 'RT', access_token: 'AT', id_token: idTok(appleSub) }), { status: 200 });
  if (String(url).endsWith('/auth/revoke')) return new Response('', { status: 200 });
  return new Response('{}', { status: 404 });
};
const env = { APPLE_PRIVATE_KEY: pem, SUPABASE_URL: 'https://sb', SUPABASE_ANON_KEY: 'anon' };
const req = (body, origin = 'capacitor://localhost') => new Request('https://sb/functions/v1/apple-revoke', { method: 'POST', headers: { authorization: 'Bearer U', origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
const run = async (body, e = env) => { calls = []; const r = await F.handle(req(body), e); return [r.status, await r.json().catch(() => ({})), r]; };
userResp = { id: 'u1', identities: [{ provider: 'apple', identity_data: { sub: 'apple-sub-1' } }] };
let [st, js, r] = await run({ code: 'C1', client_id: 'io.github.oalwyn.weekendfetch' });
ok(st === 200 && js.revoked === true, 'revokes: ' + st + ' ' + JSON.stringify(js));
const rev = calls.find(c => c[0].endsWith('/auth/revoke'));
ok(rev && /token=RT/.test(rev[1]) && /token_type_hint=refresh_token/.test(rev[1]) && /client_id=io.github.oalwyn.weekendfetch/.test(rev[1]), 'revokes the refresh token for the app');
ok(r.headers.get('access-control-allow-origin') === 'capacitor://localhost', 'the iPhone app may call it');
appleSub = 'someone-else';
[st] = await run({ code: 'C1', client_id: 'io.github.oalwyn.weekendfetch' });
ok(st === 403 && !calls.some(c => c[0].endsWith('/auth/revoke')), 'never revokes an Apple ID that belongs to another account');
appleSub = 'apple-sub-1';
[st] = await run({ code: 'C1', client_id: 'com.evil.app' }); ok(st === 400, 'unknown client id refused');
userResp = { id: 'u2', identities: [{ provider: 'email', identity_data: {} }] };
[st] = await run({ code: 'C1', client_id: 'io.github.oalwyn.weekendfetch' }); ok(st === 400, 'email accounts: nothing to revoke');
userResp = null;
[st] = await run({ code: 'C1', client_id: 'io.github.oalwyn.weekendfetch' }); ok(st === 401, 'signed-out callers refused');
[st] = await run({ code: 'C1', client_id: 'io.github.oalwyn.weekendfetch' }, { ...env, APPLE_PRIVATE_KEY: '' }); ok(st === 503, 'says so when the key secret is missing');
const pre = await F.handle(new Request('https://sb/f', { method: 'OPTIONS', headers: { origin: 'capacitor://localhost' } }), env);
ok(pre.status === 204 && pre.headers.get('access-control-allow-origin') === 'capacitor://localhost', 'the app\'s pre-request (CORS) is answered');
console.log(`${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
