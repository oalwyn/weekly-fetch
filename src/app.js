const WF = window.WF_DATA || {updated:"", items:[]};
const WALKS = window.WF_WALKS || {items:[], nodogs:[]};
const DATA = WF.items.concat(WALKS.items);
const HOME_DEFAULT = {name:"Mountain View", lat:37.3861, lon:-122.0839};
let HOME = {...HOME_DEFAULT};
try { const h = JSON.parse(localStorage.getItem("wf-home") || "null"); if (h && isFinite(h.lat) && isFinite(h.lon)) HOME = h; } catch(e) {}
const BBOX = /*BBOX*/[0,0,0,0];
const MAP_W = /*W*/0, MAP_H = /*H*/0;
const COAST = "/*COAST*/";
const CATS = {hol:{label:"Holiday",color:"#C4562A"},mkt:{label:"Markets",color:"#2F6FA8"},dog:{label:"Dog",color:"#2E8B5E"},food:{label:"Pizza & coffee",color:"#C98A00"},art:{label:"Art",color:"#6E55A8"},walk:{label:"Dog walks",color:"#0F7C80"},show:{label:"Concerts & shows",color:"#B8336A"},kids:{label:"Young kids",color:"#5E9E2F"},teen:{label:"Teens",color:"#5C6BC0"},prog:{label:"Teen programs",color:"#8D6E63"},evt:{label:"Events",color:"#4A5562"}};
const SECTIONS = (WF.sections || [["week","This week"]]).slice();
{ const i = SECTIONS.findIndex(s=>s[0]==="dog"); SECTIONS.splice(i>=0?i+1:1, 0, ["walks","Dog walks · closest to home first"]); }
const VIEWS = ["events","map","our-list"];

