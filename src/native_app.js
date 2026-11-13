/* ---------- iPhone app only (added by build_app.py, not on the website) ----------
   1. Reminders for locked-in plans: the evening before (7pm) and 2 hours before it starts
      (9am on the day when the listing has no start time).
   2. "Add to Calendar" on each locked-in plan (Apple's New Event screen, filled in).
   3. "Invite someone to plan" opens the iPhone share sheet instead of copying the link.
*/
const CAP = window.Capacitor;
const capPlugin = name => !CAP ? null : ((CAP.Plugins && CAP.Plugins[name]) || (CAP.registerPlugin ? CAP.registerPlugin(name) : null));
const LN = capPlugin("LocalNotifications"), SHARE = capPlugin("Share"), CAL = capPlugin("WFCalendar");

// wfTimes(when) (start/end hours from listing text) is defined in accounts.js
const atHour = (day, h) => { const x = new Date(day); x.setHours(Math.floor(h), Math.round((h % 1) * 60), 0, 0); return x; };
const clock = h => { const hh = Math.floor(h), mm = Math.round((h % 1) * 60); return `${(hh % 12) || 12}${mm ? ":" + String(mm).padStart(2, "0") : ""}${hh < 12 ? "am" : "pm"}`; };
const planItem = id => DATA.find(d => d.id === id) || (picks.get(id) && picks.get(id).item) || null;
const placeOf = e => (e.meta || "").split(" · ")[0];
function noteId(s){ let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return (Math.abs(h) % 2000000000) + 1; }

/* 1. reminders */
let remindChain = Promise.resolve(), remindTimer = null;
function scheduleReminders(){
  if (!LN) return;
  clearTimeout(remindTimer);
  remindTimer = setTimeout(() => { remindChain = remindChain.then(doSchedule).catch(() => {}); }, 400);
}
async function doSchedule(){
  const perm = await LN.checkPermissions();
  if (perm.display !== "granted") return;
  const pending = (await LN.getPending()).notifications || [];
  const ours = pending.filter(n => n.extra && n.extra.wf);
  if (ours.length) await LN.cancel({notifications: ours.map(n => ({id: n.id}))});
  const now = Date.now(), list = [], seen = new Set();
  // signed in: every plan in every group (except ones you said "Can't" to); otherwise this device's plans
  const all = typeof myLockedPlans === "function" ? myLockedPlans() : null;
  const plans = all || [...locks].filter(([, set]) => set && set.size).map(([id, set]) => ({ id, k: [...set].sort()[0], e: planItem(id), meet: typeof planMeet === "function" ? planMeet(id) : null }));
  for (const p of plans){
    const id = p.id, k = p.k, e = p.e;
    if (!e || seen.has(id + "|" + k)) continue;
    seen.add(id + "|" + k);
    const day = parseD(k), mh = p.meet && p.meet.time ? hm2h(p.meet.time) : null;
    const t = mh != null ? { sh: mh } : wfTimes(e.when), place = (p.meet && p.meet.place) || placeOf(e);
    const body = [t ? (mh != null ? "Meet " : "") + clock(t.sh) : "", place].filter(Boolean).join(" · ") || "It's in your weekend plans.";
    const eve = atHour(addD(day, -1), 19);
    if (+eve > now) list.push({id: noteId(id + "|eve|" + k), title: "Tomorrow: " + e.title, body, schedule: {at: eve, allowWhileIdle: true}, extra: {wf: 1, item: id}});
    const soon = t ? atHour(day, t.sh - 2) : atHour(day, 9);
    if (+soon > now) list.push({id: noteId(id + "|soon|" + k), title: (t ? "In 2 hours: " : "Today: ") + e.title, body, schedule: {at: soon, allowWhileIdle: true}, extra: {wf: 1, item: id}});
  }
  list.sort((a, b) => a.schedule.at - b.schedule.at);
  if (list.length) await LN.schedule({notifications: list.slice(0, 60)});   // iPhone keeps up to 64
}
// ask for permission the first time someone locks in a plan (not at launch)
const _setPlan = setPlan;
setPlan = function(id, k){
  _setPlan(id, k);
  if (k && LN) LN.requestPermissions().then(scheduleReminders, () => {});
};
// stars and plans change (here or on someone else's phone, via sync): update the reminders
const _refreshStars = refreshStars;
refreshStars = function(){ _refreshStars(); scheduleReminders(); };
// tapping a reminder opens Our Weekend Plans
if (LN) try {
  LN.addListener("localNotificationActionPerformed", ev => {
    state.view = "our-list"; render(); scrollTo(0, 0);
    if (typeof logEvent === "function") logEvent("reminder_tapped", ev && ev.notification && ev.notification.extra && ev.notification.extra.item);
  });
} catch(e) {}

