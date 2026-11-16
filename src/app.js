const WF = window.WF_DATA || {updated:"", items:[]};
const WALKS = window.WF_WALKS || {items:[], nodogs:[]};
const DATA = WF.items.concat(WALKS.items);
// this page's city (src/cities/<key>.json, injected by the build)
const CITY = window.WF_CITY;
const HOME_DEFAULT = {...CITY.home};
const KM = CITY.units === "km";
const UNIT = KM ? "km" : "mi";
let HOME = {...HOME_DEFAULT};
try { const h = JSON.parse(localStorage.getItem("wf-home") || "null"); if (h && isFinite(h.lat) && isFinite(h.lon)) HOME = h; } catch(e) {}
const BBOX = /*BBOX*/[0,0,0,0];
const MAP_W = /*W*/0, MAP_H = /*H*/0;
const COAST = "/*COAST*/";
const COAST_RULE = "/*RULE*/";
const CATS = {hol:{label:"Holiday",color:"#C4562A"},mkt:{label:"Markets",color:"#2F6FA8"},dog:{label:"Dog-friendly",color:"#2E8B5E"},food:{label:"Pizza & coffee",color:"#C98A00"},art:{label:"Art",color:"#6E55A8"},walk:{label:"Dog walks",color:"#0F7C80"},show:{label:"Concerts & shows",color:"#B8336A"},sport:{label:"Sports",color:"#9C2B2B"},film:{label:"Movies",color:"#283593"},kids:{label:"Young kids",color:"#5E9E2F"},teen:{label:"Teens",color:"#5C6BC0"},prog:{label:"Teen programs",color:"#8D6E63"},evt:{label:"Other",color:"#4A5562"}};
const SECTIONS = (WF.sections || [["week","This week"]]).slice();
{ const i = SECTIONS.findIndex(s=>s[0]==="dog"); SECTIONS.splice(i>=0?i+1:1, 0, ["walks","Dog walks · closest to home first"]); }
const VIEWS = ["events","map","our-list"];
/* ---- interests: categories this person said "no" to are hidden from Events and the Map (saved on this device) ---- */
const LIKES = [["hol","lights, Santa, holiday fairs"],["mkt","farmers, craft and holiday markets"],["dog","events and dog walks"],["food","and other food spots"],["art","museums and galleries"],["show","concerts, theater, comedy"],["sport","games to go and watch"],["film","new in theaters"],["kids","things for little ones"],["teen","things for teens"],["prog","programs to apply for"],["evt","special events that fit nowhere else"]];   // [category, hint]; the name is CATS[k].label
let likesOff = new Set(), likesSet = false;
try { const v = localStorage.getItem("wf-likes-off"); if (v!==null){ likesSet = true; likesOff = new Set(JSON.parse(v)); } } catch(e) {}
const likeKey = c => c==="walk" ? "dog" : (c in CATS ? c : "evt");
function saveLikes(){ likesSet = true; try { localStorage.setItem("wf-likes-off", JSON.stringify([...likesOff])); } catch(e) {} }

