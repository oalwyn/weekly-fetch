/* ---------- v1.1: accounts and groups (Supabase Auth) ----------
   Inserted by build_gh.py after gh_sync.js and before the first render().
   - Signed out: everything works as before (stars on this device, or an old #list- shared plan).
   - Signed in with a group: stars and locked-in days live in the group (supabase/v1.1-groups.sql);
     the existing plan screens are fed through the same picks/locks/names/shared/me variables.
   - Functions are wrapped by reassignment (toggleStar, setPlan, renderOurList, sync), so the
     iPhone app's native_app.js can still wrap them afterwards. */
const ACCT = { client: null, loading: null, user: null, me: null, gid: null, group: null, members: [],
               ui: { step: "", email: "", panel: "", confirmDelete: false }, msg: "", err: "", busy: false, online: true };
const SB_REF = (SB_URL.split("//")[1] || "").split(".")[0];
const SB_AUTH_KEY = "sb-" + SB_REF + "-auth-token";
const IS_APP = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const LIVE_SITE = "https://theweekendfetch.com/";
const SB_LIB = "./vendor/supabase-2.118.0.js", QR_LIB = "./vendor/qrcode-1.4.4.js";
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };
const hasSession = () => !!lsGet(SB_AUTH_KEY);
const inGroup = () => !!(ACCT.user && ACCT.group);
ACCT.gid = lsGet("wf-gid");
const PENDING = { tokens: window.__wfTokens || null, join: window.__wfJoin || lsGet("wf-pending-join") };
if (PENDING.join) { lsSet("wf-pending-join", PENDING.join); state.view = "our-list"; }
if (window.__wfAuthError) { ACCT.err = "That sign-in link didn't work or has expired. Ask for a new code."; state.view = "our-list"; }

/* ---- usage counts: plain fetch, so signed-out visitors never download the Supabase library ---- */
let ANON = lsGet("wf-anon");
if (!ANON) { ANON = "a" + Math.random().toString(36).slice(2) + Date.now().toString(36); lsSet("wf-anon", ANON); }
function logEvent(kind, item){
  if (!SB_ON) return;
  let token = SB_KEY;
  try { const s = JSON.parse(lsGet(SB_AUTH_KEY) || "null"); if (s && s.access_token && s.expires_at * 1000 > Date.now()) token = s.access_token; } catch (e) {}
  try {
    fetch(`${SB_URL}/rest/v1/rpc/log_event`, { method: "POST", keepalive: true,
      headers: { apikey: SB_KEY, Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ p_kind: kind, p_item: item || null, p_group: inGroup() ? ACCT.group.id : null, p_anon: ANON, p_platform: IS_APP ? "ios" : "web" }) }).catch(() => {});
  } catch (e) {}
}
document.addEventListener("click", ev => {
  const a = ev.target.closest("a.lbtn"); if (!a) return;
  const card = a.closest("[id^=card-]"); const id = card ? card.id.slice(5) : null;
  logEvent(/maps/.test(a.href) ? "outbound_directions" : "outbound_more_info", id);
}, true);

/* ---- loading the Supabase client only when needed ---- */
function loadScript(src){
  return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("load " + src)); document.head.appendChild(s); });
}
function ensureClient(){
  if (ACCT.client) return Promise.resolve(ACCT.client);
  if (!ACCT.loading) ACCT.loading = loadScript(SB_LIB).then(() => {
    ACCT.client = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: "implicit", storageKey: SB_AUTH_KEY } });
    ACCT.client.auth.onAuthStateChange((ev) => { if (ev === "SIGNED_OUT") signedOutLocally(); });
    return ACCT.client;
  });
  return ACCT.loading;
}
async function call(fn, args){
  const c = await ensureClient();
  const { data, error } = await c.rpc(fn, args || {});
  if (error) throw new Error(error.message || String(error));
  return data;
}

