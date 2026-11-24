/* ---------- How it works: a short first-visit tour + one-time tips (Nov 23, 2026) ----------
   Inserted into app.js just before the first render() by build.py (like share.js).
   The tour spotlights real parts of the page, so it stays right when the layout changes; a step whose part isn't on
   the page is skipped. It starts by itself once, for people who look new on this device (localStorage wf-tour), and
   can be replayed from "How it works" in the footer ([data-tour]). Tips (wf-tips) show once each, at the moment
   they're useful: after the first star, on first opening Our Plans, Explore, Rainy Day. */
const TOUR_STEPS = [
  { sel:null, t:"Welcome to " + (CITY.brand || "The Weekend Fetch"), b:"Every weekend's events in one place, from markets and shows to dog walks and free museum days. Want a 30-second tour?" },
  { sel:"#main .jump", t:"Pick a weekend", b:"Jump to any weekend. The circles after the dates take you straight to holiday events, markets or first-date ideas." },
  { sel:"#main .istrip", t:"Your interests", b:"Too much? Tap here to pick the kinds of events you care about. Everything else drops out of the list, and we remember it on this device." },
  { sel:"#filters", t:"Filter and search", b:"Free things only, Saturday or Sunday, dog-friendly, or search for anything. Set home to sort by distance." },
  { sel:"#main .card .star, #main .star", t:"Star what looks fun", b:"Tap the star on anything you like. It goes to Our Plans." },
  { sel:'.tab[data-view="our-list"]', t:"Our Plans", b:"Lock your stars into a day, get reminders, and invite your household. Sign in the same way on every device (Sign in with Apple, or the same email) and your plans and settings follow you." },
  { sel:'.tab[data-view="map"]', t:"Explore", b:"See it all on a map and find what's near you this weekend." },
  { sel:"#citySw", t:"Cities and regions", b:() => "We're in " + ((window.WF_CITIES||[]).filter(c=>c.group!=="region").map(c=>c.short).join(", ").replace(/, ([^,]*)$/, " and $1") || "several cities") + ((window.WF_CITIES||[]).some(c=>c.group==="region") ? ", plus regions like " + (window.WF_CITIES||[]).filter(c=>c.group==="region").map(c=>c.short).join(", ") : "") + ". Tap a circle to switch." },
  { sel:".hiwtop", t:"You're all set", b:"Replay this any time with How it works at the top of the page." }
];
let tourI = -1, tourList = [];
const tourGet = k => { try { return localStorage.getItem(k); } catch(e) { return null; } };
const tourSet = (k,v) => { try { localStorage.setItem(k,v); } catch(e) {} };
function tourGa(name, p){ if (typeof window.gtag==="function") try { window.gtag("event", name, p||{}); } catch(e) {} }