/* 2. Add to Calendar */
const _lockedCtl = lockedCtl;
lockedCtl = function(e, k, opts){
  const h = _lockedCtl(e, k, opts);
  if (!CAL) return h;
  return h.replace("</div>", `<button class="calbtn" data-addcal="${esc(e.id)}" data-k="${esc(k)}">📅 Add to Calendar</button></div>`);
};
document.addEventListener("click", ev => {
  const b = ev.target.closest("button[data-addcal]");
  if (!b || !CAL) return;
  const e = planItem(b.dataset.addcal);
  if (!e) return;
  const day = parseD(b.dataset.k), meet = typeof planMeet === "function" ? planMeet(e.id) : null;
  const mh = meet && meet.time ? hm2h(meet.time) : null, et = wfTimes(e.when);
  const t = mh != null ? { sh: mh, eh: et && et.eh > mh ? et.eh : mh + 2 } : et;
  const link = e.url || ("https://www.google.com/search?q=" + encodeURIComponent(e.q || (e.title + " " + placeOf(e))));
  const meetNote = meet ? "Meet-up: " + [meet.time ? clock(mh) : "", meet.place].filter(Boolean).join(" · ") : "";
  CAL.addEvent({
    title: e.title,
    location: (meet && meet.place) || placeOf(e),
    notes: [meetNote, e.meta, e.when, link].filter(Boolean).join("\n"),
    url: link,
    allDay: !t,
    start: +(t ? atHour(day, t.sh) : day),
    end: +(t ? atHour(day, t.eh) : day)
  }).then(r => {
    if (r && r.saved){
      b.textContent = "✓ In your calendar"; setTimeout(() => b.textContent = "📅 Add to Calendar", 3000);
      if (typeof logEvent === "function") logEvent("calendar_add", e.id);
    }
  }).catch(() => {
    b.textContent = "Calendar not available"; setTimeout(() => b.textContent = "📅 Add to Calendar", 3000);
  });
});

/* 3. invite links: iPhone share sheet */
const _copyOut = copyOut;
copyOut = function(t, text, okMsg, label){
  if (!SHARE || !/#list-/.test(text)) return _copyOut(t, text, okMsg, label);
  SHARE.share({
    title: "Plan weekends with me",
    text: "Join our weekend plans on The Bay Area Weekend Fetch:",
    url: text,
    dialogTitle: "Invite someone to plan"
  }).catch(() => {});   // closing the share sheet without sending is fine
};

/* 4. v1.1: Sign in with Apple (accounts.js shows the button when WF_APPLE_SIGNIN exists) */
const APPLE = capPlugin("WFAppleSignIn");
const hex = buf => Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, "0")).join("");
if (APPLE && typeof ensureClient === "function") window.WF_APPLE_SIGNIN = async function(){
  const raw = hex(crypto.getRandomValues(new Uint8Array(24)));
  const hashed = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)));
  let r;
  try { r = await APPLE.authorize({ nonce: hashed }); }
  catch (e) { if (/cancel/i.test(String((e && (e.code || e.message)) || e))) return false; throw e; }
  const c = await ensureClient();
  const { error } = await c.auth.signInWithIdToken({ provider: "apple", token: r.identityToken, nonce: raw });
  if (error) throw error;
  // Apple only shares the first name on the very first sign-in: use it as the suggested name
  if (r.givenName && !ME) { ME = r.givenName; try { localStorage.setItem("wf-name", ME); } catch (e) {} }
  return true;
};

/* 5. v1.1: invite links (https://theweekendfetch.com/join/?c=CODE) open the app */
const APPP = capPlugin("App");
function openFromLink(u){
  let url; try { url = new URL(u); } catch (e) { return; }
  if (!/^\/join\/?$/.test(url.pathname)) return;
  const c = (url.searchParams.get("c") || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 10);
  if (!c || typeof PENDING === "undefined") return;
  PENDING.join = c; try { localStorage.setItem("wf-pending-join", c); } catch (e) {}
  state.view = "our-list";
  if (ACCT.user && ACCT.me && ACCT.me.name) joinWithCode(c, true).catch(e => { ACCT.err = friendly(e); }).then(() => refreshStars());
  else { if (SB_ON) startAccounts(); render(); }
  scrollTo(0, 0);
}
if (APPP) {
  try { APPP.addListener("appUrlOpen", ev => openFromLink(ev && ev.url)); } catch (e) {}
  try { APPP.getLaunchUrl().then(r => r && r.url && openFromLink(r.url)).catch(() => {}); } catch (e) {}
}

scheduleReminders();