/* ---- group state → the variables the existing plan screens read ---- */
function applyGroup(st){
  ACCT.group = st.group; ACCT.members = st.members || [];
  const m = new Map(), L = new Map(), nm = {};
  (st.members || []).forEach(x => nm[x.id] = x.name);
  (st.picks || []).forEach(p => {
    const uid = p.user_id || p.who; nm[uid] = p.name;
    if (!m.has(p.item_id)) m.set(p.item_id, { uids: [], item: p.item || { id: p.item_id } });
    const e = m.get(p.item_id); if (!e.uids.includes(uid)) e.uids.push(uid);
  });
  (st.locks || []).forEach(l => L.set(l.item_id, new Set([String(l.day).slice(0, 10)])));
  picks = m; locks = L; names = nm; shared = true; me = ACCT.user ? ACCT.user.id : me;
  lsSet("wf-gcache", JSON.stringify({ uid: ACCT.user && ACCT.user.id, gid: st.group.id, st }));
}
// show the last known group right away, before the network answers
(function useCache(){
  if (!SB_ON || !hasSession()) return;
  try {
    const c = JSON.parse(lsGet("wf-gcache") || "null");
    const s = JSON.parse(lsGet(SB_AUTH_KEY) || "null");
    if (c && s && s.user && c.uid === s.user.id && c.gid === ACCT.gid) { ACCT.user = s.user; applyGroup(c.st); }
  } catch (e) {}
})();

async function loadMe(){
  ACCT.me = await call("get_me");
  const ids = (ACCT.me.groups || []).map(g => g.id);
  if (!ids.includes(ACCT.gid)) ACCT.gid = ids[0] || null;
  lsSet("wf-gid", ACCT.gid);
  if (!ACCT.gid) { ACCT.group = null; leaveGroupMode(); }
}
function leaveGroupMode(){
  // back to this device's stars (or the old shared plan, which gh_sync handles)
  ACCT.group = null; lsSet("wf-gcache", null);
  picks = new Map(); names = {};
  locks = new Map(); try { const s = JSON.parse(localStorage.getItem("wf-locks") || "null"); if (s) locks = new Map(Object.entries(s).map(([k, v]) => [k, new Set(v)])); } catch (e) {}
  shared = !!(LIST && SB_ON); me = ME;
  if (LIST && SB_ON) { try { const c = JSON.parse(localStorage.getItem("wf-cache") || "null"); if (c) picks = new Map(c); } catch (e) {} }
}
let acctSyncing = false;
async function acctSync(){
  if (!ACCT.user || !ACCT.gid || acctSyncing) return;
  acctSyncing = true;
  try { applyGroup(await call("get_group", { p_group: ACCT.gid })); ACCT.online = true; }
  catch (e) {
    ACCT.online = false;
    if (/not a member/.test(e.message)) { await loadMe().catch(() => {}); if (ACCT.gid) return acctSync(); }
  } finally { acctSyncing = false; }
  safeRefresh();
}
// don't wipe a half-typed form when a background sync repaints the plans tab
function safeRefresh(){
  const a = document.activeElement;
  if (state.view === "our-list" && a && a.closest && a.closest(".acct") && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) return;
  refreshStars();
}

async function startAccounts(){
  if (!SB_ON) return;
  try {
    const c = await ensureClient();
    if (PENDING.tokens) { await c.auth.setSession(PENDING.tokens); PENDING.tokens = null; window.__wfTokens = null; }
    const { data } = await c.auth.getSession();
    ACCT.user = data.session ? data.session.user : null;
    if (!ACCT.user) { if (inGroup() || ACCT.group) leaveGroupMode(); safeRefresh(); return; }
    await loadMe();
    if (PENDING.join) await joinWithCode(PENDING.join, true);
    else if (ACCT.gid) await acctSync();
    safeRefresh();
  } catch (e) { ACCT.err = "Couldn't reach the shared plans service. Check your connection."; safeRefresh(); }
}
if (SB_ON && (hasSession() || PENDING.tokens || PENDING.join)) setTimeout(startAccounts, 0);