let state = {q:"", searchOpen:false, free:false, dogok:false, day:"", mapWhen:"wk0", view:"events", cat:"all", dist:0, sel:null, group:"weekend", editHome:false, homeMsg:"", likesOpen:false};
try { const d = +localStorage.getItem("wf-dist"); if (CITY.dists.includes(d)) state.dist = d; } catch(e) {}
try { const g = localStorage.getItem("wf-group"); if (g==="weekend"||g==="date") state.group = g; } catch(e) {}
/* ---- dates & weekends ---- */
const DAYMS = 864e5, DAYN = ["sun","mon","tue","wed","thu","fri","sat"], MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const parseD = s => { const [y,m,d] = String(s).split("-").map(Number); return new Date(y, m-1, d); };
// "today" is the city's date (a Sydney page viewed from California still shows Sydney's weekend)
const TODAY = (()=>{ try { const p = new Intl.DateTimeFormat("en-CA",{timeZone:CITY.tz,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date()).split("-").map(Number); if (p.length===3 && p.every(isFinite)) return new Date(p[0],p[1]-1,p[2]); } catch(e) {} const t = new Date(); t.setHours(0,0,0,0); return t; })();
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
  DATA.forEach(e=>{ e.mi = e.lat!=null ? Math.round(miles(HOME.lat,HOME.lon,e.lat,e.lon) * (KM ? 1.609344 : 1)) : null; });   // in the city's unit (mi or km)
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
// quick filters: free, dog-friendly, Saturday/Sunday; and the search box
const isDogOk = e => e.cat==="dog" || e.cat==="walk" || (/\b(dog[- ]friendly|dogs? (are |on leash )?welcome|leashed dogs|dogs on leash|pets welcome|bring (your|the) (dog|pup))/i.test(e.meta||"") && !/\bno (dogs|pets)\b/i.test(e.meta||""));
const DOW = {sat:6, sun:0};
const onDow = (e, d) => e.cat==="walk" || daysOf(e, TODAY, addD(TODAY,120)).some(x=>parseD(x).getDay()===d);
const norm = t => String(t||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const matchQ = e => { const hay = norm([e.title,e.meta,e.when,(CATS[e.cat]||CATS.evt).label].join(" ")); return norm(state.q).split(/\s+/).filter(Boolean).every(w=>hay.includes(w)); };
function filtered(){
  return DATA.filter(e => (state.cat==="all" ? !likesOff.has(likeKey(e.cat)) : (e.cat===state.cat || (state.cat==="dog" && e.cat==="walk"))) && (!state.dist || (e.mi!=null && e.mi<=state.dist) || (e.cat==="film" && e.lat==null))
    && (!state.free || e.price==="free" || e.cat==="walk") && (!state.dogok || isDogOk(e)) && (!state.day || onDow(e, DOW[state.day])) && (!state.q || matchQ(e)));
}
// "Free" or "Tickets" pill; a ticketed event with a ticket page links straight to it
const okUrl = u => typeof u==="string" && /^https?:\/\//.test(u);
// sports: Home / Away / Neutral site, from the "ha" field, else read from the title ("A vs. B" = home, "A at B" / "A @ B" = away)
function haHTML(e){
  if (e.cat!=="sport") return "";
  const t = e.ha || (/\s(at|@)\s/i.test(e.title||"") ? "away" : /\svs?\.?\s/i.test(e.title||"") ? "home" : "");
  const L = {home:"Home game", away:"Away game", neutral:"Neutral site"}[t];
  return L ? `<span class="ha ha-${t}">${L}</span>` : "";
}
function priceHTML(e){
  if (e.price==="free") return `<span class="price free">Free</span>`;
  if (e.price==="tickets"){ const u = okUrl(e.tix) ? e.tix : okUrl(e.url) ? e.url : ""; return u ? `<a class="price tix" href="${esc(u)}" target="_blank" rel="noopener" data-k="outbound_tickets" data-ev="${esc(e.id)}">Tickets ↗</a>` : `<span class="price tix">Tickets required</span>`; }
  return "";
}
// new movies: "Showtimes" searches for screenings near home (Google lists Bay Area theaters and times)
const showtimesUrl = e => "https://www.google.com/search?q=" + encodeURIComponent(`${e.title} showtimes near ${HOME.name}`);
const isRelease = e => e.cat==="film" && e.lat==null;
function filmRow(e){
  const mine = starredByMe(e.id);
  return `<div class="crow film"><button class="star" aria-label="${mine?'Unstar':'Star'}: ${esc(e.title)}" aria-pressed="${mine}" data-star="${esc(e.id)}">${STAR}</button>
  <div><span class="ct">${esc(e.title)}</span><span class="cw">${esc(e.when)}${e.meta?` · ${esc(e.meta.replace(/^In theaters( nationwide)?( · )?/i,""))}`:""}</span></div>
  <span class="flinks"><a href="${esc(showtimesUrl(e))}" target="_blank" rel="noopener" data-k="outbound_showtimes" data-ev="${esc(e.id)}">Showtimes ↗</a>${e.url?`<a href="${esc(e.url)}" target="_blank" rel="noopener" data-k="outbound_more_info" data-ev="${esc(e.id)}">Trailer & info ↗</a>`:""}</span></div>`;
}
// weekly markets and new movies: one box with a dropdown instead of a card each, so a dozen markets don't fill the page
const isWeeklyMkt = e => e.cat==="mkt" && (/(^|-)fm-/.test(e.id) || (e.sec==="week" && Array.isArray(e.dates) && e.dates.length>=4));
const pickSel = {};   // box key -> chosen event id (kept while the page is open)
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const shortName = e => e.title.replace(/\s*\(.*\)\s*$/,"").replace(/\s+(farmers'?\s+)?markets?$/i,"").trim() || e.title;
function pickBox(key, list, kind, a, b){
  const fm = kind==="mkt";
  const sorted = fm ? [...list].sort((x,y)=>(x.mi==null?1e9:x.mi)-(y.mi==null?1e9:y.mi)) : list;
  let sel = pickSel[key] && sorted.find(e=>e.id===pickSel[key]);
  if (!sel) sel = sorted.find(e=>lockKey(e.id)) || sorted.find(e=>starredByMe(e.id)) || sorted[0];
  const days = e => { if (!a || !e.dates) return ""; return [...new Set(e.dates.map(parseD).filter(t=>t>=a&&t<=b).map(t=>cap(DAYN[t.getDay()])))].join(" & "); };
  const opens = e => { const s = startOf(e); return s && a ? "opens " + cap(DAYN[s.getDay()]) : ""; };
  const nm = e => sorted.filter(x=>shortName(x)===shortName(e)).length>1 ? e.title : shortName(e);   // two "Bondi"s: use the full names
  const label = e => (starredByMe(e.id)?"★ ":"") + (fm ? [nm(e), days(e), e.mi!=null?`${e.mi} ${UNIT}`:""] : [e.title, opens(e)]).filter(Boolean).join(" · ");
  const title = fm ? (list.every(e=>/farmers/i.test(e.title)) ? "Farmers markets" : "Weekly markets") : "New in theaters";
  const n = `${list.length} ${fm?"market":"movie"}${list.length===1?"":"s"}`;
  return `<div class="pickbox ${fm?"mktbox":"filmbox"}"><label class="pk-h"${list.length>1?` for="pk-${key}"`:""}><span><span class="cico" style="color:${CATS[fm?"mkt":"film"].color}">${wfIco(fm?"mkt":"film")}</span>${title}</span><span class="pk-n">${n}</span></label>${list.length>1?`<select id="pk-${key}" data-pick="${key}">${sorted.map(e=>`<option value="${esc(e.id)}"${e===sel?" selected":""}>${esc(label(e))}</option>`).join("")}</select>`:""}${cardHTML(sel,false,"","inbox")}</div>`;
}
function likesBox(){
  if (state.view==="our-list") return "";
  if (!state.likesOpen) return "";   // opened from Filter events › My interests (kept off the main screen to keep it calm)
  return `<div class="likesbox"><div class="lb-h"><strong>${likesSet?"Your interests":"What are you into?"}</strong><button class="linkbtn" data-likesdone>Close ▴</button></div><p class="ournote">Say no to anything you'd rather not see, and it's hidden from Events and the Map. You can change this any time under Filter events.</p>
  <div class="likes">${LIKES.map(([k,t])=>{ const on=!likesOff.has(k); return `<div class="like"><i class="dot" style="background:${CATS[k].color}"></i><span>${CATS[k].label}<small>${t}</small></span><div class="yn" role="group" aria-label="${esc(CATS[k].label)}"><button data-like="${k}" data-v="1" aria-pressed="${on}">Yes</button><button data-like="${k}" data-v="0" aria-pressed="${!on}">No</button></div></div>`; }).join("")}</div>
  <div class="btnrow"><button class="copybtn" data-likesdone>Done · show ${DATA.filter(e=>!isPast(e)&&!likesOff.has(likeKey(e.cat))).length} events</button>${likesOff.size?`<button class="copybtn alt" data-likesall>Show everything</button>`:""}</div></div>`;
}
const FREE_SEG = /^(free|free entry|free admission|free drop-in|free walk-in)$/i;
const metaText = e => e.price==="free" ? (e.meta||"").split(" · ").filter(s=>!FREE_SEG.test(s.trim())).join(" · ") : (e.meta||"");
// once something has opened, "Opens Fri Nov 13" reads as "Now through Jan 1" (movies: "In theaters now")
function whenText(e){
  const w = String(e.when||""); if (!/^Opens\b/i.test(w) || !e.start || parseD(e.start) >= TODAY) return w;
  const more = w.split(" · ").slice(1).join(" · "), t = e.end && parseD(e.end);
  const now = e.cat==="film" ? "In theaters now" : t ? `Now through ${MON[t.getMonth()]} ${t.getDate()}` : "Now open";
  return now + (more ? " · " + more : "");
}
function cardHTML(e, gone, extra, cls){
  const c = CATS[e.cat] || CATS.evt;
  const mine = starredByMe(e.id);
  return `<article class="card${cls?" "+cls:""}" id="card-${esc(e.id)}">
    <div><div class="when">${esc(whenText(e))}</div><div class="title">${esc(e.title)}</div><div class="meta">${esc(metaText(e))}${e.tbc?' · <span class="tbc">2026 date TBC</span>':''}${gone?' · <span class="tbc">no longer in the current list (may be over)</span>':''}</div></div>
    <button class="star" aria-label="${mine?'Unstar':'Star'}: ${esc(e.title)}" aria-pressed="${mine}" data-star="${esc(e.id)}">${STAR}</button>
    <div class="row2">${e.n&&cls==="onmap"?`<span class="num">#${e.n}</span>`:''}<span class="tag c-${e.cat in CATS?e.cat:'evt'}">${wfIco(e.cat in CATS?e.cat:"evt")}${c.label}</span>${haHTML(e)}${priceHTML(e)}${e.mi!=null?`<span class="dist">${wfIco("pin")}${e.mi} ${UNIT}</span>`:''}${whoLine(e.id)}${!extra&&lockKey(e.id)&&parseD(lockKey(e.id))>=TODAY?`<span class="planned">✓ ${dayLabel(lockKey(e.id))}</span>`:""}</div><div class="links"><a class="lbtn primary" href="${esc(infoUrl(e))}" target="_blank" rel="noopener">${e.url?"More info":"Search for it"} ↗</a>${isRelease(e)?`<a class="lbtn" href="${esc(showtimesUrl(e))}" target="_blank" rel="noopener" data-k="outbound_showtimes" data-ev="${esc(e.id)}">Showtimes ↗</a>`:e.lat!=null||e.q?`<a class="lbtn" href="${gmaps(e)}" target="_blank" rel="noopener">Directions ↗</a>`:''}</div>${extra||""}
  </article>`;
}
// icons by Gregor Cresnar (Noun Project, royalty-free on the owner's Noun Pro plan); sources in src/icons
const ICO_SEARCH = '<svg class="ico" viewBox="180 180 840 840" aria-hidden="true"><path fill="currentColor" d="m540 840c64.688 0 126.24-20.391 178.22-58.922l16.688-12.375 184.22 184.22c8.8594 8.8594 25.078 8.8594 33.938 0 9.375-9.375 9.375-24.609 0-33.938l-184.22-184.22 12.375-16.688c38.531-51.938 58.922-113.62 58.922-178.22 0-165.47-134.53-300-300-300s-300 134.53-300 300 134.53 300 300 300zm0-552c138.94 0 252 113.06 252 252s-113.06 252-252 252-252-113.06-252-252 113.06-252 252-252z"/></svg>', ICO_HOME = '<svg class="ico" viewBox="180 180 840 840" aria-hidden="true"><path fill="currentColor" d="m616.92 496.92c9.375-9.375 9.375-24.609 0-33.938-4.5469-4.5469-10.547-6.9375-16.922-6.9375s-12.469 2.5312-16.922 6.9375c-9.375 9.375-9.375 24.609 0 33.938 8.8594 8.8594 25.078 8.8594 33.938 0zM336 948h528c52.922 0 96-43.078 96-96v-301.31c0-37.078-16.688-71.531-45.844-94.312l-215.76-169.45c-12.938-10.219-25.219-17.625-37.688-22.688-19.312-8.0625-39.703-12-60.609-12-35.062 0-69.375 11.766-96.609 33.234l-217.69 171c-29.156 22.922-45.844 57.234-45.844 94.312v301.31c0 52.922 43.078 96 96 96zm336-48h-144v-144c0-39.703 32.297-72 72-72s72 32.297 72 72zm-384-349.31c0-22.219 10.078-42.844 27.469-56.625l218.16-171.37c39.141-30.703 93.609-30.703 132.71 0l218.16 171.24c17.531 13.781 27.469 34.453 27.469 56.625v301.31c0 26.531-21.469 48-48 48h-144v-144c0-66.141-53.859-120-120-120s-120 53.859-120 120v144h-144c-26.531 0-48-21.469-48-48v-301.31z"/></svg>';
// line icons for each category (Gregor Cresnar, Noun Project; src/icons). build.py fills WF_ICONS from src/icons/paths.json
const WF_ICONS = /*ICONS*/{};
const ICO_KEY = {hol:"holiday-gift-7647994", mkt:"markets-basket-7647949", dog:"dog-paw-1686619", walk:"dog-paw-1686619", food:"food-coffee-7648022", art:"art-paintbrush-7649979", show:"shows-microphone-7648374", sport:"sports-arena-7649252", film:"movies-video-7274354", kids:"kids-teddy-7649884", teen:"teens-headphones-7648703", prog:"programs-book-7649981", evt:"other-ticket-7274265", pin:"location-pin-7648253", star:"plans-star-7648091"};
function wfIco(k, cls){ const v = WF_ICONS[ICO_KEY[k] || k]; if (!v) return ""; return `<svg class="${cls||"ico"}" viewBox="${v.vb}" aria-hidden="true">${v.d.map(d=>`<path fill="currentColor" d="${d}"/>`).join("")}</svg>`; }
const EMPTY_STAR = () => `<span class="emptyico">${wfIco("star","ico big")}</span>`;
const DISTS = [[0,"Any distance"], ...CITY.dists.map(d=>[d, d+" "+UNIT])];
function renderFilters(){
  const f = document.getElementById("filters");
  if (state.view==="our-list"){ f.innerHTML=""; f.style.display="none"; return; }
  f.style.display="";
  const catLabel = state.cat==="all" ? (likesOff.size ? "My interests" : "All") : CATS[state.cat].label;
  const distLabel = state.dist ? `Within ${state.dist} ${UNIT}` : "Any distance";
  const quick = [state.free&&"Free", state.dogok&&"Dog-friendly", state.day&&(state.day==="sat"?"Saturday":"Sunday")].filter(Boolean);
  const active = (state.cat!=="all") + (!!state.dist) + quick.length;
  let h = `<div class="fbar"><button class="filterbtn${active?" on":""}" data-filtopen aria-expanded="${!!state.filtOpen}" aria-controls="fpanel">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4-2v-4z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
    <span class="ftxt"><span class="flabel">Filter<span class="xw"> events</span></span><span class="fsum">${esc([catLabel, distLabel, ...quick].join(" · "))}</span></span>${active?`<span class="fcount">${active}</span>`:""}<span class="fcaret">${state.filtOpen?"▴":"▾"}</span></button>
    <button class="chip searchbtn" data-search aria-label="Search events">${ICO_SEARCH}</button>
    <button class="chip homechip" data-sethome aria-label="Change home location, now ${esc(HOME.name)}">${ICO_HOME} ${esc(HOME.name)}</button></div>`;
  if (state.searchOpen) h = `<div class="fbar sbar"><input type="search" id="q" value="${esc(state.q)}" placeholder="Search events, places, towns" aria-label="Search events" autocomplete="off" enterkeyhint="search"><button class="chip" data-searchclose>Cancel</button></div>`;
  if (state.filtOpen){
    h += `<div class="fpanel" id="fpanel"><div class="fsec">Quick picks</div><div class="fwrap">${[["free","Free"],["dogok",wfIco("dog")+"Dog-friendly"],["sat","Saturday"],["sun","Sunday"]].map(([k,t])=>`<button class="chip" data-quick="${k}" aria-pressed="${k==="sat"||k==="sun" ? state.day===k : !!state[k]}">${t}</button>`).join("")}</div><div class="fsec">Show</div><div class="fwrap"><button class="chip" data-cat="all" aria-pressed="${state.cat==='all'}">${likesOff.size?"All my interests":"All events"}</button>`;
    for (const k in CATS) if (k!=="walk") h += `<button class="chip" data-cat="${k}" aria-pressed="${state.cat===k}"><span class="cico" style="color:${CATS[k].color}">${wfIco(k)}</span>${CATS[k].label}</button>`;
    h += `</div><div class="fsec">My interests <button class="linkbtn" data-likesopen>edit</button></div><p class="fnote">${likesOff.size ? "Hiding: " + esc([...likesOff].map(k=>CATS[k]?CATS[k].label:k).join(", ")) : "Showing every kind of event."}</p><div class="fsec">Distance from ${esc(HOME.name)} <button class="linkbtn" data-sethome>change</button></div><div class="dseg" role="group" aria-label="Distance">${DISTS.map(([v,t])=>`<button data-distv="${v}" aria-pressed="${state.dist===v}">${t}</button>`).join("")}</div>
    <div class="fdone">${active?`<button class="copybtn alt" data-freset>Clear filters</button>`:""}<button class="copybtn" data-filtopen>Done · show ${filtered().filter(e=>!isPast(e)).length}</button></div></div>`;
  }
  f.innerHTML = h;
}
function compactHTML(e){
  const mine = starredByMe(e.id);
  return `<div class="crow"><button class="star" aria-label="${mine?'Unstar':'Star'}: ${esc(e.title)}" aria-pressed="${mine}" data-star="${esc(e.id)}">${STAR}</button>
  <div><span class="ct">${esc(e.title)}</span><span class="cw">${esc(whenText(e))} · ${esc((e.meta||"").split(" · ")[0])}${e.mi!=null?` · ${e.mi} ${UNIT}`:""}</span></div>
  <a href="${esc(infoUrl(e))}" target="_blank" rel="noopener" data-k="outbound_more_info" data-ev="${esc(e.id)}">Info ↗</a></div>`;
}
function segHTML(){
  return `<div class="seg" role="group" aria-label="Group events"><button data-group="date" aria-pressed="${state.group==='date'}">By date</button><button data-group="weekend" aria-pressed="${state.group==='weekend'}">By weekend</button></div>`;
}
// a calm first look: about 8 events a weekend (yours first, then nearest, a mix of kinds), the rest one tap away
const TOP = 8, showAll = new Set();
const trimming = () => state.cat==="all" && !state.q;
function topPicks(list){
  if (!trimming() || list.length <= TOP + 2) return list;
  const mine = list.filter(e=>starredByMe(e.id) || lockKey(e.id));
  const rest = list.filter(e=>!mine.includes(e)).sort((a,b)=>(a.mi==null?40:a.mi)-(b.mi==null?40:b.mi));
  const pick = new Set(mine), per = {};
  mine.forEach(e=>per[e.cat]=(per[e.cat]||0)+1);
  for (const e of rest){ if (pick.size>=TOP) break; if ((per[e.cat]||0)>=2) continue; pick.add(e); per[e.cat]=(per[e.cat]||0)+1; }
  for (const e of rest){ if (pick.size>=TOP) break; pick.add(e); }
  return list.filter(e=>pick.has(e));
}
const moreBtn = (key, n, what) => `<button class="moreb" data-more="${key}" aria-expanded="${showAll.has(key)}">${showAll.has(key) ? "Show fewer ▴" : `Show all ${n} ${what} ▾`}</button>`;
function cardsTrimmed(key, list, what){
  const top = topPicks(list); if (top.length===list.length || showAll.has(key)) return list.map(e=>cardHTML(e)).join("") + (top.length<list.length ? moreBtn(key, list.length, what) : "");
  return top.map(e=>cardHTML(e)).join("") + moreBtn(key, list.length, what);
}
function renderByWeekend(){
  const all = filtered().filter(e=>!isPast(e));
  const progs = all.filter(e=>e.cat==="prog");
  const films = all.filter(isRelease);
  const items = all.filter(e=>e.cat!=="prog" && !isRelease(e));
  if (state.cat==="prog") return progs.length ? band("wk-progs","Teen winter & summer programs","Sorted by application deadline · apply ahead","#6D4C41") + progs.map(e=>cardHTML(e)).join("") : `<div class="empty">No programs right now.</div>`;
  const W = weekends(), lastSun = W[3].sun;
  const used = new Set();
  const byStart = (a,b)=> (startOf(a)||0)-(startOf(b)||0);
  let h = "";
  W.forEach((w,i)=>{
    const onDay = e => !state.day || daysOf(e, state.day==="sat"?w.sat:w.sun, state.day==="sat"?w.sat:w.sun).length > 0;
    const main = items.filter(e=>occurs(e,w.fri,w.sun)==="main" && onDay(e)).sort(byStart);
    const ong = items.filter(e=>occurs(e,w.fri,w.sun)==="ongoing" && onDay(e));
    main.forEach(e=>used.add(e.id)); ong.forEach(e=>used.add(e.id));
    const fl = films.filter(e=>{ const s=startOf(e); return s && s>=addD(w.fri,-2) && s<=w.sun; }).sort(byStart);
    const mk = main.filter(isWeeklyMkt), rest = mk.length>1 ? main.filter(e=>!isWeeklyMkt(e)) : main;
    h += band("wk-"+i, wkTitle(w), `${wkWhen(w,i)} · ${rest.length} event${rest.length===1?"":"s"}${ong.length?` + ${ong.length} ongoing`:""}${mk.length>1?` · ${mk.length} markets`:""}${fl.length?` · ${fl.length} new movie${fl.length===1?"":"s"}`:""}`, WKC[i]);
    if (mk.length>1) h += pickBox("m"+i, mk, "mkt", w.fri, w.sun);
    if (fl.length) h += pickBox("f"+i, fl, "film", w.fri, w.sun);
    h += rest.length ? cardsTrimmed("w"+i, rest, "events") : (fl.length || mk.length>1) ? "" : `<div class="empty small">Nothing dated for this weekend yet. Check back after the next refresh.</div>`;
    if (ong.length){ const k="o"+i, open = showAll.has(k) || !trimming() || ong.length<=3; h += open ? `<div class="section-h">Also open this weekend</div>` + ong.map(compactHTML).join("") + (ong.length>3 && trimming() ? moreBtn(k, ong.length, "") : "") : `<button class="moreb alsob" data-more="${k}" aria-expanded="false">Also open this weekend (${ong.length}) ▾</button>`; }
  });
  const between = items.filter(e=>!used.has(e.id) && startOf(e) && startOf(e)<=lastSun && !e.days && occurs(e,TODAY,lastSun)==="main").sort(byStart);
  if (between.length){ h += ``+band("",`Weeknights in between`,`Mon–Thu events before ${MON[lastSun.getMonth()]} ${lastSun.getDate()}`)+`` + between.map(e=>cardHTML(e)).join(""); between.forEach(e=>used.add(e.id)); }
  const later = items.filter(e=>!used.has(e.id) && ((startOf(e) && startOf(e)>lastSun) || e.sec==="radar")).sort(byStart);
  if (later.length){ h += ``+band("wk-later",`Later`,`After ${MON[lastSun.getMonth()]} ${lastSun.getDate()}`)+`` + cardsTrimmed("later", later, "later events"); later.forEach(e=>used.add(e.id)); }
  const tbc = items.filter(e=>!used.has(e.id) && e.tbc);
  if (tbc.length){ h += ``+band("",`Dates not posted yet`,`Usually happen in December`)+`` + tbc.map(compactHTML).join(""); tbc.forEach(e=>used.add(e.id)); }
  const any = items.filter(e=>!used.has(e.id) && e.cat!=="walk");
  if (any.length) h += ``+band("",`Any weekend`,`Classes and recurring things you can book or do most weekends`)+`` + any.map(compactHTML).join("");
  if (progs.length) h += band("wk-progs","Teen winter & summer programs","Sorted by application deadline · apply ahead","#6D4C41") + progs.map(e=>cardHTML(e)).join("");
  const walks = items.filter(e=>!used.has(e.id) && e.cat==="walk");
  if (walks.length) h += ``+band("wk-walks",`Dog walks`,`Always on · closest to home first`)+`` + walks.map(compactHTML).join("");
  return h || `<div class="empty">No events match these filters.</div>`;
}
// the three kinds most people look for: one tap to show only those (tap again for everything)
const QCATS = ["hol","mkt","dog"];
function renderSearch(){
  const res = filtered().filter(e=>!isPast(e)).sort((a,b)=>(startOf(a)||new Date(2100,0,1))-(startOf(b)||new Date(2100,0,1)));
  return `<p class="wk-sub sres">${res.length} match${res.length===1?"":"es"} for “${esc(state.q.trim())}”</p>` + (res.length ? res.map(e=>e.cat==="walk"?compactHTML(e):cardHTML(e)).join("") : `<div class="empty">Nothing matches. Try a town, a venue or one word.</div>`);
}
function renderEvents(){
  if (state.q.trim()) return renderSearch();
  if (state.group==="weekend"){
    const W = weekends(), f = filtered();
    const jump = `<div class="jump">${W.map((w,i)=>`<button data-jump="wk-${i}">${MON[w.fri.getMonth()]} ${ord(w.fri.getDate())}</button>`).join("")}<button data-jump="wk-later">Later</button><span class="jsep" aria-hidden="true"></span>${QCATS.filter(k=>state.cat===k || !likesOff.has(k)).map(k=>`<button class="qcat" data-qcat="${k}" aria-pressed="${state.cat===k}"><span class="cico" style="color:${CATS[k].color}">${wfIco(k)}</span>${CATS[k].label}</button>`).join("")}</div>`;
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
    const mk = sec.filter(isWeeklyMkt), fl = sec.filter(isRelease);
    const rest = sec.filter(e=>!(mk.length>1 && isWeeklyMkt(e)) && !(fl.length>1 && isRelease(e)));
    if (sec.length) h += `<div class="section-h">${esc(label)}</div>` + (mk.length>1 ? pickBox("dm-"+k, mk, "mkt") : "") + (fl.length>1 ? pickBox("df-"+k, fl, "film") : "") + rest.map(e=>cardHTML(e)).join("");
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
// your showtime for a locked-in movie ("HH:MM"), kept on this device; inside a group, accounts.js uses the group's shared meet-up time instead
let stimes = {};
try { stimes = JSON.parse(localStorage.getItem("wf-stimes") || "{}") || {}; } catch(e) {}
function planTime(id){ return stimes[id] || null; }
function setShowtime(id, t){ setStime(id, t); }
function setStime(id, t){ if (t) stimes[id] = t; else delete stimes[id]; try { localStorage.setItem("wf-stimes", JSON.stringify(stimes)); } catch(e) {} refreshStars(); }
const clk = h => { const hh = Math.floor(h) % 24, mm = Math.round((h % 1) * 60); return `${(hh % 12) || 12}${mm ? ":" + String(mm).padStart(2, "0") : ""}${hh < 12 ? "am" : "pm"}`; };
const t2h = t => { const m = /^(\d\d):(\d\d)/.exec(t || ""); return m ? +m[1] + +m[2] / 60 : null; };
// running time in hours from meta like "· 1h 56m" or "· 112 min" (null if not listed)
const runtimeOf = e => { const m = /(\d)\s*h(?:r|ours?)?(?:\s*(\d{1,2})\s*m)?/i.exec(e.meta || "") , n = /(\d{2,3})\s*min/i.exec(e.meta || ""); return m ? +m[1] + (+(m[2] || 0)) / 60 : n ? +n[1] / 60 : null; };
// "7:15–9:15pm" for a movie with a showtime (trailers included: +15 min; 2h if the running time isn't listed)
const showRange = (e, t) => { const s = t2h(t); if (s == null) return ""; const en = s + (runtimeOf(e) || 1.75) + 0.25, a = clk(s), b = clk(en); return (a.slice(-2) === b.slice(-2) ? a.slice(0, -2) : a) + "–" + b; };
function showtimeHTML(e){
  if (e.cat !== "film") return "";
  const t = planTime(e.id) || "";
  return `<label class="showt">${wfIco("film")} Your showtime <input type="time" data-stime="${esc(e.id)}" value="${esc(t)}" aria-label="Showtime for ${esc(e.title)}"></label>${t ? `<span class="locknote">${esc(showRange(e, t))}</span>` : `<span class="locknote">Add it to see what else fits that day</span>`}`;
}
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
const timeOf = e => { const st = e.cat==="film" && t2h(planTime(e.id)); if (st || st === 0) return st; const w = String(e.when||"");
  // a range like "6:30–9:30pm" or "11–2pm" starts at its first time (meridiem borrowed from the end when missing)
  const r = w.match(/(\d{1,2})(?::(\d\d))?\s*(am|pm)?\s*[–-]\s*(\d{1,2})(?::(\d\d))?\s*(am|pm)/i);
  if (r){ const hr = (hh,mm,mer)=> (+hh % 12) + (/pm/i.test(mer) ? 12 : 0) + (+(mm||0))/60; let sh = hr(r[1],r[2],r[3]||r[6]); if (!r[3] && sh > hr(r[4],r[5],r[6])) sh -= 12; return sh; }
  const m = w.match(/(\d{1,2})(?::(\d\d))?\s*(am|pm)/i); if (!m) return 99; let h = +m[1] % 12; if (/pm/i.test(m[3])) h += 12; return h + (+(m[2]||0))/60; };
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
    if (multiWk(e, W) && W.some(w=>daysOf(e,w.fri,w.sun).some(x=>parseD(x)>=TODAY))){ flex.push(e); continue; }
    let placed = false;
    // only days from today on can be locked in (on a Saturday, this weekend's Friday is already over)
    groups.forEach(g=>{ const ds = daysOf(e,g.w.fri,g.w.sun).filter(x=>parseD(x)>=TODAY); if (ds.length && !isLong(e)){ g.maybe.push({e,opts:ds}); placed = true; } });
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
  return `<div class="lockrow"><button class="lockbtn" data-lock="${esc(e.id)}" data-k="${k}" aria-pressed="true">✓ Locked in · ${dayLabel(k)}</button>${move}<span class="locknote">Tap to make it a maybe</span>${showtimeHTML(e)}</div>`;
}
// on over several weekends (long runs, weekly markets, "select nights"): one "pick a day" row, not a maybe on every weekend
const multiWk = (e, W) => isLong(e) || isWeeklyMkt(e) || W.filter(w=>daysOf(e,w.fri,w.sun).some(x=>parseD(x)>=TODAY)).length > 1;
const allWkOpts = (e, W) => W.flatMap(w=>daysOf(e,w.fri,w.sun)).filter(x=>parseD(x)>=TODAY);
// compact plan rows: date/time · activity · place; tap to open the full card
const openRows = new Set();
function planRow(e, ctl, k){
  const open = openRows.has(e.id), t = String(e.when||"").match(/\d{1,2}(?::\d\d)?\s*(?:am|pm)?\s*[–-]\s*\d{1,2}(?::\d\d)?\s*(?:am|pm)|\d{1,2}(?::\d\d)?\s*(?:am|pm)/i);
  const st = k && e.cat==="film" && planTime(e.id);
  const when = k ? dayLabel(k) + (st ? " · " + showRange(e, st) : t ? " · " + t[0] : "") : e.when;
  const place = (e.meta||"").split(" · ")[0];
  return `<div class="prow${k?" locked":""}${open?" open":""}"><button class="prow-h" data-expand="${esc(e.id)}" aria-expanded="${open}">
    <span class="pmark" aria-hidden="true">${k?"✓":"?"}</span><span class="pbody"><span class="pw">${esc(when)}</span><span class="pt">${esc(e.title)}</span><span class="pl">${esc(place)}</span></span><span class="chev" aria-hidden="true">${open?"▴":"▾"}</span>
    <span class="sr">${k?"Locked in":"Maybe"}. ${open?"Hide details":"Show details"}</span></button>${open?cardHTML(e,false,ctl,"inrow"):""}</div>`;
}
function weekendHTML(g, W){
  const keys = Object.keys(g.days), n = keys.reduce((s,k)=>s+g.days[k].length,0), m = g.maybe.length;
  if (!n && !m) return band(g.id,esc(g.title),`${esc(g.sub)} · nothing planned yet`, g.wk?WKC[g.i]:null);
  let h = ``+band(g.id,esc(g.title),`${esc(g.sub)} · ${n?`<strong class="lockc">${n} locked in</strong>`:"nothing locked in"}${m?` · ${m} maybe${m===1?"":"s"}`:""}`, g.wk?WKC[g.i]:null);
  h += `<div class="sched">` + keys.filter(k=>parseD(k)>=TODAY).map(k=>{
    const d = parseD(k), list = g.days[k];
    const head = `<div class="sched-d${list.length?"":" free"}"><span>${DAYF[d.getDay()]} ${MON[d.getMonth()]} ${d.getDate()}</span>${list.length?"":`<em>Nothing planned</em>`}</div>`;
    return head + list.map(({e})=>planRow(e,lockedCtl(e,k,multiWk(e,W)?allWkOpts(e,W):daysOf(e,g.w.fri,g.w.sun).filter(x=>parseD(x)>=TODAY)),k)).join("");
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
  if (P.flex.length){
    h += ``+band("",`Pick a day`,`You starred these and they run over several weekends. Choose the day you'll go and it moves into that weekend's schedule.`)+``;
    h += P.flex.map(e=>planRow(e,planCtl(e,allWkOpts(e,P.W)))).join("");
  }
  P.groups.forEach(g=>{ h += weekendHTML(g, P.W); });
  h += listGroupHTML(P.wn) + listGroupHTML(P.later);
  if (P.dl.length) h += band("wk-dl","Deadlines to remember","Teen programs you starred, soonest first","#6D4C41") + P.dl.map(e=>planRow(e,"")).join("");
  if (P.any.length) h += ``+band("",`Anytime`,`Walks, classes and things without a date yet`)+`` + P.any.map(compactHTML).join("");
  if (gone.length) h += `<div class="section-h">Earlier picks</div>` + gone.map(e=>cardHTML(e,true)).join("");
  return h;
}
function renderOurList(){
  const {cur, gone} = ourListItems();
  let h = `<div class="ourhead">${importedMsg?`<p class="okmsg">${esc(importedMsg)}</p>`:""}<p class="ournote">Your stars are saved on this device.</p>${cur.length?`<div class="btnrow"><button class="copybtn alt" data-copy>Copy as text</button></div>`:""}<div id="copyout"></div></div>`;
  if (!cur.length && !gone.length) return h + `<div class="empty">${EMPTY_STAR()}Nothing starred yet.<br>Tap the ☆ on any event and it lands here.</div>`;
  return h + planHTML(cur, gone);
}
function listText(){
  const {cur} = ourListItems(), P = planGroups(cur);
  const line = e => { const t = String(e.when||"").match(/\d{1,2}(?::\d\d)?\s*(am|pm)/i); return `${e.title}${t?" "+t[0]:""} (${(e.meta||"").split(" · ")[0]})`; };
  let t = `Our weekend plans (${CITY.brand})\n`;
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
const MIDLAT = (BBOX[0]+BBOX[1])/2;
function boxAround(lat,lon,spanMi){ const [x,y]=proj(lat,lon); const w=spanMi/((BBOX[3]-BBOX[2])*69*Math.cos(MIDLAT*Math.PI/180))*MAP_W; return [x-w/2,y-w/2,w,w]; }
// map views (spans in miles): [name, lat, lon, span]; "Near home" follows home, "Everything" is the whole map
const PRESETS = Object.fromEntries(CITY.presets.map(([k,la,lo,sp]) => [k, k==="Everything" ? [0,0,MAP_W,MAP_H] : k==="Near home" ? boxAround(HOME.lat,HOME.lon,sp) : boxAround(la,lo,sp)]));
let vb = [...PRESETS[CITY.map_start]];
try { const s = JSON.parse(localStorage.getItem("wf-vb2")); if (s && s.length===4) vb = s; } catch(e) {}
let starOnly = false;
function mapHTML(){
  const W = weekends();
  return `<div class="seg mapwhen" role="group" aria-label="Which dates">${[["wk0","This weekend"],["wk1","Next"],["all","All dates"]].map(([k,t])=>`<button data-mapwhen="${k}" aria-pressed="${state.mapWhen===k}">${t}</button>`).join("")}</div><p class="note mapn" id="mapn"></p><div class="zoombar">${Object.keys(PRESETS).map(k=>`<button class="zbtn" data-preset="${k}">${k}</button>`).join("")}<button class="zbtn" data-staronly aria-pressed="${starOnly}">★ Starred only</button></div>
  <div class="mapwrap" id="mapwrap" style="aspect-ratio:${MAP_W}/${MAP_H}"><svg id="map" role="img" aria-label="Map of event locations around ${esc(CITY.short)}"></svg>
  <div class="zctl"><button data-zoom="0.6" aria-label="Zoom in">+</button><button data-zoom="1.6" aria-label="Zoom out">−</button></div></div>
  <div class="legend">${Object.keys(CATS).map(k=>`<span><i style="background:${CATS[k].color}"></i>${CATS[k].label}</span>`).join("")}<span><i style="background:#fff;border:3px solid #B9531F;width:12px;height:12px"></i>Home</span><span><i style="background:#FFD54A;border:2px solid #1B2430"></i>Starred</span></div>
  <div class="note">Tap a pin to see the event. Drag to pan, pinch or use +/− to zoom. Pins are approximate.</div>
  <div class="sheet" id="sheet"></div>`;
}
function mapItems(){
  const W = weekends(), w = state.mapWhen==="all" ? null : W[+state.mapWhen.slice(2)];
  const walksToo = state.cat==="dog" || state.cat==="walk" || state.dogok;
  return filtered().filter(e=>e.lat!=null && !isPast(e) && (!starOnly || starredIds().includes(e.id))
    && (!w || (e.cat==="walk" ? walksToo : occurs(e, w.fri, w.sun))));
}
function mapCount(){ const n = document.getElementById("mapn"); if (!n) return; const k = mapItems().length, W = weekends(), w = state.mapWhen==="all" ? null : W[+state.mapWhen.slice(2)];
  n.textContent = `${k} event${k===1?"":"s"} on the map` + (w ? `, ${fmtRange(w.fri, w.sun)}` : ", all dates"); }
function drawMap(){
  const svg = document.getElementById("map"); if(!svg) return;
  const pxPer = svg.clientWidth ? vb[2]/svg.clientWidth : 1;
  const r = 11*pxPer, fs = 11*pxPer;
  const items = mapItems();
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
  const labels = CITY.labels;
  const lf = 12*pxPer;
  const lab = labels.map(([t,la,lo,w])=>{const [x,y]=proj(la,lo);const water=!!w;return `<text x="${x}" y="${y}" text-anchor="middle" font-size="${lf}" font-weight="600" fill="${water?'#5F86A8':'#8A8F94'}" font-family="Inter,sans-serif" font-style="${water?'italic':'normal'}" pointer-events="none">${t}</text>`}).join("");
  svg.setAttribute("viewBox", vb.join(" "));
  svg.innerHTML = `<rect x="-2000" y="-2000" width="${MAP_W+4000}" height="${MAP_H+4000}" fill="#F3F1EA"/><path d="${COAST}" fill="#CFE0EE" fill-rule="${COAST_RULE}" stroke="#A9C3DA" stroke-width="${1.2*pxPer}"/>${lab}
  <circle cx="${hx}" cy="${hy}" r="${8*pxPer}" fill="#fff" stroke="#B9531F" stroke-width="${3.5*pxPer}"/><text x="${hx+12*pxPer}" y="${hy+24*pxPer}" text-anchor="middle" font-size="${lf}" font-weight="700" fill="#B9531F" font-family="Inter,sans-serif" pointer-events="none">Home</text>${pins}`;
  try { localStorage.setItem("wf-vb2", JSON.stringify(vb)); } catch(e) {}
}
function showSheet(){
  const s = document.getElementById("sheet"); if(!s) return;
  const e = DATA.find(d=>d.id===state.sel);
  s.innerHTML = e ? cardHTML(e,false,"","onmap") : "";
  // on a phone the card sits below the map: bring it into view
  if (e){ const r = s.getBoundingClientRect(); if (r.top > innerHeight - 120) s.scrollIntoView({block:"nearest", behavior:"smooth"}); }
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
  const up = ev=>{ pts.delete(ev.pointerId); if(pts.size<2) last=null; if(pts.size===0){ if(moved) drawMap(); else { const g=document.elementFromPoint(ev.clientX,ev.clientY)?.closest("[data-pin]"); if(g){ state.sel=g.dataset.pin; drawMap(); showSheet(); if (typeof track==="function") track("map_event_opened",{item_id:state.sel, placement:"map"}); document.getElementById("sheet").scrollIntoView({behavior:"smooth",block:"nearest"}); } } } };
  svg.addEventListener("pointerup", up); svg.addEventListener("pointercancel", up);
  svg.addEventListener("wheel", ev=>{ ev.preventDefault(); const [cx,cy]=toSvg(ev.clientX,ev.clientY); zoom(ev.deltaY>0?1.15:0.87,cx,cy); }, {passive:false});
  svg.addEventListener("keydown", ev=>{ const g=ev.target.closest&&ev.target.closest("[data-pin]"); if(g&&(ev.key==="Enter"||ev.key===" ")){ ev.preventDefault(); state.sel=g.dataset.pin; drawMap(); showSheet(); if (typeof track==="function") track("map_event_opened",{item_id:state.sel, placement:"map"}); } });
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
  PRESETS["Near home"] = boxAround(h.lat, h.lon, CITY.near_home_span);
  measure(); state.homeMsg = msg || `Home set to ${h.name}. Distances updated.`; render();
}
async function findHome(){
  const i = document.getElementById("homeq"), q = (i && i.value || "").trim();
  if (!q) return;
  state.homeMsg = "Looking it up…"; const keep = q; render(); const j = document.getElementById("homeq"); if (j) j.value = keep;
  try {
    const r = await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=" + CITY.country + "&q=" + encodeURIComponent(q), {headers:{"Accept":"application/json"}});
    const res = await r.json();
    if (!res || !res.length){ state.homeMsg = "Couldn't find that. Try adding the city, or just a ZIP code."; render(); return; }
    const lat = +res[0].lat, lon = +res[0].lon, a = res[0].address || {};
    const name = (q.length <= 22 ? q : (res[0].name || q.split(",")[0])).slice(0, 28);
    const far = miles(lat, lon, CITY.far.lat, CITY.far.lon) > CITY.far.mi;
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
(()=>{ const u = document.getElementById("upd"), m = String(WF.updated||"").match(/^Updated\s+(\w{3})\w*,?\s+(.+?)(,?\s*\d{4})?\s*(·|$)/); if (u && m) u.textContent = `Updated ${m[1]} ${m[2]}`; })();
function updateCount(){ const n = starredIds().length; document.getElementById("savedCount").textContent = n ? `(${n})` : ""; }
let lastEmptySig = "";
function noteEmpty(){
  // a filtered list that shows nothing (recorded once per filter combination)
  const m = document.getElementById("main"); if (!m || state.view==="our-list") return;
  const empty = [...m.querySelectorAll(".empty")].some(x=>/No events match/.test(x.textContent));
  const sig = state.view+"|"+state.cat+"|"+state.dist+"|"+[...likesOff].sort().join(",");
  if (empty && sig!==lastEmptySig && typeof track==="function"){ lastEmptySig = sig; track("results_empty",{placement:null, props:{filter_type:"combined", value:sig.slice(0,100), result_count:0}}); }
  if (!empty) lastEmptySig = "";
}
function render(){
  document.querySelectorAll(".tab").forEach(t=>t.setAttribute("aria-selected", t.dataset.view===state.view));
  updateCount(); renderFilters();
  const m = document.getElementById("main");
  if (state.view==="map"){ m.innerHTML = mapHTML(); requestAnimationFrame(bindMap); requestAnimationFrame(mapCount); }
  else m.innerHTML = state.view==="our-list" ? renderOurList() : renderEvents();
  if (state.view!=="our-list") m.insertAdjacentHTML("afterbegin", homeBox() + likesBox());
  document.documentElement.style.setProperty("--hh", document.getElementById("hdr").offsetHeight+"px");
  document.documentElement.style.setProperty("--fh", document.getElementById("filters").offsetHeight+"px");
  noteEmpty();
}
function refreshStars(){
  // update stars in place without resetting the map or scroll
  if (state.view==="our-list"){ const y=scrollY; document.getElementById("main").innerHTML = renderOurList(); scrollTo(0,y); }
  else if (state.view==="map"){ drawMap(); showSheet(); }
  else { const y=scrollY; document.getElementById("main").innerHTML = homeBox() + likesBox() + renderEvents(); scrollTo(0,y); }
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
  if (t.dataset.view){ if (typeof window.gtag==="function") window.gtag("event","tab_view",{tab:t.dataset.view}); state.view=t.dataset.view; try{localStorage.setItem("wf-view2",state.view);}catch(e){} render(); syncHash(); window.scrollTo(0,0); }
  else if (t.dataset.jump){ const el=document.getElementById(t.dataset.jump); if(el){ const off=document.getElementById("filters").offsetHeight+8; scrollTo({top:el.getBoundingClientRect().top+scrollY-off, behavior:"smooth"}); } }
  else if (t.dataset.group){ state.group=t.dataset.group; try{localStorage.setItem("wf-group",state.group);}catch(e){} render(); }
  else if (t.dataset.cat){ state.cat=t.dataset.cat; render(); if (typeof track==="function") track("filter_applied",{placement:null, props:{filter_type:"category", value:state.cat}}); }
  else if (t.dataset.like){ t.dataset.v==="1" ? likesOff.delete(t.dataset.like) : likesOff.add(t.dataset.like); saveLikes(); if (state.cat!=="all" && likesOff.has(state.cat)) state.cat="all"; const y=scrollY; render(); scrollTo(0,y); }
  else if (t.hasAttribute("data-likesdone")){ saveLikes(); if (typeof track==="function") track("filter_applied",{placement:null, props:{filter_type:"interests", value: likesOff.size ? "no:" + [...likesOff].sort().join(",") : "all"}}); state.likesOpen=false; render(); window.scrollTo(0,0); }
  else if (t.hasAttribute("data-likesall")){ likesOff.clear(); saveLikes(); const y=scrollY; render(); scrollTo(0,y); }
  else if (t.hasAttribute("data-likesopen")){ state.filtOpen=false; state.editHome=false; state.likesOpen=true; render(); window.scrollTo(0,0); }
  else if (t.hasAttribute("data-filtopen")){ state.filtOpen = !state.filtOpen; render(); }
  else if (t.dataset.distv!=null){ state.dist = +t.dataset.distv; try{localStorage.setItem("wf-dist",state.dist);}catch(e){} render(); if (typeof track==="function") track("filter_applied",{placement:null, props:{filter_type:"distance", value:String(state.dist)}}); }
  else if (t.dataset.qcat){ state.cat = state.cat===t.dataset.qcat ? "all" : t.dataset.qcat; render(); window.scrollTo(0,0); if (typeof track==="function") track("filter_applied",{placement:null, props:{filter_type:"category", value:state.cat}}); }
  else if (t.dataset.quick){ const k=t.dataset.quick; if (k==="sat"||k==="sun") state.day = state.day===k ? "" : k; else state[k] = !state[k]; render(); if (typeof track==="function") track("filter_applied",{placement:null, props:{filter_type:"quick", value:k}}); }
  else if (t.hasAttribute("data-search")){ state.searchOpen=true; state.filtOpen=false; render(); setTimeout(()=>{ const i=document.getElementById("q"); if(i) i.focus(); },30); }
  else if (t.hasAttribute("data-searchclose")){ state.searchOpen=false; state.q=""; render(); }
  else if (t.dataset.more){ const k=t.dataset.more; showAll.has(k) ? showAll.delete(k) : showAll.add(k); refreshStars(); }
  else if (t.dataset.mapwhen){ state.mapWhen=t.dataset.mapwhen; document.querySelectorAll("[data-mapwhen]").forEach(b=>b.setAttribute("aria-pressed", b.dataset.mapwhen===state.mapWhen)); drawMap(); mapCount(); }
  else if (t.hasAttribute("data-freset")){ state.cat="all"; state.dist=0; state.free=false; state.dogok=false; state.day=""; try{localStorage.setItem("wf-dist",0);}catch(e){} render(); }
  else if (t.hasAttribute("data-sethome")){ state.filtOpen = false; state.editHome = !state.editHome; state.homeMsg=""; render(); if (state.editHome) setTimeout(()=>{ const i=document.getElementById("homeq"); if(i) i.focus(); },50); }
  else if (t.hasAttribute("data-homefind")){ findHome(); }
  else if (t.hasAttribute("data-homegps")){ gpsHome(); }
  else if (t.hasAttribute("data-homereset")){ setHome({...HOME_DEFAULT}); try{localStorage.removeItem("wf-home");}catch(e){} }
  else if (t.hasAttribute("data-homeclose")){ state.editHome=false; render(); }
  else if (t.dataset.star){ toggleStar(t.dataset.star); }
  else if (t.dataset.expand){ const id=t.dataset.expand; const opening=!openRows.has(id); opening?openRows.add(id):openRows.delete(id); refreshStars(); if (opening && typeof track==="function") track("event_detail_viewed",{item_id:id, placement:"plan_row"}); }
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
document.addEventListener("input", ev=>{ if (ev.target.id==="q"){ state.q = ev.target.value; if (state.view==="map"){ drawMap(); mapCount(); } else { const y=scrollY; document.getElementById("main").innerHTML = homeBox() + likesBox() + renderEvents(); if (!state.q) scrollTo(0,y); } } });
document.addEventListener("keydown", ev=>{ if (ev.target.id==="q" && ev.key==="Enter") ev.target.blur(); if (ev.target.id==="q" && ev.key==="Escape"){ state.searchOpen=false; state.q=""; render(); } });
// a card's description shows two lines; tap it for the rest
document.addEventListener("click", ev=>{ const m = ev.target.closest(".card .meta"); if (m && !ev.target.closest("a,button")) m.classList.toggle("full"); });
document.addEventListener("change", ev=>{ if (ev.target.matches("select[data-pick]")){ pickSel[ev.target.dataset.pick] = ev.target.value; refreshStars(); const s = document.getElementById(ev.target.id); if (s) s.focus({preventScroll:true}); return; } if (ev.target.matches("select[data-dist]")){ state.dist = +ev.target.value; try{localStorage.setItem("wf-dist",state.dist);}catch(e){} render(); return; } const s = ev.target.closest("select[data-plan]"); if (s && s.value) setPlan(s.dataset.plan, s.value); const st = ev.target.closest("input[data-stime]"); if (st) setShowtime(st.dataset.stime, st.value); });
window.addEventListener("hashchange", ()=>{ const h=location.hash.slice(1); if(VIEWS.includes(h)&&h!==state.view){ state.view=h; render(); } });
window.addEventListener("resize", ()=>{ if(state.view==="map"){ vb=fitAspect(vb); drawMap(); } document.documentElement.style.setProperty("--hh", document.getElementById("hdr").offsetHeight+"px"); });
render();
connect();
