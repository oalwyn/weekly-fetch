/* ---------- shared "Our list" via Supabase (GitHub site) ---------- */
const SB_URL = "__SB_URL__";
const SB_KEY = "__SB_KEY__";
const SB_ON = /^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(SB_URL);
let LIST = null, ME = "", online = false, firstSync = true, syncing = false;
try { LIST = localStorage.getItem("wf-list"); ME = localStorage.getItem("wf-name") || ""; } catch(e) {}

// joining from an invite link: #list-<code>
(function joinFromLink(){
  const h = location.hash.slice(1);
  if (!h.startsWith("list-")) return;
  const c = h.slice(5);
  if (/^[a-z0-9]{16,40}$/.test(c)) {
    if (LIST === c) return;   // already on this list (e.g. opened from the home screen)
    LIST = c; try { localStorage.setItem("wf-list", c); } catch(e) {}
    importedMsg = "You've joined the shared list. Stars and locked-in plans now show up for everyone on this list.";
    state.view = "our-list";
  }
})();
function keepListInAddress(){
  if (!LIST) return;
  const want = "#list-" + LIST;
  try { if (location.hash !== want) history.replaceState(null, "", location.pathname + location.search + want); } catch(e) {}
}
keepListInAddress();

const qLoad = () => { try { return JSON.parse(localStorage.getItem("wf-queue") || "[]"); } catch(e) { return []; } };
const qSave = q => { try { localStorage.setItem("wf-queue", JSON.stringify(q)); } catch(e) {} };
const cacheSave = () => { try { localStorage.setItem("wf-cache", JSON.stringify([...picks.entries()])); localStorage.setItem("wf-lcache", JSON.stringify([...locks].map(([k,v])=>[k,[...v]]))); } catch(e) {} };
let queue = qLoad();

// show the last known shared list right away, even before the network answers
if (LIST && SB_ON) {
  try { const c = JSON.parse(localStorage.getItem("wf-cache") || "null"); if (c) picks = new Map(c); } catch(e) {}
  try { const c = JSON.parse(localStorage.getItem("wf-lcache") || "null"); locks = new Map((c||[]).map(([k,v])=>[k,new Set(v)])); } catch(e) { locks = new Map(); }
  shared = true; me = ME;
  for (const p of picks.values()) p.uids.forEach(u => names[u] = u);
  applyQueue(picks, locks);
}