function tourLooksNew(){
  if (tourGet("wf-tour")) return false;
  if ((+tourGet("wf-visits")||0) > 1) return false;
  return !["wf-likes-off","wf-name","wf-gid","wf-home","wf-home-asked","wf-saved-ids","wf-view2","wf-list","wf-tips"].some(k=>tourGet(k)!==null);
}
function tourEl(sel){
  if (!sel) return null;
  for (const s of sel.split(",")) { const el = document.querySelector(s.trim()); if (el && el.offsetParent !== null) return el; }
  return null;
}
function startTour(auto){
  tipClose();
  if (state.view!=="events"){ state.view="events"; try{localStorage.setItem("wf-view2",state.view);}catch(e){} render(); if (typeof syncHash==="function") syncHash(); }
  if (state.likesOpen){ state.likesOpen=false; render(); }
  tourList = TOUR_STEPS;
  tourI = 0; tourSet("wf-tour", "seen");
  tourGa("tour_start", {auto: auto?1:0});
  tourShow();
}
function tourEnd(how){
  tourGa(how==="done" ? "tour_done" : "tour_skip", {step: tourI});
  tourSet("wf-tour", how==="done" ? "done" : "skipped");
  tourI = -1;
  const o = document.getElementById("tourO"); if (o) o.remove();
  document.body.classList.remove("touring");
  window.scrollTo({top:0, behavior:"smooth"});
}
function tourShow(){
  // skip steps whose part of the page isn't there (e.g. no city circles in an app build)
  while (tourI < tourList.length && tourList[tourI].sel && !tourEl(tourList[tourI].sel)) tourI++;
  if (tourI >= tourList.length) return tourEnd("done");
  const st = tourList[tourI], el = tourEl(st.sel);
  let o = document.getElementById("tourO");
  if (!o){ o = document.createElement("div"); o.id = "tourO"; o.className = "touro"; document.body.appendChild(o); }
  document.body.classList.add("touring");
  const n = tourList.length, first = tourI===0, last = tourI===n-1;
  const dots = tourList.map((_,i)=>`<i class="${i===tourI?"on":""}"></i>`).join("");
  o.innerHTML = `${el?`<div class="tspot" id="tspot"></div>`:`<div class="tdim"></div>`}
    <div class="tbub${el?"":" tmid"}" id="tbub" role="dialog" aria-modal="true" aria-labelledby="tbt">
      <div class="tdots" aria-hidden="true">${dots}</div>
      <h3 id="tbt">${esc(st.t)}</h3><p>${esc(typeof st.b==="function" ? st.b() : st.b)}</p>
      <div class="tbtns">${first ? `<button class="tskip" data-tourskip>Not now</button><button class="tnext" data-tournext>Show me</button>`
        : last ? `<button class="tnext" data-tourend>Done</button>`
        : `<button class="tskip" data-tourskip>Skip</button><button class="tback" data-tourback>Back</button><button class="tnext" data-tournext>Next</button>`}</div></div>`;
  if (el){
    const r0 = el.getBoundingClientRect(), hdrFixed = el.closest("header,.filters,.tabs");
    if (!hdrFixed && (r0.top < 80 || r0.bottom > innerHeight - 220)) window.scrollTo({top: scrollY + r0.top - 120, behavior:"auto"});
    else if (hdrFixed && el.closest("header") && scrollY > 0) window.scrollTo({top:0, behavior:"auto"});
  }
  requestAnimationFrame(tourPlace);
  const nb = o.querySelector(".tnext"); if (nb) nb.focus({preventScroll:true});
}
function tourPlace(){
  if (tourI < 0) return;
  const st = tourList[tourI], el = tourEl(st.sel), sp = document.getElementById("tspot"), bub = document.getElementById("tbub");
  if (!bub) return;
  if (!el || !sp){ bub.style.top = ""; return; }
  const r = el.getBoundingClientRect(), pad = 6;
  const top = Math.max(4, r.top - pad), h = Math.min(r.height + pad*2, innerHeight * .45);
  Object.assign(sp.style, { left: Math.max(4, r.left - pad) + "px", top: top + "px", width: Math.min(innerWidth - 8, r.width + pad*2) + "px", height: h + "px" });
  const bh = bub.offsetHeight, below = top + h + 12;
  bub.style.top = (below + bh < innerHeight - 8 ? below : Math.max(8, top - bh - 12)) + "px";
}
document.addEventListener("click", ev=>{
  const t = ev.target.closest("[data-tour],[data-tournext],[data-tourback],[data-tourskip],[data-tourend],[data-tipok]");
  if (!t) return;
  ev.preventDefault();
  if (t.hasAttribute("data-tour")) startTour(false);
  else if (t.hasAttribute("data-tournext")){ tourGa("tour_step", {step: tourI+1}); tourI++; tourShow(); }
  else if (t.hasAttribute("data-tourback")){ tourI = Math.max(0, tourI-1); tourShow(); }
  else if (t.hasAttribute("data-tourskip")) tourEnd("skip");
  else if (t.hasAttribute("data-tourend")) tourEnd("done");
  else if (t.hasAttribute("data-tipok")) tipClose();
});
document.addEventListener("keydown", ev=>{ if (tourI>=0 && ev.key==="Escape") tourEnd("skip"); });
window.addEventListener("resize", ()=>requestAnimationFrame(tourPlace));
window.addEventListener("scroll", ()=>{ if (tourI>=0) requestAnimationFrame(tourPlace); }, {passive:true});

/* ---- one-time tips ---- */
const TIPS = {
  star: { sel:'.tab[data-view="our-list"]', b:"Starred! It's in Our Plans. Open it to lock it into a day and get a reminder." },
  plans:{ sel:null, b:"Tip: tap “Lock it in” on a starred event to choose the day. Invite someone to plan, and you'll all see the same list." },
  map:  { sel:null, b:"Tip: tap a pin to see what's on there. The buttons above the map zoom to each area." },
  rainy:{ sel:null, b:"Wet weekend? Here are indoor events this weekend, then museums and play spaces, nearest first." }
};
function tipsSeen(){ try { return JSON.parse(tourGet("wf-tips")||"[]"); } catch(e){ return []; } }
function tipClose(){ const t = document.getElementById("tipO"); if (t) t.remove(); document.querySelectorAll(".tipring").forEach(e=>e.classList.remove("tipring")); }
function showTip(k){
  if (tourI >= 0 || !TIPS[k]) return;
  const seen = tipsSeen(); if (seen.includes(k)) return;
  // nobody gets a tip in their first seconds while the welcome tour is about to start
  if (!tourGet("wf-tour") && tourLooksNew()) return;
  seen.push(k); tourSet("wf-tips", JSON.stringify(seen));
  tipClose();
  const tip = TIPS[k], el = tourEl(tip.sel);
  if (el) el.classList.add("tipring");
  const d = document.createElement("div"); d.id = "tipO"; d.className = "tip"; d.setAttribute("role","status");
  d.innerHTML = `<p>${esc(tip.b)}</p><button class="tnext" data-tipok>Got it</button>`;
  document.body.appendChild(d);
  tourGa("tip_shown", {tip:k});
}
document.addEventListener("click", ev=>{
  const s = ev.target.closest("[data-star]");
  if (s && s.getAttribute("aria-pressed")!=="true") setTimeout(()=>showTip("star"), 700);
  const tab = ev.target.closest(".tab[data-view]");
  if (tab){ tipClose(); const v = tab.dataset.view, k = v==="our-list" ? "plans" : v==="map" ? "map" : v==="rainy" ? "rainy" : null; if (k) setTimeout(()=>showTip(k), 900); }
}, true);

// first visit: start the tour once the page has settled (not for people landing on a shared event or an invite)
setTimeout(()=>{
  if (tourI >= 0 || !tourLooksNew()) return;
  if ((typeof SHARED_IN!=="undefined" && SHARED_IN) || /list-|join/.test(location.hash + location.pathname)) return;
  if (state.view!=="events") return;
  startTour(true);
}, 1500);
