(function(){
/* City switch (website only; build_app.py leaves it out of the Bay Area-only iPhone app).
   Picking a city remembers it in localStorage "wf-city" (one key for the whole site), so the site root opens that city next time.
   A first-time visitor whose time zone is in another city's part of the world gets a one-time suggestion to switch. */
var C = window.WF_CITY, L = window.WF_CITIES || [];
function get(k){ try { return localStorage.getItem(k); } catch (e) { return null; } }
function set(k, v){ try { localStorage.setItem(k, v); } catch (e) {} }
document.addEventListener('click', function(e){
  var a = e.target.closest && e.target.closest('[data-city]');
  if (a) set('wf-city', a.getAttribute('data-city'));
  var d = document.getElementById('citySw');
  if (d && d.open && !d.contains(e.target)) d.open = false;
});
function suggest(){
  if (get('wf-city') || get('wf-city-asked')) return;
  var tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
  var area = function(z){ return (z || '').split('/')[0]; };
  if (!tz || area(tz) === area(C.tz)) return;
  var other = L.filter(function(c){ return c.key !== C.key && (c.tz === tz || area(c.tz) === area(tz)); })[0];
  if (!other) return;
  var hdr = document.getElementById('hdr'); if (!hdr) return;
  var bar = document.createElement('div'); bar.className = 'citytip'; bar.setAttribute('role', 'status');
  bar.innerHTML = '<span>Looks like you’re near ' + (other.near || other.short) + '. See <b>' + other.brand + '</b>?</span>'
    + '<a class="go" href="' + other.url + '" data-city="' + other.key + '">Switch</a>'
    + '<button type="button" aria-label="No thanks">✕</button>';
  bar.querySelector('button').onclick = function(){ set('wf-city-asked', '1'); bar.remove(); };
  hdr.parentNode.insertBefore(bar, hdr);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', suggest); else suggest();
})();
