// Supabase Edge Function "apple-revoke" (v1.7, Nov 2026).
// When someone who signed in with Apple deletes their account, Apple asks apps to cancel ("revoke") that sign-in.
// The iPhone app asks Apple for a fresh authorization code at deletion time and sends it here; this function swaps the
// code for Apple's token and revokes it, so The Weekend Fetch disappears from the person's Apple ID ("Sign in with Apple").
//
// Secret (Supabase › Edge Functions › Secrets), set by the owner only:
//   APPLE_PRIVATE_KEY  the contents of the "Weekend Fetch Sign in with Apple" .p8 key file
// Not secret (defaults below, can be overridden with secrets of the same name): APPLE_TEAM_ID, APPLE_KEY_ID.
// Deployed from the Supabase dashboard (Edge Functions › apple-revoke). Written as plain JavaScript so
// supabase/tests/test_apple_revoke.mjs can run the same code in Node.

const TEAM_ID = (globalThis.Deno && Deno.env.get("APPLE_TEAM_ID")) || "6AUG5CZ27G";
const KEY_ID = (globalThis.Deno && Deno.env.get("APPLE_KEY_ID")) || "K8CGX45655";
// the iPhone app (bundle id) and the website (Services ID)
export const CLIENT_IDS = ["io.github.oalwyn.weekendfetch", "io.github.oalwyn.weekendfetch.web"];
const ORIGINS = ["capacitor://localhost", "https://localhost", "http://localhost", "https://theweekendfetch.com"];

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlJSON = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
export function jwtPayload(jwt) {
  const p = String(jwt || "").split(".")[1] || "";
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(p.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((p.length + 3) % 4)), (c) => c.charCodeAt(0))));
}
export async function importP8(pem) {
  const der = Uint8Array.from(atob(String(pem).replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}
// Apple's client secret: an ES256 JWT (WebCrypto's ECDSA signature is already the raw r||s form JWTs use)
export async function clientSecret(key, clientId, teamId = TEAM_ID, keyId = KEY_ID, now = Math.floor(Date.now() / 1000)) {
  const head = b64urlJSON({ alg: "ES256", kid: keyId, typ: "JWT" });
  const body = b64urlJSON({ iss: teamId, iat: now, exp: now + 300, aud: "https://appleid.apple.com", sub: clientId });
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(head + "." + body));
  return head + "." + body + "." + b64url(sig);
}

function reply(req, status, body) {
  const o = req.headers.get("origin") || "";
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers: {
    "content-type": "application/json",
    "access-control-allow-origin": ORIGINS.includes(o) ? o : ORIGINS[3],
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods": "POST, OPTIONS" } });
}

export async function handle(req, env = {}) {
  if (req.method === "OPTIONS") return reply(req, 204, {});
  if (req.method !== "POST") return reply(req, 405, { error: "POST only" });
  const pem = env.APPLE_PRIVATE_KEY, sbUrl = env.SUPABASE_URL, anon = env.SUPABASE_ANON_KEY;
  if (!pem) return reply(req, 503, { error: "not set up: add the APPLE_PRIVATE_KEY secret" });
  // who is asking: the signed-in person's own session
  const auth = req.headers.get("authorization") || "";
  // the site's public (publishable) key comes with the request; the older anon key is the fallback
  const ur = await fetch(sbUrl + "/auth/v1/user", { headers: { authorization: auth, apikey: req.headers.get("apikey") || anon } });
  if (!ur.ok) return reply(req, 401, { error: "sign in required" });
  const user = await ur.json();
  const apple = (user.identities || []).find((i) => i.provider === "apple");
  if (!apple) return reply(req, 400, { error: "this account doesn't use Sign in with Apple" });
  const appleSub = (apple.identity_data || {}).sub || apple.id || apple.provider_id;
  let j = {}; try { j = await req.json(); } catch (e) {}
  const code = String(j.code || ""), clientId = String(j.client_id || "");
  if (!code || code.length > 400 || !CLIENT_IDS.includes(clientId)) return reply(req, 400, { error: "bad request" });
  const secret = await clientSecret(await importP8(pem), clientId);
  const form = (o) => new URLSearchParams(o).toString(), hdr = { "content-type": "application/x-www-form-urlencoded" };
  const tr = await fetch("https://appleid.apple.com/auth/token", { method: "POST", headers: hdr,
    body: form({ client_id: clientId, client_secret: secret, code, grant_type: "authorization_code" }) });
  const tok = await tr.json().catch(() => ({}));
  if (!tr.ok || !(tok.refresh_token || tok.access_token)) return reply(req, 502, { error: "Apple didn't accept the code", apple: tok.error || tr.status });
  // only ever revoke the Apple sign-in that belongs to this account
  let sub = ""; try { sub = jwtPayload(tok.id_token).sub; } catch (e) {}
  if (!sub || sub !== appleSub) return reply(req, 403, { error: "that Apple ID belongs to a different account" });
  const useRefresh = !!tok.refresh_token;
  const rr = await fetch("https://appleid.apple.com/auth/revoke", { method: "POST", headers: hdr,
    body: form({ client_id: clientId, client_secret: secret, token: useRefresh ? tok.refresh_token : tok.access_token,
                 token_type_hint: useRefresh ? "refresh_token" : "access_token" }) });
  if (!rr.ok) return reply(req, 502, { error: "Apple didn't revoke", apple: rr.status });
  return reply(req, 200, { revoked: true });
}

if (globalThis.Deno) Deno.serve((req) => handle(req, {
  APPLE_PRIVATE_KEY: Deno.env.get("APPLE_PRIVATE_KEY"), SUPABASE_URL: Deno.env.get("SUPABASE_URL"), SUPABASE_ANON_KEY: Deno.env.get("SUPABASE_ANON_KEY"),
}).catch((e) => new Response(JSON.stringify({ error: String(e && e.message || e) }), { status: 500, headers: { "content-type": "application/json", "access-control-allow-origin": "*" } })));