async function rpc(fn, body){
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "apikey": SB_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(fn + " " + r.status);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
const LOCK = "__lock__";
function applyQueue(m, L){
  for (const op of queue){
    if (op.op === "lock" || op.op === "unlock"){
      if (L){ const s = L.get(op.id) || new Set(); op.op === "lock" ? s.add(op.k) : s.delete(op.k); if (s.size) L.set(op.id, s); else L.delete(op.id); }
      continue;
    }
    const p = m.get(op.id) || {uids: [], item: op.item || {id: op.id}};
    if (op.op === "add" && !p.uids.includes(ME)) p.uids.push(ME);
    if (op.op === "remove") p.uids = p.uids.filter(u => u !== ME);
    if (p.uids.length) m.set(op.id, p); else m.delete(op.id);
  }
}
async function flush(){
  while (queue.length){
    const op = queue[0];
    if (op.op === "lock") await rpc("add_pick", {p_list: LIST, p_item: op.id, p_who: LOCK + op.k, p_item_json: op.item || {id: op.id}});
    else if (op.op === "unlock") await rpc("remove_pick", {p_list: LIST, p_item: op.id, p_who: LOCK + op.k});
    else if (op.op === "add") await rpc("add_pick", {p_list: LIST, p_item: op.id, p_who: ME, p_item_json: op.item || {id: op.id}});
    else await rpc("remove_pick", {p_list: LIST, p_item: op.id, p_who: ME});
    queue.shift(); qSave(queue);
  }
}
function itemSnap(id){
  const e = DATA.find(d => d.id === id) || (picks.get(id) && picks.get(id).item) || {id};
  return {id: e.id || id, n: e.n || null, title: e.title || "", when: e.when || "", meta: e.meta || "", cat: e.cat || "evt", q: e.q || null, url: e.url || null, lat: e.lat ?? null, lon: e.lon ?? null};
}
const qKey = o => o.id + "|" + (o.k || "");
function queuePush(op){ queue = queue.filter(o => qKey(o) !== qKey(op)); queue.push(op); qSave(queue); }

async function sync(){
  if (!LIST || !SB_ON || syncing) return;   // reading works before you've given a name
  syncing = true;
  try {
    if (firstSync && localSaved.size && ME){
      // carry this phone's earlier stars into the shared list
      for (const id of localSaved) queuePush({op: "add", id, item: itemSnap(id)});
      localSaved.clear(); persistLocal();
    }
    await flush();
    const rows = await rpc("get_picks", {p_list: LIST}) || [];
    const m = new Map(), L = new Map();
    rows.forEach(r => {
      if (String(r.who).startsWith(LOCK)){ const s = L.get(r.item_id) || new Set(); s.add(r.who.slice(LOCK.length)); L.set(r.item_id, s); return; }
      if (!m.has(r.item_id)) m.set(r.item_id, {uids: [], item: r.item || {id: r.item_id}});
      const p = m.get(r.item_id); if (!p.uids.includes(r.who)) p.uids.push(r.who);
      names[r.who] = r.who;
    });
    applyQueue(m, L);
    picks = m; locks = L; shared = true; me = ME; online = true; firstSync = false;
    cacheSave();
  } catch(e) {
    online = false;
  } finally { syncing = false; }
  refreshStars();
}
function askName(){
  let n = "";
  try { n = (prompt("Your first name? (So your list shows who starred what.)", ME || "") || "").trim().slice(0, 30); } catch(e) {}
  if (!n) return false;
  ME = n; me = n; try { localStorage.setItem("wf-name", n); } catch(e) {}
  return true;
}
// stars: shared list when joined, this phone otherwise
async function toggleStar(id){
  if (!(LIST && SB_ON)){
    if (localSaved.has(id)){ localSaved.delete(id); locks.delete(id); persistLocks(); } else localSaved.add(id);
    persistLocal(); refreshStars(); return;
  }
  if (!ME && !askName()) return;
  shared = true; me = ME;
  const mine = starredByMe(id);
  queuePush({op: mine ? "remove" : "add", id, item: itemSnap(id)});
  // last star gone: clear its plans too
  if (mine && pickers(id).length <= 1) for (const k of (locks.get(id) || [])) queuePush({op: "unlock", id, k});
  applyQueue(picks, locks); cacheSave(); refreshStars();
  sync();
}
function setPlan(id, k){
  if (!(LIST && SB_ON)){ locks.delete(id); if (k) setLock(id, k, true); persistLocks(); refreshStars(); return; }
  for (const old of (locks.get(id) || [])) if (old !== k) queuePush({op: "unlock", id, k: old});
  if (k) queuePush({op: "lock", id, k, item: itemSnap(id)});
  applyQueue(picks, locks); cacheSave(); refreshStars();
  sync();
}
function toggleLock(id, k){ setPlan(id, isLocked(id, k) ? null : k); }
function newCode(){
  const a = "abcdefghijklmnopqrstuvwxyz0123456789", b = new Uint8Array(24);
  crypto.getRandomValues(b); return [...b].map(x => a[x % a.length]).join("");
}
const inviteLink = () => location.origin + location.pathname + "#list-" + LIST;

function renderOurList(){
  const {cur, gone} = ourListItems();
  let h = `<div class="ourhead">${importedMsg ? `<p class="okmsg">${esc(importedMsg)}</p>` : ""}`;
  if (SB_ON && !LIST){
    h += `<div class="setup"><strong>Plan weekends together</strong><p class="ournote">Start a shared plan that everyone in your household can see and add to. Stars and “Lock it in” sync across everyone’s phones automatically.</p><div class="btnrow"><button class="copybtn" data-startlist>Start our shared plans</button><button class="copybtn alt" data-joinpaste>I have an invite link</button></div></div>`;
    h += `<p class="ournote">Until then, stars are saved on this phone.</p>`;
    if (cur.length || gone.length) h += `<div class="btnrow"><button class="copybtn alt" data-copy>Copy as text</button></div>`;
  } else if (SB_ON && LIST){
    const st = !ME ? `<p class="status">● Shared list · tap a star to add your name</p>`
      : online ? `<p class="status ok">● Shared list · synced · you're ${esc(ME)}</p>`
      : `<p class="status">● Shared list · ${firstSync ? "connecting…" : "offline, your changes will sync when you're back online"}${ME ? ` · you're ${esc(ME)}` : ""}</p>`;
    h += st + `<div class="btnrow"><button class="copybtn" data-invite>Invite someone to plan</button><button class="copybtn alt" data-copy>Copy as text</button>${ME ? `<button class="copybtn alt" data-rename>Change name</button>` : ""}</div>`;
  } else {
    h += `<p class="ournote">Your stars are saved on this phone.</p>${cur.length || gone.length ? `<div class="btnrow"><button class="copybtn" data-sendlink>Share my picks</button><button class="copybtn alt" data-copy>Copy as text</button></div>` : ""}`;
  }
  h += `<div id="copyout"></div></div>`;
  if (!cur.length && !gone.length) return h + `<div class="empty">Nothing starred yet.<br>Tap the ☆ on any event and it lands here${LIST ? " for everyone on your list" : ""}.</div>`;
  return h + planHTML(cur, gone);
}
function copyOut(t, text, okMsg, label){
  const out = document.getElementById("copyout");
  const fallback = () => { out.innerHTML = `<p class="ournote">Copy this link and text it:</p><textarea class="copyarea" readonly rows="3"></textarea>`; const ta = out.querySelector("textarea"); ta.value = text; ta.focus(); ta.select(); };
  try { navigator.clipboard.writeText(text).then(() => { t.textContent = "Copied ✓"; out.innerHTML = `<p class="ournote">${okMsg}</p>`; setTimeout(() => t.textContent = label, 2500); }, fallback); } catch(e) { fallback(); }
}
document.addEventListener("click", ev => {
  const t = ev.target.closest("button"); if (!t) return;
  if (t.hasAttribute("data-startlist")){
    if (!ME && !askName()) return;
    LIST = newCode(); try { localStorage.setItem("wf-list", LIST); } catch(e) {}
    shared = true; me = ME; importedMsg = "Your shared list is ready. Tap “Invite someone to plan” and text them the link.";
    keepListInAddress(); render(); sync();
  } else if (t.hasAttribute("data-joinpaste")){
    let v = ""; try { v = prompt("Paste the invite link you were sent:") || ""; } catch(e) {}
    const m = v.match(/#list-([a-z0-9]{16,40})/) || v.trim().match(/^([a-z0-9]{16,40})$/);
    if (!m){ if (v) { importedMsg = "That doesn't look like an invite link. It should end in #list- followed by letters and numbers."; render(); } return; }
    LIST = m[1]; try { localStorage.setItem("wf-list", LIST); } catch(e) {}
    if (!ME) askName();
    shared = true; me = ME; importedMsg = "You've joined the shared list."; keepListInAddress(); render(); sync();
  } else if (t.hasAttribute("data-invite")){
    copyOut(t, inviteLink(), "Invite link copied. Text it to anyone you plan weekends with. When they open it, they join your plans, on a phone or a computer.", "Invite someone to plan");
  } else if (t.hasAttribute("data-rename")){
    const old = ME;
    if (askName() && ME !== old){
      // move my stars to the new name
      const mineIds = [...picks].filter(([id, p]) => p.uids.includes(old)).map(([id]) => id);
      (async () => { try { for (const id of mineIds){ await rpc("remove_pick", {p_list: LIST, p_item: id, p_who: old}); await rpc("add_pick", {p_list: LIST, p_item: id, p_who: ME, p_item_json: itemSnap(id)}); } } catch(e) {} sync(); })();
      render();
    }
  }
});
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sync(); });
setInterval(() => { if (document.visibilityState === "visible") sync(); }, 20000);

setTimeout(sync, 0);