let state = {view:"events", cat:"all", dist:0, sel:null, group:"weekend", editHome:false, homeMsg:""};
try { const d = +localStorage.getItem("wf-dist"); if ([15,30,60].includes(d)) state.dist = d; } catch(e) {}
try { const g = localStorage.getItem("wf-group"); if (g==="weekend"||g==="date") state.group = g; } catch(e) {}
/* ---- dates & weekends ---- */
const DAYMS = 864e5, DAYN = ["sun","mon","tue","wed","thu","fri","sat"], MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const parseD = s => { const [y,m,d] = String(s).split("-").map(Number); return new Date(y, m-1, d); };
const TODAY = (()=>{ const t = new Date(); t.setHours(0,0,0,0); return t; })();
const addD = (d,n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
function weekends(){
  const dow = TODAY.getDay();
  let sat = dow===0 ? addD(TODAY,-1) : addD(TODAY,(6-dow));
  return [0,1,2,3].map(i=>{ const s = addD(sat,7*i); return {fri:addD(s,-1), sat:s, sun:addD(s,1)}; });
}
function occurs(e, a, b){
  if (e.dates) return e.dates.some(x=>{ const t=parseD(x); return t>=a && t<=b; }) ? "main" : null;
  if (!e.start) return null;
  const s = parseD(e.start), en = e.end ? parseD(e.end) : new Date(2100,0,1);
  if (en < a || s > b) return null;
  if (s >= a && s <= b && (en - s)/DAYMS > 3) return "main";   // opening weekend counts as a main event
  if (e.days){ for (let t = new Date(Math.max(+a,+s)); t<=b && t<=en; t = addD(t,1)) if (e.days.includes(DAYN[t.getDay()])) return "ongoing"; return null; }
  return (en - s)/DAYMS > 3 ? "ongoing" : "main";
}
const isPast = e => { if (e.deadline && parseD(e.deadline) < TODAY) return true; const last = e.dates ? parseD(e.dates[e.dates.length-1]) : (e.end ? parseD(e.end) : (e.start && !e.days ? parseD(e.start) : null)); return last && last < TODAY; };
const startOf = e => e.dates ? parseD(e.dates[0]) : (e.start ? parseD(e.start) : null);
const ord = n => n + ((n%100>=11&&n%100<=13) ? "th" : ["th","st","nd","rd"][n%10] || "th");
const wkTitle = w => `${MON[w.fri.getMonth()]} ${ord(w.fri.getDate())} Weekend`;
const wkWhen = (w,i) => (i===0 ? "This weekend · " : i===1 ? "Next weekend · " : "") + `Fri ${MON[w.fri.getMonth()]} ${w.fri.getDate()} – Sun ${MON[w.sun.getMonth()]} ${w.sun.getDate()}`;
const WKC = ["#1B3F63","#0F6B6E","#6B3E8F","#A44A1C"];
const band = (id, title, sub, color) => `<h2 class="wk-h"${id?` id="${id}"`:""}${color?` style="background:${color}"`:""}>${title}</h2>${sub?`<p class="wk-sub">${sub}</p>`:""}`;
const fmtRange = (a,b) => a.getMonth()===b.getMonth() ? `${MON[a.getMonth()]} ${a.getDate()}–${b.getDate()}` : `${MON[a.getMonth()]} ${a.getDate()} – ${MON[b.getMonth()]} ${b.getDate()}`;
/* ---- stars: shared through db when available, else this device ---- */
let db = null, userApi = null, me = null, shared = false, canWrite = true, dbNote = "";
let picks = new Map();          // id -> {uids:[], item}
let names = {};                 // uid -> display name
const pending = new Set();
let localSaved = new Set();
try { const s = localStorage.getItem("wf-saved-ids"); if (s) localSaved = new Set(JSON.parse(s)); } catch(e) {}
function persistLocal(){
  try { localStorage.setItem("wf-saved-ids", JSON.stringify([...localSaved])); } catch(e) {}
  syncHash();
}
function syncHash(){
  // keep this device's stars in the page address so a refresh (or a saved link) brings them back
  if (typeof code !== "function") return;
  const want = (!shared && localSaved.size) ? "#picks-" + [...localSaved].map(code).join("-") : (shared ? "#" + state.view : "");
  try { if (location.hash !== want) history.replaceState(null, "", want || (location.pathname + location.search)); } catch(e) {}
}
try { const v = localStorage.getItem("wf-view2"); if (VIEWS.includes(v)) state.view = v; } catch(e) {}
if (VIEWS.includes(location.hash.slice(1))) state.view = location.hash.slice(1);
const PAGE_URL = "https://claude.ai/artifact/H7osiXWK9HTJwUmtsebTjA";
const code = id => { let h = 5381; for (const c of id) h = ((h*33) ^ c.charCodeAt(0)) >>> 0; return (h % 1679616).toString(36).padStart(4,"0"); };
let importedMsg = "";
let pendingImport = [];
(function readPicksLink(){
  const h = location.hash.slice(1);
  if (!h.startsWith("picks-")) return;
  const codes = new Set(h.slice(6).split("-").filter(Boolean));
  const all = (window.WF_DATA?WF_DATA.items:[]).concat(window.WF_WALKS?WF_WALKS.items:[]);
  pendingImport = all.filter(e=>codes.has(code(e.id))).map(e=>e.id);
  const before = new Set(localSaved);
  pendingImport.forEach(id=>localSaved.add(id));
  const fresh = pendingImport.filter(id=>!before.has(id));
  if (fresh.length){ importedMsg = `Added ${fresh.length} pick${fresh.length===1?"":"s"} from the link you opened.`; state.view = "our-list"; }
  else if (!pendingImport.length) importedMsg = "That link's picks are no longer in the current list.";
  persistLocal();
})();
function picksLink(){ return PAGE_URL + "#picks-" + starredIds().map(code).join("-"); }
setTimeout(syncHash, 0);

// with an account and groups, accounts.js answers "starred in any of my plans" (acctStarred); otherwise this list or this device
const starredByMe = id => { const a = typeof acctStarred === "function" ? acctStarred(id) : null; return a !== null ? a : shared ? !!(picks.get(id) && picks.get(id).uids.includes(me)) : localSaved.has(id); };
const starredIds = () => shared ? [...picks.keys()] : [...localSaved];
const pickers = id => shared && picks.get(id) ? picks.get(id).uids : [];

function miles(a,b,c,d){const R=3958.8,r=Math.PI/180;const x=Math.sin((c-a)*r/2)**2+Math.cos(a*r)*Math.cos(c*r)*Math.sin((d-b)*r/2)**2;return 2*R*Math.asin(Math.sqrt(x));}
function measure(){
  DATA.forEach(e=>{ e.mi = e.lat!=null ? Math.round(miles(HOME.lat,HOME.lon,e.lat,e.lon)) : null; });
  // dog walks: closest to home first
  const w = DATA.filter(e=>e.cat==="walk").sort((x,y)=>(x.mi??999)-(y.mi??999));
  const rest = DATA.filter(e=>e.cat!=="walk"); DATA.length = 0; DATA.push(...rest, ...w);
  w.forEach((e,i)=>e.n="W"+(i+1));
}
measure();
const esc = s => String(s==null?"":s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const infoUrl = e => (e.url && /^https?:\/\//.test(e.url)) ? e.url : "https://www.google.com/search?q="+encodeURIComponent((e.title||"")+" "+((e.meta||"").split(" · ")[0]));
const gmaps = e => "https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(e.q||e.title);
const STAR = '<svg viewBox="0 0 24 24" fill="none" stroke="#5A6472" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>';

function whoLine(id){
  const u = pickers(id); if(!u.length) return "";
  const list = u.map(x => x===me ? "You" : (names[x] || "Someone"));
  list.sort((a,b)=> a==="You" ? -1 : b==="You" ? 1 : 0);
  return `<span class="who">★ ${esc(list.join(" & "))}</span>`;
}
function filtered(){
  return DATA.filter(e => (state.cat==="all" || e.cat===state.cat || (state.cat==="dog" && e.cat==="walk")) && (!state.dist || (e.mi!=null && e.mi<=state.dist)));
}
function cardHTML(e, gone, extra, cls){
  const c = CATS[e.cat] || CATS.evt;
  const mine = starredByMe(e.id);
  return `<article class="card${cls?" "+cls:""}" id="card-${esc(e.id)}">
    <div><div class="when">${esc(e.when)}</div><div class="title">${esc(e.title)}</div><div class="meta">${esc(e.meta)}${e.tbc?' · <span class="tbc">2026 date TBC</span>':''}${gone?' · <span class="tbc">no longer in the current list (may be over)</span>':''}</div></div>
    <button class="star" aria-label="${mine?'Unstar':'Star'}: ${esc(e.title)}" aria-pressed="${mine}" data-star="${esc(e.id)}">${STAR}</button>
    <div class="row2">${e.n?`<span class="num">#${e.n}</span>`:''}<span class="tag c-${e.cat in CATS?e.cat:'evt'}">${c.label}</span>${e.mi!=null?`<span class="dist">${e.mi} mi</span>`:''}${whoLine(e.id)}${!extra&&lockKey(e.id)&&parseD(lockKey(e.id))>=TODAY?`<span class="planned">✓ ${dayLabel(lockKey(e.id))}</span>`:""}</div><div class="links"><a class="lbtn primary" href="${esc(infoUrl(e))}" target="_blank" rel="noopener">${e.url?"More info":"Search for it"} ↗</a>${e.lat!=null||e.q?`<a class="lbtn" href="${gmaps(e)}" target="_blank" rel="noopener">Directions ↗</a>`:''}</div>${extra||""}
  </article>`;
}
const DISTS = [[0,"Any distance"],[15,"15 mi"],[30,"30 mi"],[60,"60 mi"]];
function renderFilters(){
  const f = document.getElementById("filters");
  if (state.view==="our-list"){ f.innerHTML=""; f.style.display="none"; return; }
  f.style.display="";
  const catLabel = state.cat==="all" ? "All" : CATS[state.cat].label;
  const distLabel = state.dist ? `Within ${state.dist} mi` : "Any distance";
  const active = (state.cat!=="all") + (!!state.dist);
  let h = `<div class="fbar"><button class="filterbtn${active?" on":""}" data-filtopen aria-expanded="${!!state.filtOpen}" aria-controls="fpanel">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4-2v-4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
    <span class="ftxt"><span class="flabel">Filter events</span><span class="fsum">${esc(catLabel)} · ${distLabel}</span></span>${active?`<span class="fcount">${active}</span>`:""}<span class="fcaret">${state.filtOpen?"▴":"▾"}</span></button>
    <button class="chip homechip" data-sethome aria-label="Change home location, now ${esc(HOME.name)}">📍 ${esc(HOME.name)}</button></div>`;
  if (state.filtOpen){
    h += `<div class="fpanel" id="fpanel"><div class="fsec">Show</div><div class="fwrap"><button class="chip" data-cat="all" aria-pressed="${state.cat==='all'}">All events</button>`;
    for (const k in CATS) h += `<button class="chip" data-cat="${k}" aria-pressed="${state.cat===k}"><i class="dot" style="background:${CATS[k].color}"></i>${CATS[k].label}</button>`;
    h += `</div><div class="fsec">Distance from ${esc(HOME.name)} <button class="linkbtn" data-sethome>change</button></div><div class="dseg" role="group" aria-label="Distance">${DISTS.map(([v,t])=>`<button data-distv="${v}" aria-pressed="${state.dist===v}">${t}</button>`).join("")}</div>
    <div class="fdone">${active?`<button class="copybtn alt" data-freset>Clear filters</button>`:""}<button class="copybtn" data-filtopen>Done · show ${filtered().filter(e=>!isPast(e)).length}</button></div></div>`;
  }
  f.innerHTML = h;
}
function compactHTML(e){
  const mine = starredByMe(e.id);
  return `<div class="crow"><button class="star" aria-label="${mine?'Unstar':'Star'}: ${esc(e.title)}" aria-pressed="${mine}" data-star="${esc(e.id)}">${STAR}</button>
  <div><span class="ct">${esc(e.title)}</span><span class="cw">${esc(e.when)} · ${esc((e.meta||"").split(" · ")[0])}${e.mi!=null?` · ${e.mi} mi`:""}</span></div>
  <a href="${esc(infoUrl(e))}" target="_blank" rel="noopener">Info ↗</a></div>`;
}
function segHTML(){
  return `<div class="seg" role="group" aria-label="Group events"><button data-group="date" aria-pressed="${state.group==='date'}">By date</button><button data-group="weekend" aria-pressed="${state.group==='weekend'}">By weekend</button></div>`;
}
function renderByWeekend(){
  const all = filtered().filter(e=>!isPast(e));
  const progs = all.filter(e=>e.cat==="prog");
  const items = all.filter(e=>e.cat!=="prog");
  if (state.cat==="prog") return progs.length ? band("wk-progs","Teen winter & summer programs","Sorted by application deadline · apply ahead","#6D4C41") + progs.map(e=>cardHTML(e)).join("") : `<div class="empty">No programs right now.</div>`;
  const W = weekends(), lastSun = W[3].sun;
  const used = new Set();
  const byStart = (a,b)=> (startOf(a)||0)-(startOf(b)||0);
  let h = "";
  W.forEach((w,i)=>{
    const main = items.filter(e=>occurs(e,w.fri,w.sun)==="main").sort(byStart);
    const ong = items.filter(e=>occurs(e,w.fri,w.sun)==="ongoing");
    main.forEach(e=>used.add(e.id)); ong.forEach(e=>used.add(e.id));
    h += band("wk-"+i, wkTitle(w), `${wkWhen(w,i)} · ${main.length} event${main.length===1?"":"s"}${ong.length?` + ${ong.length} ongoing`:""}`, WKC[i]);
    h += main.length ? main.map(e=>cardHTML(e)).join("") : `<div class="empty small">Nothing dated for this weekend yet. Check back after the next refresh.</div>`;
    if (ong.length) h += `<div class="section-h">Also open this weekend</div>` + ong.map(compactHTML).join("");
  });
  const between = items.filter(e=>!used.has(e.id) && startOf(e) && startOf(e)<=lastSun && !e.days && occurs(e,TODAY,lastSun)==="main").sort(byStart);
  if (between.length){ h += ``+band("",`Weeknights in between`,`Mon–Thu events before ${MON[lastSun.getMonth()]} ${lastSun.getDate()}`)+`` + between.map(e=>cardHTML(e)).join(""); between.forEach(e=>used.add(e.id)); }
  const later = items.filter(e=>!used.has(e.id) && ((startOf(e) && startOf(e)>lastSun) || e.sec==="radar")).sort(byStart);
  if (later.length){ h += ``+band("wk-later",`Later`,`After ${MON[lastSun.getMonth()]} ${lastSun.getDate()}`)+`` + later.map(e=>cardHTML(e)).join(""); later.forEach(e=>used.add(e.id)); }
  const tbc = items.filter(e=>!used.has(e.id) && e.tbc);
  if (tbc.length){ h += ``+band("",`Dates not posted yet`,`Usually happen in December`)+`` + tbc.map(compactHTML).join(""); tbc.forEach(e=>used.add(e.id)); }
  const any = items.filter(e=>!used.has(e.id) && e.cat!=="walk");
  if (any.length) h += ``+band("",`Any weekend`,`Classes and recurring things you can book or do most weekends`)+`` + any.map(compactHTML).join("");
  if (progs.length) h += band("wk-progs","Teen winter & summer programs","Sorted by application deadline · apply ahead","#6D4C41") + progs.map(e=>cardHTML(e)).join("");
  const walks = items.filter(e=>!used.has(e.id) && e.cat==="walk");
  if (walks.length) h += ``+band("",`Dog walks`,`Always on · closest to home first`)+`` + walks.map(compactHTML).join("");
  return h || `<div class="empty">No events match these filters.</div>`;
}
function renderEvents(){
  if (state.group==="weekend"){
    const W = weekends();
    const jump = `<div class="jump">${W.map((w,i)=>`<button data-jump="wk-${i}">${MON[w.fri.getMonth()]} ${ord(w.fri.getDate())}</button>`).join("")}<button data-jump="wk-later">Later</button></div>`;
    return segHTML() + jump + renderByWeekend();
  }
  return segHTML() + renderEventsByDate();
}
function renderEventsByDate(){
  const items = filtered().filter(e=>!isPast(e));
  if (!items.length) return `<div class="empty">No events match these filters.</div>`;
  let h = "";
  for (const [k,label] of SECTIONS){
    const sec = items.filter(e=>e.sec===k);
    if (sec.length) h += `<div class="section-h">${esc(label)}</div>` + sec.map(e=>cardHTML(e)).join("");
    if (k==="walks" && sec.length && WALKS.nodogs.length) h += `<div class="nodogs"><strong>Leave the dog at home:</strong><ul>${WALKS.nodogs.map(t=>`<li>${esc(t)}</li>`).join("")}</ul><span>Leash rules change, so check the posted signs.</span></div>`;
  }
  return h;
}
function ourListItems(){
  const order = Object.fromEntries(SECTIONS.map(([k],i)=>[k,i]));
  const cur = [], gone = [];
  for (const id of starredIds()){
    const e = DATA.find(d=>d.id===id);
    if (e) cur.push(e);
    else { const snap = shared && picks.get(id) && picks.get(id).item; if (snap) gone.push(snap); }
  }
  cur.sort((a,b)=> (order[a.sec]??99)-(order[b.sec]??99) || (a.n||0)-(b.n||0));
  return {cur, gone};
}
/* ---- weekend plans: shared "lock it in" ---- */
const ymd = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const shortD = k => { const d = parseD(k); return `${DAYN[d.getDay()][0].toUpperCase()+DAYN[d.getDay()].slice(1)} ${MON[d.getMonth()]} ${d.getDate()}`; };
let locks = new Map();   // id -> Set of keys (weekend Saturday, or the event's own date)
try { const s = JSON.parse(localStorage.getItem("wf-locks") || "null"); if (s) locks = new Map(Object.entries(s).map(([k,v])=>[k,new Set(v)])); } catch(e) {}
const isLocked = (id,k) => !!(locks.get(id) && locks.get(id).has(k));
const lockedAny = id => !!(locks.get(id) && locks.get(id).size);
function persistLocks(){ try { localStorage.setItem("wf-locks", JSON.stringify(Object.fromEntries([...locks].map(([k,v])=>[k,[...v]])))); } catch(e) {} }
function setLock(id,k,on){ const s = locks.get(id) || new Set(); on ? s.add(k) : s.delete(k); if (s.size) locks.set(id,s); else locks.delete(id); }
// one plan per item: the specific day you'll go
const lockKey = id => { const s = locks.get(id); return s && s.size ? [...s].sort()[0] : null; };
function setPlan(id,k){ locks.delete(id); if (k) setLock(id,k,true); persistLocks(); refreshStars(); }
function toggleLock(id,k){ setPlan(id, isLocked(id,k) ? null : k); }
const isLong = e => !e.dates && !!e.start && (!!e.days || !e.end || (parseD(e.end)-parseD(e.start))/DAYMS > 3);
const DAYF = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const dayLabel = k => { const d = parseD(k); return `${DAYN[d.getDay()][0].toUpperCase()+DAYN[d.getDay()].slice(1)} ${MON[d.getMonth()]} ${d.getDate()}`; };
function daysOf(e, a, b){
  // the dates (YYYY-MM-DD) between a and b when this item is on
  const out = [];
  if (e.dates){ e.dates.forEach(x=>{ const t=parseD(x); if (t>=a && t<=b) out.push(x); }); return out; }
  if (!e.start) return out;
  const s = parseD(e.start), en = e.end ? parseD(e.end) : addD(b,0);
  let t = new Date(Math.max(+a,+s)), n = 0;
  for (; t<=b && t<=en && n<120; t = addD(t,1), n++){ if (!e.days || e.days.includes(DAYN[t.getDay()])) out.push(ymd(t)); }
  return out;
}
const timeOf = e => { const m = String(e.when||"").match(/(\d{1,2})(?::(\d\d))?\s*(am|pm)/i); if (!m) return 99; let h = +m[1] % 12; if (/pm/i.test(m[3])) h += 12; return h + (+(m[2]||0))/60; };
function planGroups(cur){
  const W = weekends(), lastSun = W[3].sun, far = addD(TODAY, 120);
  const wkDays = new Set(W.flatMap(w=>[w.fri,w.sat,w.sun].map(ymd)));
  const groups = W.map((w,i)=>({id:"wk-"+i, wk:true, w, i, title: wkTitle(w), sub: wkWhen(w,i), days:{[ymd(w.fri)]:[],[ymd(w.sat)]:[],[ymd(w.sun)]:[]}, maybe:[]}));
  const wn = {id:"wk-wn", title:"Weeknights", sub:"Mon–Thu, before "+MON[lastSun.getMonth()]+" "+lastSun.getDate(), locked:[], maybe:[]};
  const later = {id:"wk-later", title:"Later", sub:"After "+MON[lastSun.getMonth()]+" "+lastSun.getDate(), locked:[], maybe:[]};
  const flex = [], any = [], dl = [];
  for (const e of cur){
    const k = lockKey(e.id);
    if (k && parseD(k) >= TODAY){
      if (wkDays.has(k)){ groups.find(g=>k in g.days).days[k].push({e,k}); continue; }
      (parseD(k) <= lastSun ? wn : later).locked.push({e,k}); continue;
    }
    if (e.cat==="prog"){ dl.push(e); continue; }
    if (e.cat==="walk"){ any.push(e); continue; }
    if (isLong(e) && W.some(w=>daysOf(e,w.fri,w.sun).length)){ flex.push(e); continue; }
    let placed = false;
    groups.forEach(g=>{ const ds = daysOf(e,g.w.fri,g.w.sun); if (ds.length && !isLong(e)){ g.maybe.push({e,opts:ds}); placed = true; } });
    if (placed) continue;
    const ds = daysOf(e, TODAY, far).filter(x=>!wkDays.has(x));
    if (ds.length && parseD(ds[0]) <= lastSun) wn.maybe.push({e,opts:ds.filter(x=>parseD(x)<=lastSun)});
    else if (ds.length) later.maybe.push({e,opts:ds.slice(0,30)});
    else any.push(e);
  }
  const byTime = (x,y)=> timeOf(x.e)-timeOf(y.e);
  groups.forEach(g=>{ for (const k in g.days) g.days[k].sort(byTime); g.maybe.sort((x,y)=>x.opts[0].localeCompare(y.opts[0])||byTime(x,y)); });
  for (const g of [wn,later]){ g.locked.sort((x,y)=>x.k.localeCompare(y.k)||byTime(x,y)); g.maybe.sort((x,y)=>x.opts[0].localeCompare(y.opts[0])); }
  dl.sort((x,y)=>(x.deadline||"9999").localeCompare(y.deadline||"9999"));
  return {groups, flex, wn, later, any, dl, W};
}
// controls: one day → a button; several → a "pick a day" menu
function planCtl(e, opts){
  if (opts.length === 1) return `<div class="lockrow"><button class="lockbtn" data-lock="${esc(e.id)}" data-k="${opts[0]}" aria-pressed="false">Lock it in · ${dayLabel(opts[0])}</button></div>`;
  return `<div class="lockrow"><select class="locksel" data-plan="${esc(e.id)}" aria-label="Lock ${esc(e.title)} into a day"><option value="">Lock it in for…</option>${opts.map(k=>`<option value="${k}">${dayLabel(k)}</option>`).join("")}</select></div>`;
}
function lockedCtl(e, k, opts){
  const move = opts && opts.length > 1 ? `<select class="locksel small" data-plan="${esc(e.id)}" aria-label="Move ${esc(e.title)} to another day"><option value="">Move to…</option>${opts.filter(x=>x!==k).map(x=>`<option value="${x}">${dayLabel(x)}</option>`).join("")}</select>` : "";
  return `<div class="lockrow"><button class="lockbtn" data-lock="${esc(e.id)}" data-k="${k}" aria-pressed="true">✓ Locked in · ${dayLabel(k)}</button>${move}<span class="locknote">Tap to make it a maybe</span></div>`;
}
const allWkOpts = (e, W) => W.flatMap(w=>daysOf(e,w.fri,w.sun));
// compact plan rows: date/time · activity · place; tap to open the full card
const openRows = new Set();
function planRow(e, ctl, k){
  const open = openRows.has(e.id), t = String(e.when||"").match(/\d{1,2}(?::\d\d)?\s*(?:am|pm)?\s*[–-]\s*\d{1,2}(?::\d\d)?\s*(?:am|pm)|\d{1,2}(?::\d\d)?\s*(?:am|pm)/i);
  const when = k ? dayLabel(k) + (t ? " · " + t[0] : "") : e.when;
  const place = (e.meta||"").split(" · ")[0];
  return `<div class="prow${k?" locked":""}${open?" open":""}"><button class="prow-h" data-expand="${esc(e.id)}" aria-expanded="${open}">
    <span class="pmark" aria-hidden="true">${k?"✓":"?"}</span><span class="pbody"><span class="pw">${esc(when)}</span><span class="pt">${esc(e.title)}</span><span class="pl">${esc(place)}</span></span><span class="chev" aria-hidden="true">${open?"▴":"▾"}</span>
    <span class="sr">${k?"Locked in":"Maybe"}. ${open?"Hide details":"Show details"}</span></button>${open?cardHTML(e,false,ctl,"inrow"):""}</div>`;
}
function weekendHTML(g, W){
  const keys = Object.keys(g.days), n = keys.reduce((s,k)=>s+g.days[k].length,0), m = g.maybe.length;
  let h = ``+band(g.id,esc(g.title),`${esc(g.sub)} · ${n?`<strong class="lockc">${n} locked in</strong>`:"nothing locked in"}${m?` · ${m} maybe${m===1?"":"s"}`:""}`, g.wk?WKC[g.i]:null);
  h += `<div class="sched">` + keys.map(k=>{
    const d = parseD(k), list = g.days[k];
    const head = `<div class="sched-d${list.length?"":" free"}"><span>${DAYF[d.getDay()]} ${MON[d.getMonth()]} ${d.getDate()}</span>${list.length?"":`<em>Free</em>`}</div>`;
    return head + list.map(({e})=>planRow(e,lockedCtl(e,k,isLong(e)?allWkOpts(e,W):daysOf(e,g.w.fri,g.w.sun)),k)).join("");
  }).join("") + `</div>`;
  if (m) h += `<div class="plan-h">Maybe this weekend</div>` + g.maybe.map(({e,opts})=>planRow(e,planCtl(e,opts))).join("");
  return h;
}
function listGroupHTML(g){
  if (!g.locked.length && !g.maybe.length) return "";
  let h = ``+band(g.id,esc(g.title),`${esc(g.sub)}${g.locked.length?` · <strong class="lockc">${g.locked.length} locked in</strong>`:""}${g.maybe.length?` · ${g.maybe.length} maybe${g.maybe.length===1?"":"s"}`:""}`)+``;
  if (g.locked.length) h += `<div class="plan-h locked">Locked in</div>` + g.locked.map(({e,k})=>planRow(e,lockedCtl(e,k,daysOf(e,TODAY,addD(TODAY,120)).slice(0,30)),k)).join("");
  if (g.maybe.length) h += `<div class="plan-h">Maybe</div>` + g.maybe.map(({e,opts})=>planRow(e,planCtl(e,opts))).join("");
  return h;
}
function planHTML(cur, gone){
  const P = planGroups(cur);
  let h = `<div class="jump">${P.W.map((w,i)=>`<button data-jump="wk-${i}">${MON[w.fri.getMonth()]} ${ord(w.fri.getDate())}</button>`).join("")}${P.later.locked.length+P.later.maybe.length?`<button data-jump="wk-later">Later</button>`:""}</div>`;
  h += `<div class="plantools"><span>Tap a plan to see details</span><button class="linkbtn" data-expandall>${cur.length && cur.every(e=>openRows.has(e.id))?"Collapse all":"Expand all"}</button></div>`;
  P.groups.forEach(g=>{ h += weekendHTML(g, P.W); });
  if (P.flex.length){
    h += ``+band("",`Pick a day`,`These run over several weekends. Choose the day you'll go and it moves into that weekend's schedule.`)+``;
    h += P.flex.map(e=>planRow(e,planCtl(e,allWkOpts(e,P.W)))).join("");
  }
  h += listGroupHTML(P.wn) + listGroupHTML(P.later);
  if (P.dl.length) h += band("wk-dl","Deadlines to remember","Teen programs you starred, soonest first","#6D4C41") + P.dl.map(e=>planRow(e,"")).join("");
  if (P.any.length) h += ``+band("",`Anytime`,`Walks, classes and things without a date yet`)+`` + P.any.map(compactHTML).join("");
  if (gone.length) h += `<div class="section-h">Earlier picks</div>` + gone.map(e=>cardHTML(e,true)).join("");
  return h;
}
function renderOurList(){
  const {cur, gone} = ourListItems();
  let h = `<div class="ourhead">${importedMsg?`<p class="okmsg">${esc(importedMsg)}</p>`:""}<p class="ournote">Your stars are saved on this device.</p>${cur.length?`<div class="btnrow"><button class="copybtn alt" data-copy>Copy as text</button></div>`:""}<div id="copyout"></div></div>`;
  if (!cur.length && !gone.length) return h + `<div class="empty">Nothing starred yet.<br>Tap the ☆ on any event and it lands here.</div>`;
  return h + planHTML(cur, gone);
}
function listText(){
  const {cur} = ourListItems(), P = planGroups(cur);
  const line = e => { const t = String(e.when||"").match(/\d{1,2}(?::\d\d)?\s*(am|pm)/i); return `${e.title}${t?" "+t[0]:""} (${(e.meta||"").split(" · ")[0]})`; };
  let t = "Our weekend plans (The Bay Area Weekend Fetch)\n";
  for (const g of P.groups){
    const keys = Object.keys(g.days); if (!keys.some(k=>g.days[k].length) && !g.maybe.length) continue;
    t += `\n${g.title} (${fmtRange(g.w.fri,g.w.sun)})\n`;
    keys.forEach(k=>{ t += `  ${dayLabel(k)}: ${g.days[k].length ? g.days[k].map(({e})=>"✓ "+line(e)).join("; ") : "free"}\n`; });
    g.maybe.forEach(({e})=>t += `  ? ${line(e)}\n`);
  }
  for (const g of [P.wn, P.later]){
    if (!g.locked.length && !g.maybe.length) continue;
    t += `\n${g.title}\n`;
    g.locked.forEach(({e,k})=>t += `  ✓ ${dayLabel(k)}: ${line(e)}\n`);
    g.maybe.forEach(({e})=>t += `  ? ${line(e)}\n`);
  }
  if (P.dl.length) t += `\nDeadlines\n` + P.dl.map(e=>`  ! ${e.title}: ${e.when}\n`).join("");
  if (P.flex.length) t += `\nStill to pick a day\n` + P.flex.map(e=>`  ? ${e.title} (${e.when})\n`).join("");
  return t;
}
/* ---------- map ---------- */
const proj = (lat,lon) => [ (lon-BBOX[2])/(BBOX[3]-BBOX[2])*MAP_W, (BBOX[1]-lat)/(BBOX[1]-BBOX[0])*MAP_H ];
function boxAround(lat,lon,spanMi){ const [x,y]=proj(lat,lon); const w=spanMi/((BBOX[3]-BBOX[2])*69*Math.cos(37.6*Math.PI/180))*MAP_W; return [x-w/2,y-w/2,w,w]; }
const PRESETS = {"Bay Area":boxAround(37.68,-122.25,58), "San Francisco":boxAround(37.783,-122.43,8), "Peninsula":boxAround(37.56,-122.27,24), "Near home":boxAround(HOME.lat,HOME.lon,11), "San Jose":boxAround(37.33,-121.89,6), "Santa Cruz":boxAround(36.975,-122.0,10), "Monterey & Carmel":boxAround(36.59,-121.90,10), "Marin":boxAround(37.95,-122.55,22), "Napa & Sonoma":boxAround(38.38,-122.50,42), "Everything":[0,0,MAP_W,MAP_H]};
let vb = [...PRESETS["Bay Area"]];
try { const s = JSON.parse(localStorage.getItem("wf-vb2")); if (s && s.length===4) vb = s; } catch(e) {}
let starOnly = false;
function mapHTML(){
  return `<div class="zoombar">${Object.keys(PRESETS).map(k=>`<button class="zbtn" data-preset="${k}">${k}</button>`).join("")}<button class="zbtn" data-staronly aria-pressed="${starOnly}">★ Starred only</button></div>
  <div class="mapwrap" id="mapwrap" style="aspect-ratio:${MAP_W}/${MAP_H}"><svg id="map" role="img" aria-label="Map of event locations from San Francisco to Carmel"></svg>
  <div class="zctl"><button data-zoom="0.6" aria-label="Zoom in">+</button><button data-zoom="1.6" aria-label="Zoom out">−</button></div></div>
  <div class="legend">${Object.keys(CATS).map(k=>`<span><i style="background:${CATS[k].color}"></i>${CATS[k].label}</span>`).join("")}<span><i style="background:#fff;border:3px solid #B9531F;width:12px;height:12px"></i>Home</span><span><i style="background:#FFD54A;border:2px solid #1B2430"></i>Starred</span></div>
  <div class="note">Tap a pin to see the event. Drag to pan, pinch or use +/− to zoom. Pins are approximate.</div>
  <div class="sheet" id="sheet"></div>`;
}
function drawMap(){
  const svg = document.getElementById("map"); if(!svg) return;
  const pxPer = svg.clientWidth ? vb[2]/svg.clientWidth : 1;
  const r = 11*pxPer, fs = 11*pxPer;
  const items = filtered().filter(e=>e.lat!=null && (!starOnly || starredIds().includes(e.id)));
  const groups = {};
  items.forEach(e=>{ const k=e.lat.toFixed(3)+","+e.lon.toFixed(3); (groups[k]=groups[k]||[]).push(e); });
  let pins = "";
  Object.values(groups).forEach(g=>{
    g.forEach((e,i)=>{
      let [x,y]=proj(e.lat,e.lon);
      if (g.length>1){ const a=i/g.length*2*Math.PI; x+=Math.cos(a)*r*1.3; y+=Math.sin(a)*r*1.3; }
      const sel = state.sel===e.id, st = starredIds().includes(e.id);
      pins += `<g class="pin" data-pin="${esc(e.id)}" role="button" tabindex="0" aria-label="#${e.n} ${esc(e.title)}">${st?`<circle cx="${x}" cy="${y}" r="${(sel?r*1.35:r)+3.5*pxPer}" fill="#FFD54A" stroke="#1B2430" stroke-width="${1.2*pxPer}"/>`:''}<circle cx="${x}" cy="${y}" r="${sel?r*1.35:r}" fill="${(CATS[e.cat]||CATS.evt).color}" stroke="#fff" stroke-width="${2*pxPer}"/><text x="${x}" y="${y+fs*0.36}" text-anchor="middle" font-size="${String(e.n||"").length>2?fs*0.8:fs}" font-weight="700" fill="#fff" font-family="Inter,sans-serif">${e.n||""}</text></g>`;
    });
  });
  const [hx,hy]=proj(HOME.lat,HOME.lon);
  const labels = [["San Francisco",37.745,-122.47],["Daly City",37.675,-122.48],["San Mateo",37.535,-122.33],["Redwood City",37.47,-122.25],["Palo Alto",37.425,-122.17],["San Jose",37.36,-121.92],["Half Moon Bay",37.44,-122.43],["Oakland",37.83,-122.23],["Pacific Ocean",37.25,-122.55],["SF Bay",37.6,-122.25],["Santa Cruz",37.0,-122.02],["Capitola",36.99,-121.95],["Watsonville",36.92,-121.77],["Monterey Bay",36.8,-122.0],["Monterey",36.6,-121.86],["Pacific Grove",36.635,-121.93],["Carmel",36.545,-121.9],["Salinas",36.68,-121.66],["Sausalito",37.86,-122.49],["Tiburon",37.885,-122.44],["San Rafael",37.975,-122.53],["Mill Valley",37.91,-122.56],["Point Reyes",38.07,-122.84],["Petaluma",38.235,-122.64],["Sonoma",38.29,-122.46],["Napa",38.30,-122.29],["Santa Rosa",38.44,-122.71],["Healdsburg",38.61,-122.87],["Calistoga",38.58,-122.58],["St. Helena",38.505,-122.47]];
  const lf = 12*pxPer;
  const lab = labels.map(([t,la,lo])=>{const [x,y]=proj(la,lo);const water=t==="Pacific Ocean"||t==="SF Bay"||t==="Monterey Bay";return `<text x="${x}" y="${y}" text-anchor="middle" font-size="${lf}" font-weight="600" fill="${water?'#5F86A8':'#8A8F94'}" font-family="Inter,sans-serif" font-style="${water?'italic':'normal'}" pointer-events="none">${t}</text>`}).join("");
  svg.setAttribute("viewBox", vb.join(" "));
  svg.innerHTML = `<rect x="-2000" y="-2000" width="${MAP_W+4000}" height="${MAP_H+4000}" fill="#F3F1EA"/><path d="${COAST}" fill="#CFE0EE" fill-rule="evenodd" stroke="#A9C3DA" stroke-width="${1.2*pxPer}"/>${lab}
  <circle cx="${hx}" cy="${hy}" r="${8*pxPer}" fill="#fff" stroke="#B9531F" stroke-width="${3.5*pxPer}"/><text x="${hx+12*pxPer}" y="${hy+24*pxPer}" text-anchor="middle" font-size="${lf}" font-weight="700" fill="#B9531F" font-family="Inter,sans-serif" pointer-events="none">Home</text>${pins}`;
  try { localStorage.setItem("wf-vb2", JSON.stringify(vb)); } catch(e) {}
}
function showSheet(){
  const s = document.getElementById("sheet"); if(!s) return;
  const e = DATA.find(d=>d.id===state.sel);
  s.innerHTML = e ? cardHTML(e) : "";
}
function zoom(f, cx, cy){
  const nw = Math.min(MAP_W*1.4, Math.max(MAP_W*0.025, vb[2]*f)); const k = nw/vb[2];
  if (cx==null){ cx = vb[0]+vb[2]/2; cy = vb[1]+vb[3]/2; }
  vb = [cx-(cx-vb[0])*k, cy-(cy-vb[1])*k, nw, vb[3]*k]; drawMap();
}
function fitAspect(b){ const svg=document.getElementById("map"); if(!svg||!svg.clientWidth) return b; const ar=svg.clientHeight/svg.clientWidth; let [x,y,w,h]=b; if(h/w<ar){const nh=w*ar; y-=(nh-h)/2; h=nh;} else {const nw=h/ar; x-=(nw-w)/2; w=nw;} return [x,y,w,h]; }
function bindMap(){
  const svg = document.getElementById("map"); if(!svg) return;
  vb = fitAspect(vb); drawMap(); showSheet();
  const pts = new Map(); let last=null, moved=false;
  const toSvg = (cx,cy)=>{ const r=svg.getBoundingClientRect(); return [vb[0]+(cx-r.left)/r.width*vb[2], vb[1]+(cy-r.top)/r.height*vb[3]]; };
  svg.addEventListener("pointerdown", ev=>{ svg.setPointerCapture(ev.pointerId); pts.set(ev.pointerId,[ev.clientX,ev.clientY]); moved=false; last=null; });
  svg.addEventListener("pointermove", ev=>{
    if(!pts.has(ev.pointerId)) return; const prev=pts.get(ev.pointerId); pts.set(ev.pointerId,[ev.clientX,ev.clientY]);
    const r=svg.getBoundingClientRect();
    if (pts.size===1){ if(Math.abs(ev.clientX-prev[0])+Math.abs(ev.clientY-prev[1])>1) moved=true; vb[0]-=(ev.clientX-prev[0])/r.width*vb[2]; vb[1]-=(ev.clientY-prev[1])/r.height*vb[3]; svg.setAttribute("viewBox",vb.join(" ")); }
    else if (pts.size===2){ const [a,b]=[...pts.values()]; const d=Math.hypot(a[0]-b[0],a[1]-b[1]); if(last){ const [cx,cy]=toSvg((a[0]+b[0])/2,(a[1]+b[1])/2); zoom(last/d,cx,cy);} last=d; moved=true; }
  });
  const up = ev=>{ pts.delete(ev.pointerId); if(pts.size<2) last=null; if(pts.size===0){ if(moved) drawMap(); else { const g=document.elementFromPoint(ev.clientX,ev.clientY)?.closest("[data-pin]"); if(g){ state.sel=g.dataset.pin; drawMap(); showSheet(); document.getElementById("sheet").scrollIntoView({behavior:"smooth",block:"nearest"}); } } } };
  svg.addEventListener("pointerup", up); svg.addEventListener("pointercancel", up);
  svg.addEventListener("wheel", ev=>{ ev.preventDefault(); const [cx,cy]=toSvg(ev.clientX,ev.clientY); zoom(ev.deltaY>0?1.15:0.87,cx,cy); }, {passive:false});
  svg.addEventListener("keydown", ev=>{ const g=ev.target.closest&&ev.target.closest("[data-pin]"); if(g&&(ev.key==="Enter"||ev.key===" ")){ ev.preventDefault(); state.sel=g.dataset.pin; drawMap(); showSheet(); } });
}
/* ---------- home location ---------- */
function homeBox(){
  if (!state.editHome || state.view==="our-list") return "";
  return `<div class="homebox"><strong>Where's home?</strong><p class="ournote">Distances, the distance filter and the map's “Near home” view use this. It's saved on this phone only.</p>
  <form id="homeform" class="homeform" onsubmit="event.preventDefault();findHome()"><input id="homeq" type="text" inputmode="search" autocomplete="street-address" placeholder="Address, city or ZIP" aria-label="Address, city or ZIP"><button class="copybtn" data-homefind type="submit">Set</button></form>
  <div class="btnrow"><button class="copybtn alt" data-homegps>Use my current location</button>${HOME.name!==HOME_DEFAULT.name||HOME.lat!==HOME_DEFAULT.lat?`<button class="copybtn alt" data-homereset>Back to Mountain View</button>`:""}<button class="copybtn alt" data-homeclose>Done</button></div>
  ${state.homeMsg?`<p class="ournote homemsg">${esc(state.homeMsg)}</p>`:""}<p class="ournote small">Addresses are looked up with OpenStreetMap.</p></div>`;
}
function setHome(h, msg){
  HOME = h; try { localStorage.setItem("wf-home", JSON.stringify(h)); } catch(e) {}
  PRESETS["Near home"] = boxAround(h.lat, h.lon, 11);
  measure(); state.homeMsg = msg || `Home set to ${h.name}. Distances updated.`; render();
}
async function findHome(){
  const i = document.getElementById("homeq"), q = (i && i.value || "").trim();
  if (!q) return;
  state.homeMsg = "Looking it up…"; const keep = q; render(); const j = document.getElementById("homeq"); if (j) j.value = keep;
  try {
    const r = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=" + encodeURIComponent(q), {headers:{"Accept":"application/json"}});
    const res = await r.json();
    if (!res || !res.length){ state.homeMsg = "Couldn't find that. Try adding the city, or just a ZIP code."; render(); return; }
    const lat = +res[0].lat, lon = +res[0].lon, a = res[0].address || {};
    const name = (q.length <= 22 ? q : (res[0].name || q.split(",")[0])).slice(0, 28);
    const far = miles(lat, lon, 37.2, -122.0) > 120;
    setHome({name, lat, lon}, far ? `Home set to ${name}, but that's a long way from these events, so most distances will be large.` : "");
  } catch(e) { state.homeMsg = "Couldn't reach the address lookup. Check your connection, or use your current location."; render(); }
}
function gpsHome(){
  if (!navigator.geolocation){ state.homeMsg = "This browser can't share your location."; render(); return; }
  state.homeMsg = "Finding you…"; render();
  navigator.geolocation.getCurrentPosition(p => setHome({name:"My location", lat:+p.coords.latitude.toFixed(4), lon:+p.coords.longitude.toFixed(4)}),
    () => { state.homeMsg = "Location wasn't shared. You can type an address instead."; render(); }, {timeout:15000, maximumAge:600000});
}
/* ---------- render ---------- */
function updateCount(){ const n = starredIds().length; document.getElementById("savedCount").textContent = n ? `(${n})` : ""; }
function render(){
  document.querySelectorAll(".tab").forEach(t=>t.setAttribute("aria-selected", t.dataset.view===state.view));
  updateCount(); renderFilters();
  const m = document.getElementById("main");
  if (state.view==="map"){ m.innerHTML = mapHTML(); requestAnimationFrame(bindMap); }
  else m.innerHTML = state.view==="our-list" ? renderOurList() : renderEvents();
  if (state.view!=="our-list") m.insertAdjacentHTML("afterbegin", homeBox());
  document.documentElement.style.setProperty("--hh", document.getElementById("hdr").offsetHeight+"px");
  document.documentElement.style.setProperty("--fh", document.getElementById("filters").offsetHeight+"px");
}
function refreshStars(){
  // update stars in place without resetting the map or scroll
  if (state.view==="our-list"){ const y=scrollY; document.getElementById("main").innerHTML = renderOurList(); scrollTo(0,y); }
  else if (state.view==="map"){ drawMap(); showSheet(); }
  else { const y=scrollY; document.getElementById("main").innerHTML = homeBox() + renderEvents(); scrollTo(0,y); }
  updateCount();
}
async function toggleStar(id){
  if (pending.has(id)) return;
  const e = DATA.find(d=>d.id===id) || (picks.get(id)&&picks.get(id).item) || {id};
  if (shared && canWrite){
    pending.add(id);
    const ref = db.collection("picks").doc((id+"--"+me).replace(/[^A-Za-z0-9_\-.~:@+]/g,"_").slice(0,190));
    const mine = starredByMe(id);
    // optimistic
    const p = picks.get(id) || {uids:[], item:e};
    p.uids = mine ? p.uids.filter(u=>u!==me) : [...p.uids, me];
    if (p.uids.length) picks.set(id,p); else picks.delete(id);
    refreshStars();
    try {
      if (mine) await ref.delete();
      else await ref.set({id, uid:me, at:new Date().toISOString(), item:{id:e.id, n:e.n||null, title:e.title||"", when:e.when||"", meta:e.meta||"", cat:e.cat||"evt", q:e.q||null, url:e.url||null, lat:e.lat??null, lon:e.lon??null}});
    } catch(err) {
      // couldn't write the shared list: keep stars on this device instead (and in the page address)
      const mineNow = [...picks.entries()].filter(([k,p])=>p.uids.includes(me)).map(([k])=>k);
      canWrite=false; shared=false;
      mineNow.forEach(k=>localSaved.add(k)); if (mine) localSaved.delete(id); else localSaved.add(id);
      persistLocal();
      dbNote = "The shared list couldn't be saved to, so stars are being kept on this device.";
      refreshStars();
    } finally { pending.delete(id); }
  } else {
    localSaved.has(id) ? localSaved.delete(id) : localSaved.add(id); persistLocal(); refreshStars();
  }
}
async function resolveNames(){
  if (!userApi || !userApi.profiles) return;
  const ids = [...new Set([...picks.values()].flatMap(p=>p.uids))].filter(u=>u!==me);
  if (!ids.length) return;
  try { const ps = await userApi.profiles(ids); let changed=false; ids.forEach(i=>{ const nm=(ps&&ps[i]&&ps[i].name)||""; if(nm && names[i]!==nm){ names[i]=nm.split(" ")[0]; changed=true; } }); if(changed) refreshStars(); } catch(e) {}
}
async function connect(){
  try {
    if (!window.claude || !window.claude.use) return;
    [db, userApi] = await Promise.all([window.claude.use("db"), window.claude.use("user")]);
    if (!db || !userApi) return;
    me = await userApi.id();
    if (!me) return;
    try { const c = await userApi.can("data.write"); if (c===false) return; } catch(e) {}  // view-only visitors keep stars on their own device
    // carry over any stars made on this device before sharing was on
    const carry = [...localSaved];
    let first = true;
    const timer = setTimeout(()=>{ dbNote="Couldn't reach the shared list yet; it may be out of date."; if(state.view==="our-list") refreshStars(); }, 10000);
    db.collection("picks").onSnapshot(snap=>{
      if (!snap.metadata.fromCache){ clearTimeout(timer); dbNote=""; }
      const m = new Map();
      snap.docs.forEach(d=>{ const x=d.data(); if(!x||typeof x.id!=="string"||typeof x.uid!=="string") return; if(!m.has(x.id)) m.set(x.id,{uids:[],item:x.item||{id:x.id}}); const p=m.get(x.id); if(!p.uids.includes(x.uid)) p.uids.push(x.uid); });
      picks = m; shared = true;
      if (first){ first=false; render();
        if (canWrite && pendingImport.length) carry.push(...pendingImport.filter(x=>!carry.includes(x)));
        if (canWrite && carry.length){ (async()=>{ for (const id of carry){ if(!starredByMe(id)) await toggleStar(id); } localSaved.clear(); persistLocal(); })(); } else syncHash();
      } else refreshStars();
      resolveNames();
    }, err=>{ clearTimeout(timer); dbNote="The shared list isn't available right now."; shared=false; refreshStars(); });
  } catch(e) {}
}
document.addEventListener("click", ev=>{
  const t = ev.target.closest("button"); if(!t) return;
  if (t.dataset.view){ state.view=t.dataset.view; try{localStorage.setItem("wf-view2",state.view);}catch(e){} render(); syncHash(); window.scrollTo(0,0); }
  else if (t.dataset.jump){ const el=document.getElementById(t.dataset.jump); if(el){ const off=document.getElementById("filters").offsetHeight+8; scrollTo({top:el.getBoundingClientRect().top+scrollY-off, behavior:"smooth"}); } }
  else if (t.dataset.group){ state.group=t.dataset.group; try{localStorage.setItem("wf-group",state.group);}catch(e){} render(); }
  else if (t.dataset.cat){ state.cat=t.dataset.cat; render(); }
  else if (t.hasAttribute("data-filtopen")){ state.filtOpen = !state.filtOpen; render(); }
  else if (t.dataset.distv!=null){ state.dist = +t.dataset.distv; try{localStorage.setItem("wf-dist",state.dist);}catch(e){} render(); }
  else if (t.hasAttribute("data-freset")){ state.cat="all"; state.dist=0; try{localStorage.setItem("wf-dist",0);}catch(e){} render(); }
  else if (t.hasAttribute("data-sethome")){ state.filtOpen = false; state.editHome = !state.editHome; state.homeMsg=""; render(); if (state.editHome) setTimeout(()=>{ const i=document.getElementById("homeq"); if(i) i.focus(); },50); }
  else if (t.hasAttribute("data-homefind")){ findHome(); }
  else if (t.hasAttribute("data-homegps")){ gpsHome(); }
  else if (t.hasAttribute("data-homereset")){ setHome({...HOME_DEFAULT}); try{localStorage.removeItem("wf-home");}catch(e){} }
  else if (t.hasAttribute("data-homeclose")){ state.editHome=false; render(); }
  else if (t.dataset.star){ toggleStar(t.dataset.star); }
  else if (t.dataset.expand){ const id=t.dataset.expand; openRows.has(id)?openRows.delete(id):openRows.add(id); refreshStars(); }
  else if (t.hasAttribute("data-expandall")){ const ids=[...document.querySelectorAll("[data-expand]")].map(b=>b.dataset.expand); const all=ids.every(i=>openRows.has(i)); ids.forEach(i=>all?openRows.delete(i):openRows.add(i)); refreshStars(); }
  else if (t.dataset.lock){ toggleLock(t.dataset.lock, t.dataset.k); }
  else if (t.dataset.preset){ vb = fitAspect([...PRESETS[t.dataset.preset]]); drawMap(); }
  else if (t.hasAttribute("data-staronly")){ starOnly=!starOnly; t.setAttribute("aria-pressed",starOnly); drawMap(); }
  else if (t.dataset.zoom){ zoom(+t.dataset.zoom); }
  else if (t.hasAttribute("data-sendlink")){
    const link = picksLink(); const out = document.getElementById("copyout");
    const fallback = ()=>{ out.innerHTML = `<p class="ournote">Copy this link and open it on the other device, or text it to someone:</p><textarea class="copyarea" readonly rows="3"></textarea>`; const ta=out.querySelector("textarea"); ta.value=link; ta.focus(); ta.select(); };
    try { navigator.clipboard.writeText(link).then(()=>{ t.textContent="Link copied ✓"; out.innerHTML=`<p class="ournote">Link copied. Paste it into a text or email, then open it on the other device.</p>`; setTimeout(()=>t.textContent="Send my picks",2500); }, fallback); } catch(e) { fallback(); }
  }
  else if (t.hasAttribute("data-copy")){
    const txt = listText(); const out = document.getElementById("copyout");
    const fallback = ()=>{ out.innerHTML = `<p class="ournote">Copy this and paste it into a text:</p><textarea class="copyarea" readonly rows="8"></textarea>`; const ta=out.querySelector("textarea"); ta.value=txt; ta.focus(); ta.select(); };
    try { navigator.clipboard.writeText(txt).then(()=>{ t.textContent="Copied ✓"; setTimeout(()=>t.textContent="Copy list as text",2000); }, fallback); } catch(e) { fallback(); }
  }
});
document.addEventListener("change", ev=>{ if (ev.target.matches("select[data-dist]")){ state.dist = +ev.target.value; try{localStorage.setItem("wf-dist",state.dist);}catch(e){} render(); return; } const s = ev.target.closest("select[data-plan]"); if (s && s.value) setPlan(s.dataset.plan, s.value); });
window.addEventListener("hashchange", ()=>{ const h=location.hash.slice(1); if(VIEWS.includes(h)&&h!==state.view){ state.view=h; render(); } });
window.addEventListener("resize", ()=>{ if(state.view==="map"){ vb=fitAspect(vb); drawMap(); } document.documentElement.style.setProperty("--hh", document.getElementById("hdr").offsetHeight+"px"); });
render();
connect();
