(function(){
/* City switch, on the website and (since app 1.3) in the apps.
   Picking a city remembers it in localStorage "wf-city" (one key for the whole site), so the site root / the app opens that city next time.
   First visits: see suggest() below. */
var C = window.WF_CITY, L = window.WF_CITIES || [];
function get(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }
function set(k, v){ try { localStorage.setItem(k, v); } catch (e) {} }
document.addEventListener('click', function(e){
  var a = e.target.closest && e.target.closest('[data-city]');
  if (a) set('wf-city', a.getAttribute('data-city'));
  var d = document.getElementById('citySw');
  if (d && d.open && !d.contains(e.target)) d.open = false;
});
// First open (website root or the app, which always starts on the Bay Area page): pick the visitor's place.
// Sydney and London time zones open there straight away. In the Americas (the Bay Area, Seattle and LA all share Pacific time)
// a one-time card asks "Where are you?", with the US places and "Use my location" (asks the phone for its location only when
// tapped; the position stays on the device and is only compared with each place's centre). Anywhere else, or on a city page
// someone opened directly, the old one-time "Looks like you're near ..." bar suggests a city whose time zone matches.
function byKey(k){ for (var i = 0; i < L.length; i++) if (L[i].key === k) return L[i]; return null; }
function go(k){ var c = byKey(k); set('wf-city', k); if (c && k !== C.key) location.href = c.url; }
function km(a, b, c, d){ var r = Math.PI / 180, x = Math.sin((c - a) * r / 2), y = Math.sin((d - b) * r / 2);
  return 12742 * Math.asin(Math.sqrt(x * x + Math.cos(a * r) * Math.cos(c * r) * y * y)); }
function nearest(lat, lon){ var best = null;
  L.forEach(function(c){ var d = km(lat, lon, c.lat, c.lon), max = c.group === 'region' ? 650 : 320;
    if (d <= max && (!best || d < best.d)) best = { c: c, d: d }; });
  return best && best.c; }
function pickDone(){ var p = document.getElementById('cityPick'); if (p) p.remove(); try { window.dispatchEvent(new Event('wf-citypicked')); } catch (e) {} }
function picker(){
  var hdr = document.getElementById('hdr'); if (!hdr) return;
  var us = L.filter(function(c){ return /^America\//.test(c.tz); });
  var box = document.createElement('div'); box.className = 'citypick'; box.id = 'cityPick'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Where are you?');
  box.innerHTML = '<div class="cpt"><b>Where are you?</b><span>We’ll open the closest place each time.</span></div>'
    + '<button type="button" class="cploc">' + (window.WF_PIN || '') + 'Use my location</button>'
    + '<div class="cpc">' + us.map(function(c){ return '<button type="button" data-pick="' + c.key + '">' + c.short + '</button>'; }).join('') + '</div>'
    + '<p class="cpm" aria-live="polite"></p>'
    + '<button type="button" class="cpx" aria-label="Not now">✕</button>';
  hdr.parentNode.insertBefore(box, hdr);
  var msg = box.querySelector('.cpm');
  box.addEventListener('click', function(e){
    var b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-pick')) { var k = b.getAttribute('data-pick'); go(k); if (k === C.key) pickDone(); return; }
    if (b.classList.contains('cpx')) { set('wf-city-asked', '1'); pickDone(); return; }
    if (b.classList.contains('cploc')) {
      if (!navigator.geolocation) { msg.textContent = 'This phone can’t share its location here. Pick a place instead.'; return; }
      msg.textContent = 'Finding the closest place…';
      navigator.geolocation.getCurrentPosition(function(p){
        var c = nearest(p.coords.latitude, p.coords.longitude);
        if (c) { msg.textContent = 'Opening ' + c.short + '…'; go(c.key); if (c.key === C.key) pickDone(); }
        else msg.textContent = 'None of our places is near you yet. Pick the one you’d like to see.';
      }, function(){ msg.textContent = 'Couldn’t get your location. Pick a place instead.'; },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
    }
  });
}
function suggest(){
  if (get('wf-city') || get('wf-city-asked')) return;
  var tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
  var landing = C.key === L[0].key && !location.hash && !/[?&](e|s|c)=/.test(location.search);
  if (landing && tz) {
    var auto = /^Australia\//.test(tz) ? 'sydney' : /^Europe\/(London|Dublin|Belfast|Jersey|Guernsey|Isle_of_Man)$/.test(tz) ? 'london' : null;
    if (auto && byKey(auto)) { go(auto); return; }
    if (/^(America|US|Canada)\//.test(tz) || tz === 'Pacific/Honolulu') { picker(); return; }
  }
  var area = function(z){ return (z || '').split('/')[0]; };
  if (!tz || tz === C.tz) return;
  // only when one place clearly matches (the Bay Area, Seattle and LA share a time zone, so Pacific time suggests nothing here)
  var same = L.filter(function(c){ return c.tz === tz; });
  var other = same.length === 1 ? same[0] : same.length ? null : L.filter(function(c){ return area(c.tz) !== 'America' && area(c.tz) === area(tz); })[0];
  if (other && other.key === C.key) other = null;
  if (!other) return;
  var hdr = document.getElementById('hdr'); if (!hdr) return;
  var bar = document.createElement('div'); bar.className = 'citytip'; bar.setAttribute('role', 'status');
  bar.innerHTML = '<span>Looks like you’re near ' + (other.near || other.short) + '. See <b>' + other.brand + '</b>?</span>'
    + '<a class="go" href="' + other.url + '" data-city="' + other.key + '">Switch</a>'
    + '<button type="button" aria-label="No thanks">✕</button>';
  bar.querySelector('button').onclick = function(){ set('wf-city-asked', '1'); bar.remove(); };
  hdr.parentNode.insertBefore(bar, hdr);
}
// phones: if the circles don't all fit, fade the right edge (until scrolled to the end) and keep the current city in view
function fit(){
  var r = document.querySelector('.citysw'); if (!r) return;
  r.classList.remove('more');
  var more = r.scrollWidth > r.clientWidth + 2;
  r.classList.toggle('more', more);
  if (!more) return;
  var cur = r.querySelector('[aria-current]');
  if (cur && cur.offsetLeft + cur.offsetWidth > r.clientWidth) r.scrollLeft = cur.offsetLeft - 8;
  var end = function(){ r.classList.toggle('end', r.scrollLeft + r.clientWidth >= r.scrollWidth - 4); };
  if (!r._wfEnd) { r._wfEnd = 1; r.addEventListener('scroll', end, { passive: true }); }
  end();
}
function start(){ suggest(); fit(); window.addEventListener('resize', fit); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
