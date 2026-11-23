
/* ---------- sharing (Nov 2026): event links, "Invite someone", "Share our weekend" ----------
   - An event link is <city page>?e=<event id>&s=<share code>. The share code is 8 random letters made for that one share:
     it isn't tied to the person, an account or a group, and it opens nothing private. It only lets the dashboard match
     a landing to the share that made it (it arrives as the session's campaign, source "share").
   - The recipient sees that event pinned at the top (or, if it's over, a note and a few upcoming ones like it).
   - "Share our weekend" draws a card from one photo on the phone itself; the photo is never uploaded.
   - We record that a share sheet was opened, never that something was posted. */
const SHARE_ALPHA = "abcdefghijkmnpqrstuvwxyz23456789";
const newShareCode = () => { try { return Array.from(crypto.getRandomValues(new Uint8Array(8)), b => SHARE_ALPHA[b % 32]).join(""); } catch (e) { return Math.random().toString(36).slice(2, 10); } };
// phase 2: links go to the event's own small page (e/<id>/, made by src/tools/event_pages.py) so link previews show the event;
// that page forwards to the city page with the event pinned. Ids that can't be a folder name keep the old ?e= link.
const eventLink = (e, code) => /^[a-z0-9][a-z0-9-]{1,99}$/.test(e.id)
  ? new URL(PAGE_URL).origin + "/e/" + e.id + "/" + (code ? "?s=" + code : "")
  : PAGE_URL + "?e=" + encodeURIComponent(e.id) + (code ? "&s=" + code : "");
const IN_APP = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const shareTrack = (name, d) => { try { if (typeof track === "function") track(name, d); } catch (e) {} };

/* --- 1. someone opened a shared event link --- */
const SHARED_IN = (() => {
  try {
    const p = new URLSearchParams(location.search), id = p.get("e");
    if (!id) return null;
    let firstVisit = false; try { firstVisit = !localStorage.getItem("wf-seen"); } catch (e) {}
    return { id: id.slice(0, 100), code: (p.get("s") || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12), firstVisit };
  } catch (e) { return null; }
})();
try { localStorage.setItem("wf-seen", "1"); } catch (e) {}
state.pin = SHARED_IN ? SHARED_IN.id : null;
if (SHARED_IN) {
  state.view = "events";
  setTimeout(() => {
    const e = DATA.find(x => x.id === SHARED_IN.id);
    shareTrack("share_link_landed", { item_id: SHARED_IN.id, placement: "shared_link", props: { found: !!e, past: !!(e && isPast(e)), new_visitor: SHARED_IN.firstVisit } });
  }, 1500);
}
function pinnedHTML(){
  if (!state.pin || state.view !== "events") return "";
  const e = DATA.find(x => x.id === state.pin);
  const close = `<button class="pinx" data-unpin aria-label="Hide this">×</button>`;
  const app = IN_APP() ? "" : `<p class="ournote pinapp">Fetch is also a free app: <a href="https://apps.apple.com/app/id6833697642" target="_blank" rel="noopener" data-k="app_store" data-ev="share_landing">App Store</a> · <a href="https://play.google.com/store/apps/details?id=io.github.oalwyn.weekendfetch" target="_blank" rel="noopener" data-k="app_store" data-ev="share_landing">Google Play</a>. No need to install it to see this.</p>`;
  if (e && !isPast(e)) return `<section class="pinned"><div class="pinh"><span>Shared with you</span>${close}</div>${cardHTML(e, false, "", "pincard")}${app}</section>`;
  // over, or no longer listed: say so and offer a few upcoming ones like it
  const like = DATA.filter(x => x.id !== state.pin && !isPast(x) && x.cat !== "walk" && x.cat !== "prog" && (!e || x.cat === e.cat))
    .map(x => ({ x, d: e && e.lat != null && x.lat != null ? miles(e.lat, e.lon, x.lat, x.lon) : 999, s: startOf(x) || new Date(2100, 0, 1) }))
    .sort((a, b) => a.d - b.d || a.s - b.s).slice(0, 3).map(o => o.x);
  const what = e ? `<strong>${esc(e.title)}</strong> has finished.` : `The event in this link isn't in the current list any more. It has probably finished.`;
  return `<section class="pinned"><div class="pinh"><span>Shared with you</span>${close}</div><p class="pinover">${what}${like.length ? " Here are a few coming up like it:" : ""}</p>${like.map(x => cardHTML(x)).join("")}${app}</section>`;
}