function signedOutLocally(){
  ACCT.user = null; ACCT.me = null; ACCT.gid = null; lsSet("wf-gid", null);
  leaveGroupMode(); ACCT.ui = { step: "", email: "", panel: "", confirmDelete: false }; safeRefresh();
}

/* ---- actions ---- */
const groupItem = id => itemSnap(id);
const _acctToggleStar = toggleStar;
toggleStar = async function(id){
  if (!inGroup()) { _acctToggleStar(id); if (starredByMe(id)) logEvent("star", id); return; }
  const mine = starredByMe(id), uid = ACCT.user.id, p = picks.get(id) || { uids: [], item: groupItem(id) };
  p.uids = mine ? p.uids.filter(u => u !== uid) : p.uids.concat(uid);
  if (p.uids.length) picks.set(id, p); else { picks.delete(id); locks.delete(id); }
  refreshStars();
  try {
    if (mine) await call("remove_group_pick", { p_group: ACCT.gid, p_item: id });
    else { await call("add_group_pick", { p_group: ACCT.gid, p_item: id, p_item_json: groupItem(id) }); logEvent("star", id); }
  } catch (e) { ACCT.online = false; }
  acctSync();
};
const _acctSetPlan = setPlan;
setPlan = async function(id, k){
  if (!inGroup()) { _acctSetPlan(id, k); if (k) logEvent("lock", id); return; }
  if (k) locks.set(id, new Set([k])); else locks.delete(id);
  refreshStars();
  try { await call("set_group_lock", { p_group: ACCT.gid, p_item: id, p_day: k || null, p_item_json: groupItem(id) }); if (k) logEvent("lock", id); }
  catch (e) { ACCT.online = false; }
  acctSync();
};
const _acctSync = sync;
sync = function(){ return inGroup() ? acctSync() : _acctSync(); };

