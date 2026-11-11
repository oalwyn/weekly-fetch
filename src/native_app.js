/* ---------- iPhone app only (added by build_app.py, not on the website) ----------
   1. Reminders for locked-in plans: the evening before (7pm) and 2 hours before it starts
      (9am on the day when the listing has no start time).
   2. "Add to Calendar" on each locked-in plan (Apple's New Event screen, filled in).
   3. "Invite someone to plan" opens the iPhone share sheet instead of copying the link.
*/
const CAP = window.Capacitor;
const capPlugin = name => !CAP ? null : ((CAP.Plugins && CAP.Plugins[name]) || (CAP.registerPlugin ? CAP.registerPlugin(name) : null));
const LN = capPlugin("LocalNotifications"), SHARE = capPlugin("Share"), CAL = capPlugin("WFCalendar");

// start / end time from text like "Fri Nov 13 · 6–8pm", "Sat · 10:30am", "11–2pm" (hours, 0-24)
function wfTimes(when){
  const re = /(\d{1,2})(?::(\d\d))?\s*(am|pm)?(?:\s*[–-]\s*(\d{1,2})(?::(\d\d))?\s*(am|pm))?/ig;
  let m;
  while ((m = re.exec(String(when || "")))){
    const m1 = m[3] && m[3].toLowerCase(), m2 = m[6] && m[6].toLowerCase();
    if (!m1 && !m2) continue;                       // a date like "Nov 13–14", not a time
    const h = (hh, mm, mer) => (+hh % 12) + (mer === "pm" ? 12 : 0) + (+(mm || 0)) / 60;
    let sh = h(m[1], m[2], m1 || m2);
    let eh = m[4] ? h(m[4], m[5], m2) : null;
    if (!m1 && eh !== null && sh > eh) sh -= 12;    // "11–2pm" starts at 11am
    if (eh === null || eh <= sh) eh = sh + 2;
    return {sh, eh};
  }
  return null;
}
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
  const now = Date.now(), list = [];
  for (const [id, set] of locks){
    if (!set || !set.size) continue;
    const k = [...set].sort()[0], e = planItem(id);
    if (!e) continue;
    const day = parseD(k), t = wfTimes(e.when), place = placeOf(e);
    const body = [t ? clock(t.sh) : "", place].filter(Boolean).join(" · ") || "It's in your weekend plans.";
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
  LN.addListener("localNotificationActionPerformed", () => { state.view = "our-list"; render(); scrollTo(0, 0); });
} catch(e) {}

/* 2. Add to Calendar */
const _lockedCtl = lockedCtl;
lockedCtl = function(e, k, opts){
  const h = _lockedCtl(e, k, opts);
  if (!CAL) return h;
  return h.replace(/<\/div>$/, `<button class="calbtn" data-addcal="${esc(e.id)}" data-k="${esc(k)}">📅 Add to Calendar</button></div>`);
};
document.addEventListener("click", ev => {
  const b = ev.target.closest("button[data-addcal]");
  if (!b || !CAL) return;
  const e = planItem(b.dataset.addcal);
  if (!e) return;
  const day = parseD(b.dataset.k), t = wfTimes(e.when);
  const link = e.url || ("https://www.google.com/search?q=" + encodeURIComponent(e.q || (e.title + " " + placeOf(e))));
  CAL.addEvent({
    title: e.title,
    location: placeOf(e),
    notes: [e.meta, e.when, link].filter(Boolean).join("\n"),
    url: link,
    allDay: !t,
    start: +(t ? atHour(day, t.sh) : day),
    end: +(t ? atHour(day, t.eh) : day)
  }).then(r => {
    if (r && r.saved){ b.textContent = "✓ In your calendar"; setTimeout(() => b.textContent = "📅 Add to Calendar", 3000); }
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

scheduleReminders();