/* buttons on each card: Invite (upcoming events), Share our weekend (a locked-in day that has come, or a past pick) */
const SHARE_ITEMS = new Map();
function shareBtnHTML(e, gone){
  if (!e || e.cat === "walk") return "";
  const k = typeof lockKey === "function" ? lockKey(e.id) : null;
  if (gone || (k && parseD(k) <= TODAY)) { SHARE_ITEMS.set(e.id, e); return `<button class="lbtn" data-memory="${esc(e.id)}">Share our weekend</button>`; }
  if (isPast(e)) return "";
  return `<button class="lbtn" data-evinvite="${esc(e.id)}">Invite</button>`;
}

/* --- 2. Invite someone --- */
const OPENERS = ["Anyone up for this?", "Fancy this?", "Something for the weekend?"];
let SHR = null;   // the open share panel: {kind, e, code, ...}
const shPlace = e => (metaText(e) || "").split(" · ")[0].trim();
const priceLine = e => e.price === "free" ? "Free" : e.price === "tickets" ? "Tickets needed" : "";
function inviteText(e, opener){
  return [opener, "", e.title, whenText(e), shPlace(e), priceLine(e)].filter((x, i) => x || i === 1).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
function openInvite(id){
  const e = DATA.find(x => x.id === id);
  if (!e || isPast(e)) return;
  SHR = { kind: "invite", e, code: newShareCode(), opener: OPENERS[0] };
  SHR.text = inviteText(e, SHR.opener);
  shareTrack("share_opened", { item_id: e.id, props: { kind: "invite", code: SHR.code } });
  drawShare();
}
function inviteHTML(){
  const e = SHR.e, url = eventLink(e, SHR.code);
  return `<div class="shhead"><strong>Invite someone</strong><button class="shx" data-shclose aria-label="Close">×</button></div>
  <div class="fwrap shopen">${OPENERS.map(o => `<button class="chip" data-shopener="${esc(o)}" aria-pressed="${SHR.opener === o}">${esc(o)}</button>`).join("")}</div>
  <label class="shlab" for="shtext">Your message (change it if you like)</label>
  <textarea id="shtext" class="shtext" rows="6">${esc(SHR.text)}</textarea>
  <p class="shlink">${esc(url.replace(/^https?:\/\//, ""))}</p>
  <div class="btnrow"><button class="copybtn" data-shgo>Share</button><button class="copybtn alt" data-shcopy>Copy link</button></div>
  <p class="ournote small">This shares a public event page. It doesn't add them to your plans or show your name. To plan it together, invite them to your group in Our Plans.</p>
  <p class="ournote shmsg" id="shmsg"></p>`;
}
async function inviteGo(){
  const e = SHR.e, url = eventLink(e, SHR.code), text = (document.getElementById("shtext") || {}).value || SHR.text;
  const P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Share;
  if (IN_APP() && P) {
    shareTrack("share_destination_opened", { item_id: e.id, props: { kind: "invite", channel: "share_sheet" } });
    try { await P.share({ title: e.title, text, url, dialogTitle: "Invite someone" }); } catch (x) {}
    return;
  }
  if (navigator.share) {
    shareTrack("share_destination_opened", { item_id: e.id, props: { kind: "invite", channel: "web_share" } });
    try { await navigator.share({ title: e.title, text, url }); } catch (x) {}
    return;
  }
  copyText(text + "\n" + url, "Invite copied. Paste it into a message.");
  shareTrack("share_destination_opened", { item_id: e.id, props: { kind: "invite", channel: "copy_link" } });
}
function copyText(t, ok){
  const msg = document.getElementById("shmsg");
  const done = () => { if (msg) msg.textContent = ok; };
  const fallback = () => { if (msg) { msg.textContent = "Copy this:"; const ta = document.createElement("textarea"); ta.className = "copyarea"; ta.rows = 3; ta.readOnly = true; ta.value = t; msg.appendChild(ta); ta.select(); } };
  try { navigator.clipboard.writeText(t).then(done, fallback); } catch (x) { fallback(); }
}

/* --- 3. Share our weekend: one photo, two templates, drawn on the phone --- */
const MEMO_HEADS = ["A weekend well spent.", "We fetched the weekend"];
function openMemory(id){
  const e = SHARE_ITEMS.get(id) || DATA.find(x => x.id === id);
  if (!e) return;
  shareTrack("share_opened", { item_id: e.id, props: { kind: "memory" } });
  const inp = document.createElement("input");
  inp.type = "file"; inp.accept = "image/*"; inp.style.display = "none";
  inp.onchange = () => {
    const f = inp.files && inp.files[0]; inp.remove();
    if (!f) return;
    const img = new Image(), u = URL.createObjectURL(f);
    img.onload = () => {
      SHR = { kind: "memory", e, img, url: u, code: newShareCode(), tpl: "a", head: MEMO_HEADS[0], show: { head: true, name: true, when: true, credit: true } };
      drawShare(); paintCard();
    };
    img.onerror = () => { URL.revokeObjectURL(u); alert("That photo couldn't be opened. Try another one."); };
    img.src = u;
  };
  document.body.appendChild(inp); inp.click();
}
const memoWhen = e => { const k = typeof lockKey === "function" ? lockKey(e.id) : null; return k ? dayLabel(k) : String(whenText(e)).split(" · ")[0]; };
function memoryHTML(){
  const s = SHR.show, tog = (k, t) => `<label class="shtog"><input type="checkbox" data-shshow="${k}"${s[k] ? " checked" : ""}> ${t}</label>`;
  const canFiles = IN_APP() || (navigator.canShare && (() => { try { return navigator.canShare({ files: [new File([""], "x.jpg", { type: "image/jpeg" })] }); } catch (x) { return false; } })());
  return `<div class="shhead"><strong>Share our weekend</strong><button class="shx" data-shclose aria-label="Close">×</button></div>
  <div class="shcanvas"><canvas id="shcv" width="1080" height="1920" aria-label="Preview of your card"></canvas></div>
  <div class="dseg shtpl" role="group" aria-label="Style"><button data-shtpl="a" aria-pressed="${SHR.tpl === "a"}">Photo</button><button data-shtpl="b" aria-pressed="${SHR.tpl === "b"}">With a headline</button></div>
  ${SHR.tpl === "b" ? `<div class="fwrap shopen">${MEMO_HEADS.map(h => `<button class="chip" data-shhead="${esc(h)}" aria-pressed="${SHR.head === h}">${esc(h)}</button>`).join("")}</div>` : ""}
  <div class="shtogs">${SHR.tpl === "b" ? tog("head", "Headline") : ""}${tog("name", "Event name")}${tog("when", "Date and place")}${tog("credit", "Weekend Fetch credit")}</div>
  <div class="btnrow">${canFiles ? `<button class="copybtn" data-shimg>${IN_APP() ? "Share or save" : "Share image"}</button>` : ""}${IN_APP() ? "" : `<button class="copybtn${canFiles ? " alt" : ""}" data-shsave>Save image</button>`}<button class="copybtn alt" data-shcopy>Copy event link</button></div>
  <p class="ournote small">Your photo stays on this phone; we never upload or keep it. Posting to Instagram? Save the image, then add Instagram's link sticker and paste the event link.</p>
  <p class="ournote shmsg" id="shmsg"></p>`;
}
function wrapLines(ctx, text, maxW){
  const words = String(text).split(/\s+/), out = []; let line = "";
  for (const w of words) { const t = line ? line + " " + w : w; if (ctx.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
  if (line) out.push(line); return out.slice(0, 3);
}
function paintCard(){
  const cv = document.getElementById("shcv"); if (!cv || !SHR || SHR.kind !== "memory") return;
  const ctx = cv.getContext("2d"), W = 1080, H = 1920, img = SHR.img, s = SHR.show, e = SHR.e;
  // photo fills the card (cropped from the centre)
  const r = Math.max(W / img.naturalWidth, H / img.naturalHeight), iw = img.naturalWidth * r, ih = img.naturalHeight * r;
  ctx.fillStyle = "#14304D"; ctx.fillRect(0, 0, W, H);
  ctx.drawImage(img, (W - iw) / 2, (H - ih) / 2, iw, ih);
  // text sits above the bottom 300px and inside 90px sides, clear of Story buttons and reply bars
  const X = 90, maxW = W - 2 * X, bottom = H - 300;
  const lines = [];
  if (SHR.tpl === "b" && s.head) { ctx.font = "800 84px 'Bricolage Grotesque', Inter, sans-serif"; wrapLines(ctx, SHR.head, maxW).forEach(t => lines.push({ t, f: ctx.font, gap: 96 })); }
  if (s.name) { ctx.font = "700 50px Inter, system-ui, sans-serif"; wrapLines(ctx, e.title, maxW).forEach((t, i) => lines.push({ t, f: ctx.font, gap: 62, pad: i === 0 && lines.length ? 22 : 0 })); }
  if (s.when) { ctx.font = "500 38px Inter, system-ui, sans-serif"; const t = [memoWhen(e), shPlace(e)].filter(Boolean).join(" · "); wrapLines(ctx, t, maxW).slice(0, 2).forEach(x => lines.push({ t: x, f: ctx.font, gap: 50 })); }
  if (s.credit) lines.push({ t: "The Weekend Fetch · Get out. Get together.", f: "600 30px Inter, system-ui, sans-serif", gap: 44, pad: lines.length ? 30 : 0, dim: true });
  const blockH = lines.reduce((n, l) => n + l.gap + (l.pad || 0), 0);
  if (lines.length) {
    const g = ctx.createLinearGradient(0, bottom - blockH - 220, 0, H);
    g.addColorStop(0, "rgba(10,25,40,0)"); g.addColorStop(0.45, "rgba(10,25,40,.55)"); g.addColorStop(1, "rgba(10,25,40,.8)");
    ctx.fillStyle = g; ctx.fillRect(0, bottom - blockH - 220, W, H - (bottom - blockH - 220));
  }
  let y = bottom - blockH;
  ctx.textBaseline = "top"; ctx.shadowColor = "rgba(0,0,0,.35)"; ctx.shadowBlur = 8;
  for (const l of lines) { y += l.pad || 0; ctx.font = l.f; ctx.fillStyle = l.dim ? "rgba(255,255,255,.85)" : "#fff"; ctx.fillText(l.t, X, y); y += l.gap; }
  ctx.shadowBlur = 0;
}
function cardBlob(){ return new Promise(res => document.getElementById("shcv").toBlob(b => res(b), "image/jpeg", 0.9)); }
const cardName = () => "weekend-fetch-" + (SHR.e.id || "card").replace(/[^a-z0-9-]/gi, "").slice(0, 40) + ".jpg";
async function memoryShare(save){
  const blob = await cardBlob(); if (!blob) return;
  shareTrack("share_card_made", { item_id: SHR.e.id, props: { kind: "memory", template: SHR.tpl } });
  if (IN_APP() && typeof window.WF_SHARE_FILE === "function") {
    shareTrack("share_destination_opened", { item_id: SHR.e.id, props: { kind: "memory", channel: "share_sheet" } });
    try { await window.WF_SHARE_FILE(blob, cardName()); } catch (x) { const m = document.getElementById("shmsg"); if (m) m.textContent = "Couldn't open sharing on this phone."; }
    return;
  }
  const file = new File([blob], cardName(), { type: "image/jpeg" });
  if (!save && navigator.canShare && navigator.canShare({ files: [file] })) {
    shareTrack("share_destination_opened", { item_id: SHR.e.id, props: { kind: "memory", channel: "share_image" } });
    try { await navigator.share({ files: [file] }); } catch (x) {}
    return;
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = cardName();
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  shareTrack("share_destination_opened", { item_id: SHR.e.id, props: { kind: "memory", channel: "save_image" } });
  const m = document.getElementById("shmsg"); if (m) m.textContent = "Saving the image. On a phone, check your downloads or photos.";
}

/* --- the panel itself --- */
function drawShare(){
  let box = document.getElementById("shpanel");
  if (!SHR) { if (box) box.remove(); document.body.classList.remove("shopen-body"); return; }
  if (!box) { box = document.createElement("div"); box.id = "shpanel"; box.className = "shm"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); document.body.appendChild(box); }
  box.setAttribute("aria-label", SHR.kind === "invite" ? "Invite someone" : "Share our weekend");
  box.innerHTML = `<div class="shbox">${SHR.kind === "invite" ? inviteHTML() : memoryHTML()}</div>`;
  document.body.classList.add("shopen-body");
}
function closeShare(){ if (SHR && SHR.url) URL.revokeObjectURL(SHR.url); SHR = null; drawShare(); }
document.addEventListener("click", ev => {
  const t = ev.target.closest("[data-evinvite],[data-memory],[data-unpin],[data-shclose],[data-shopener],[data-shgo],[data-shcopy],[data-shtpl],[data-shhead],[data-shimg],[data-shsave]");
  if (!t) { if (ev.target.id === "shpanel") closeShare(); return; }
  if (t.dataset.evinvite) openInvite(t.dataset.evinvite);
  else if (t.dataset.memory) openMemory(t.dataset.memory);
  else if (t.hasAttribute("data-unpin")) { state.pin = null; try { history.replaceState(null, "", location.pathname + location.hash); } catch (x) {} render(); }
  else if (t.hasAttribute("data-shclose")) closeShare();
  else if (t.dataset.shopener) { const ta = document.getElementById("shtext"); const edited = ta && ta.value !== SHR.text; SHR.opener = t.dataset.shopener; SHR.text = edited ? ta.value.replace(/^[^\n]*/, SHR.opener) : inviteText(SHR.e, SHR.opener); drawShare(); }
  else if (t.hasAttribute("data-shgo")) inviteGo();
  else if (t.hasAttribute("data-shcopy")) { copyText(eventLink(SHR.e, SHR.code), "Link copied."); shareTrack("share_destination_opened", { item_id: SHR.e.id, props: { kind: SHR.kind, channel: "copy_link" } }); }
  else if (t.dataset.shtpl) { SHR.tpl = t.dataset.shtpl; drawShare(); paintCard(); }
  else if (t.dataset.shhead) { SHR.head = t.dataset.shhead; drawShare(); paintCard(); }
  else if (t.hasAttribute("data-shimg")) memoryShare(false);
  else if (t.hasAttribute("data-shsave")) memoryShare(true);
});
document.addEventListener("change", ev => { const k = ev.target.dataset && ev.target.dataset.shshow; if (k && SHR) { SHR.show[k] = ev.target.checked; paintCard(); } });
document.addEventListener("keydown", ev => { if (ev.key === "Escape" && SHR) closeShare(); });