async function joinWithCode(code, fromLink){
  const g = await call("join_group", { p_code: code });
  lsSet("wf-pending-join", null); PENDING.join = null; window.__wfJoin = null;
  if (g && g.error) { ACCT.err = fromLink ? "That invite link has expired or was changed. Ask for a new one." : "No group has that code. Check the 6 characters and try again."; return false; }
  ACCT.gid = g.id; lsSet("wf-gid", g.id); await loadMe(); await acctSync();
  ACCT.msg = `You've joined “${g.name}”. Stars and locked-in days now sync with everyone in it.`; ACCT.err = "";
  ACCT.ui.panel = ""; logEvent("join_group"); return true;
}
const inviteLink2 = () => LIVE_SITE + "join/?c=" + encodeURIComponent(ACCT.group ? ACCT.group.code : "");
async function shareInvite(btn){
  const link = inviteLink2(), text = `Plan weekends with me on The Bay Area Weekend Fetch. Join our group “${ACCT.group.name}”: ${link} (or enter code ${ACCT.group.code})`;
  logEvent("share_invite");
  const SH = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Share;
  if (IS_APP && SH) { try { await SH.share({ title: "Plan weekends with me", text: `Join our group “${ACCT.group.name}” on Bay Fetch (code ${ACCT.group.code}):`, url: link, dialogTitle: "Invite someone" }); } catch (e) {} return; }
  if (navigator.share) { try { await navigator.share({ title: "Plan weekends with me", text, url: link }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
  try { await navigator.clipboard.writeText(text); btn.textContent = "Invite copied ✓"; setTimeout(() => btn.textContent = "Share invite", 2500); }
  catch (e) { ACCT.ui.panel = "invite"; refreshStars(); }
}
function qrSVG(text){
  if (!window.qrcode) return "";
  const q = window.qrcode(0, "M"); q.addData(text); q.make();
  return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

/* ---- the plans tab header ---- */
const ae = s => esc(s);
function acctCard(inner, cls){ return `<div class="setup acct${cls ? " " + cls : ""}">${inner}</div>`; }
function signInHTML(){
  const appleBtn = IS_APP && window.WF_APPLE_SIGNIN ? `<button class="copybtn apple" data-acct="apple"><span class="alogo" aria-hidden="true">&#xF8FF;</span> Sign in with Apple</button>` : "";
  if (ACCT.ui.step === "code") return acctCard(`<strong>Check your email</strong>
    <p class="ournote">We sent a 6-digit code to <b>${ae(ACCT.ui.email)}</b>. Enter it here${IS_APP ? "" : ", or tap the link in the email on this device"}.</p>
    <form class="acctform" data-acctform="verify"><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="123456" aria-label="6-digit code" required>
    <button class="copybtn" ${ACCT.busy ? "disabled" : ""}>Sign in</button></form>
    <button class="linkbtn" data-acct="restart">Use a different email</button>`);
  return acctCard(`<strong>Plan weekends together</strong>
    <p class="ournote">Sign in to start a group for your household or friends, or to join one you were invited to. Stars and “Lock it in” sync across everyone's phones. Browsing never needs an account.</p>
    ${appleBtn}
    <form class="acctform" data-acctform="email"><input name="email" type="email" autocomplete="email" placeholder="you@example.com" aria-label="Email address" value="${ae(ACCT.ui.email)}" required>
    <button class="copybtn ${appleBtn ? "alt" : ""}" ${ACCT.busy ? "disabled" : ""}>Email me a sign-in code</button></form>
    <p class="ournote small">No password. We'll email you a 6-digit code.</p>`);
}
function nameHTML(){
  return acctCard(`<strong>What should we call you?</strong>
    <p class="ournote">Your first name shows next to the events you star, so your group knows who picked what.</p>
    <form class="acctform" data-acctform="name"><input name="name" maxlength="30" autocomplete="given-name" placeholder="First name" aria-label="First name" value="${ae(ME || "")}" required>
    <button class="copybtn">Continue</button></form>`);
}
function startGroupHTML(){
  const legacy = LIST && SB_ON && lsGet("wf-list-converted") !== LIST;
  const nPicks = legacy ? [...picks.keys()].length : 0;
  return acctCard(`${legacy ? `<strong>Move your shared plan into a group</strong>
      <p class="ournote">Your current shared plan${nPicks ? ` (${nPicks} starred)` : ""} can become a group, keeping every star and locked-in day. Others on it will be asked to do the same when they sign in.</p>
      <form class="acctform" data-acctform="convert"><input name="gname" maxlength="40" value="Our weekend plans" aria-label="Group name"><button class="copybtn">Move it into a group</button></form>
      <div class="acctor">or</div>` : ""}
    <strong>${legacy ? "Start a new group" : "Start a group"}</strong>
    <form class="acctform" data-acctform="create"><input name="gname" maxlength="40" placeholder="e.g. Our household" aria-label="Group name" required><button class="copybtn ${legacy ? "alt" : ""}">Create group</button></form>
    <strong>Join a group</strong>
    <form class="acctform" data-acctform="join"><input name="code" maxlength="8" autocapitalize="characters" autocomplete="off" placeholder="6-letter code" aria-label="Join code" required><button class="copybtn alt">Join</button></form>`);
}
function groupBarHTML(){
  const gs = (ACCT.me && ACCT.me.groups) || [];
  const sw = gs.length > 1 ? `<select class="gsel" data-gswitch aria-label="Switch group">${gs.map(g => `<option value="${ae(g.id)}"${g.id === ACCT.gid ? " selected" : ""}>${ae(g.name)}</option>`).join("")}</select>` : `<span class="gname">${ae(ACCT.group.name)}</span>`;
  const st = ACCT.online ? `<span class="status ok">● synced · you're ${ae((ACCT.me && ACCT.me.name) || "")}</span>` : `<span class="status">● offline · changes will sync when you're back online</span>`;
  let h = `<div class="acct gbar"><div class="gtop">${sw}${st}</div>
    <div class="btnrow"><button class="copybtn" data-acct="invite">Invite someone</button><button class="copybtn alt" data-copy>Copy as text</button><button class="copybtn alt" data-acct="settings" aria-expanded="${ACCT.ui.panel === "settings"}">Group &amp; account</button></div>`;
  if (ACCT.ui.panel === "invite") h += invitePanelHTML();
  if (ACCT.ui.panel === "settings") h += settingsHTML();
  if (ACCT.ui.panel === "add") h += `<div class="apanel">${startGroupHTML()}</div>`;
  return h + `</div>`;
}
function invitePanelHTML(){
  const link = inviteLink2();
  return `<div class="apanel invite"><p class="ournote">Anyone with this link or code can join “${ae(ACCT.group.name)}”. They'll need to sign in.</p>
    <div class="icode" aria-label="Join code">${ae(ACCT.group.code)}</div>
    <div class="qr">${qrSVG(link)}</div>
    <p class="ilink">${ae(link)}</p>
    <div class="btnrow"><button class="copybtn" data-acct="share">Share invite</button><button class="copybtn alt" data-acct="close">Done</button></div></div>`;
}
function settingsHTML(){
  const owner = ACCT.group && (ACCT.me.groups.find(g => g.id === ACCT.gid) || {}).role === "owner";
  const members = ACCT.members.map(m => `<li>${ae(m.name)}${m.id === ACCT.user.id ? " (you)" : ""}${m.role === "owner" ? ' <span class="tag">owner</span>' : ""}</li>`).join("");
  const del = ACCT.ui.confirmDelete
    ? `<p class="ournote warn">This permanently deletes your account and your name and stars in every group. Groups you're in stay for the other members. This can't be undone.</p>
       <div class="btnrow"><button class="copybtn danger" data-acct="delete-yes">Delete my account permanently</button><button class="copybtn alt" data-acct="delete-no">Cancel</button></div>`
    : `<button class="linkbtn danger" data-acct="delete">Delete my account…</button>`;
  return `<div class="apanel"><div class="fsec">Your name</div>
    <form class="acctform" data-acctform="rename-me"><input name="name" maxlength="30" value="${ae(ACCT.me.name || "")}" aria-label="Your name"><button class="copybtn alt">Save</button></form>
    <div class="fsec">Group name</div>
    <form class="acctform" data-acctform="rename-group"><input name="gname" maxlength="40" value="${ae(ACCT.group.name)}" aria-label="Group name"><button class="copybtn alt">Save</button></form>
    <div class="fsec">Members</div><ul class="members">${members}</ul>
    <div class="fsec">Join code: <b>${ae(ACCT.group.code)}</b>${owner ? ` <button class="linkbtn" data-acct="newcode">Make a new code</button>` : ""}</div>
    ${owner ? `<p class="ournote small">A new code stops old invite links from working. Current members stay.</p>` : ""}
    <div class="btnrow"><button class="copybtn alt" data-acct="add">Start or join another group</button><button class="copybtn alt" data-acct="leave">Leave this group</button><button class="copybtn alt" data-acct="signout">Sign out</button></div>
    <div class="fsec">Account</div>${del}</div>`;
}

const _acctRenderOurList = renderOurList;
renderOurList = function(){
  if (!SB_ON) return _acctRenderOurList();
  if (!ACCT.client && !ACCT.loading) setTimeout(() => ensureClient().catch(() => {}), 0);   // warm up for a quick sign-in
  const msgs = `${ACCT.msg ? `<p class="okmsg">${ae(ACCT.msg)}</p>` : ""}${ACCT.err ? `<p class="errmsg">${ae(ACCT.err)}</p>` : ""}`;
  if (inGroup()){
    const { cur, gone } = ourListItems();
    let h = `<div class="ourhead">${msgs}${groupBarHTML()}<div id="copyout"></div></div>`;
    if (!cur.length && !gone.length) return h + `<div class="empty">Nothing starred yet in “${ae(ACCT.group.name)}”.<br>Tap the ☆ on any event and it lands here for everyone in the group.</div>`;
    return h + planHTML(cur, gone);
  }
  // not in a group: sign-in / name / start-or-join card, then today's plans (this device or the old shared plan)
  let card = "";
  if (!ACCT.user) card = (PENDING.join || lsGet("wf-pending-join") ? `<p class="okmsg">You've been invited to a group. Sign in to join it.</p>` : "") + signInHTML();
  else if (ACCT.me && !ACCT.me.name) card = nameHTML();
  else if (ACCT.me) card = startGroupHTML() + `<p class="ournote small">Signed in as ${ae(ACCT.user.email || "you")} · <button class="linkbtn" data-acct="signout">Sign out</button></p>`;
  else card = acctCard(`<p class="ournote">Signing you in…</p>`);
  let old = _acctRenderOurList();
  // retire the old "start an anonymous shared plan" card; existing old shared plans keep working
  old = old.replace(/<div class="setup">[\s\S]*?<\/div><\/div>\s*<p class="ournote">Until then, stars are saved on this phone\.<\/p>/, `<p class="ournote">Until you join a group, stars are saved on this device.</p>`);
  return old.replace('<div class="ourhead">', `<div class="ourhead">${msgs}${card}`);
};

/* ---- buttons and forms ---- */
document.addEventListener("click", async ev => {
  const b = ev.target.closest("[data-acct]"); if (!b) return;
  const a = b.dataset.acct; ACCT.msg = ""; ACCT.err = "";
  try {
    if (a === "restart") ACCT.ui.step = "";
    else if (a === "apple") { if (await window.WF_APPLE_SIGNIN() !== false) await afterSignIn(); }
    else if (a === "invite") { await loadScript(QR_LIB).catch(() => {}); ACCT.ui.panel = ACCT.ui.panel === "invite" ? "" : "invite"; }
    else if (a === "share") return shareInvite(b);
    else if (a === "close") ACCT.ui.panel = "";
    else if (a === "settings") { ACCT.ui.panel = ACCT.ui.panel === "settings" ? "" : "settings"; ACCT.ui.confirmDelete = false; }
    else if (a === "add") ACCT.ui.panel = "add";
    else if (a === "newcode") { await call("rotate_join_code", { p_group: ACCT.gid }); await loadMe(); await acctSync(); ACCT.msg = "New join code made. Old invite links no longer work."; }
    else if (a === "leave") {
      const name = ACCT.group.name; await call("leave_group", { p_group: ACCT.gid });
      ACCT.gid = null; lsSet("wf-gid", null); ACCT.ui.panel = ""; await loadMe(); if (ACCT.gid) await acctSync();
      ACCT.msg = `You left “${name}”.`;
    }
    else if (a === "signout") { const c = await ensureClient(); await c.auth.signOut(); signedOutLocally(); ACCT.msg = "Signed out. Your stars on this device are still here."; }
    else if (a === "delete") ACCT.ui.confirmDelete = true;
    else if (a === "delete-no") ACCT.ui.confirmDelete = false;
    else if (a === "delete-yes") {
      await call("delete_my_account");
      const c = await ensureClient(); await c.auth.signOut().catch(() => {});
      lsSet(SB_AUTH_KEY, null); signedOutLocally(); ACCT.msg = "Your account has been deleted.";
    }
  } catch (e) { ACCT.err = friendly(e); }
  refreshStars();
});
document.addEventListener("change", async ev => {
  if (!ev.target.matches("select[data-gswitch]")) return;
  ACCT.gid = ev.target.value; lsSet("wf-gid", ACCT.gid); ACCT.ui.panel = ""; ACCT.msg = ""; await acctSync();
});
document.addEventListener("submit", async ev => {
  const f = ev.target.closest("form[data-acctform]"); if (!f) return;
  ev.preventDefault(); const kind = f.dataset.acctform, v = n => (f.elements[n] ? f.elements[n].value : "").trim();
  ACCT.msg = ""; ACCT.err = ""; ACCT.busy = true; refreshStars();
  try {
    const c = await ensureClient();
    if (kind === "email") {
      ACCT.ui.email = v("email");
      const { error } = await c.auth.signInWithOtp({ email: ACCT.ui.email, options: { shouldCreateUser: true, emailRedirectTo: IS_APP ? LIVE_SITE : location.origin + location.pathname } });
      if (error) throw error;
      ACCT.ui.step = "code";
    } else if (kind === "verify") {
      const { error } = await c.auth.verifyOtp({ email: ACCT.ui.email, token: v("code").replace(/\D/g, ""), type: "email" });
      if (error) throw error;
      await afterSignIn();
    } else if (kind === "name") {
      await call("set_my_name", { p_name: v("name") }); ME = v("name"); lsSet("wf-name", ME); await loadMe();
      const pj = PENDING.join || lsGet("wf-pending-join");    // finish an invite that was waiting for a name
      if (pj) await joinWithCode(pj, true);
    }
    else if (kind === "rename-me") { await call("set_my_name", { p_name: v("name") }); await loadMe(); await acctSync(); ACCT.msg = "Name saved."; }
    else if (kind === "rename-group") { await call("rename_group", { p_group: ACCT.gid, p_name: v("gname") }); await loadMe(); await acctSync(); ACCT.msg = "Group renamed."; }
    else if (kind === "create") {
      const g = await call("create_group", { p_name: v("gname") });
      ACCT.gid = g.id; lsSet("wf-gid", g.id); await loadMe(); await acctSync(); ACCT.ui.panel = "invite"; await loadScript(QR_LIB).catch(() => {});
      ACCT.msg = `“${g.name}” is ready. Invite people with the link, the QR code or the code ${g.code}.`; logEvent("create_group");
    } else if (kind === "join") { await joinWithCode(v("code"), false); }
    else if (kind === "convert") {
      const g = await call("convert_legacy_list", { p_list: LIST, p_group_name: v("gname"), p_my_old_name: ME || "" });
      lsSet("wf-list-converted", LIST);
      ACCT.gid = g.id; lsSet("wf-gid", g.id); await loadMe(); await acctSync();
      ACCT.msg = `Your shared plan is now the group “${g.name}”. Invite the others with code ${g.code}, or they can move it over when they sign in.`;
    }
  } catch (e) { ACCT.err = friendly(e); }
  ACCT.busy = false; refreshStars();
});
async function afterSignIn(){
  const c = await ensureClient(); const { data } = await c.auth.getSession();
  ACCT.user = data.session && data.session.user; if (!ACCT.user) throw new Error("sign-in didn't finish");
  ACCT.ui.step = ""; logEvent("sign_in");
  await loadMe();
  if (!ACCT.me.name && ME) { await call("set_my_name", { p_name: ME }).catch(() => {}); await loadMe(); }
  const pj = PENDING.join || lsGet("wf-pending-join");
  if (pj && ACCT.me.name) await joinWithCode(pj, true);
  else if (ACCT.gid) await acctSync();
  ACCT.msg = ACCT.msg || (ACCT.gid ? "" : "You're signed in.");
}
function friendly(e){
  const m = String((e && e.message) || e);
  if (/AuthorizationError|AuthenticationServices|Apple didn't return/i.test(m)) return "Sign in with Apple didn't finish. Check that you're signed in to your Apple Account in Settings, or use your email instead.";
  if (/rate limit|too many/i.test(m)) return "Too many tries. Please wait a few minutes and try again.";
  if (/expired|invalid/i.test(m) && /otp|token|code/i.test(m)) return "That code didn't work or has expired. Check the email or ask for a new code.";
  if (/sign in required|JWT/i.test(m)) return "Please sign in again.";
  if (/Failed to fetch|NetworkError|load \.\//i.test(m)) return "Couldn't reach the server. Check your connection and try again.";
  return m.replace(/^.*?:\s*/, "").slice(0, 160);
}
setInterval(() => { if (document.visibilityState === "visible" && inGroup()) acctSync(); }, 20000);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && inGroup()) acctSync(); });
logEvent("app_open");
