"""Build the iPhone app's copy of the site into ../app/www (used by Capacitor).

Usage:  python3 src/build_app.py      (then: npx cap sync ios / npx cap sync android)

The website (../index.html) is left untouched. This copies it and its files into
app/www and makes a few app-only changes:
  - invite and share links point at the live website, not the app's internal address
  - the latest data.js / walks.js are downloaded from the live site at launch and kept
    for next time, so the weekly refresh reaches the app without a new App Store release
  - v1.3: every city's page goes into the app (Bay Area at app/www/, others at app/www/<path>/),
    with the city switch in the header; the app remembers the last city picked ("wf-city")
"""
import re, os, shutil, subprocess, sys

LIVE = "https://theweekendfetch.com/"
here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
out = os.path.join(root, "app", "www")

# always start from a fresh website build
subprocess.check_call([sys.executable, os.path.join(here, "build.py")])

import json
CITIES = [json.load(open(os.path.join(here, "cities", k + ".json"))) for k in ["bayarea", "sydney", "london"]]
CITIES = [c for c in CITIES if not c["path"] or os.path.exists(os.path.join(root, c["path"], "data.js"))]

def appify(html, cfg):
  P = cfg["path"] + "/" if cfg["path"] else ""          # "" for the Bay Area, "sydney/" for Sydney
  KEY = "" if not cfg["path"] else "-" + cfg["key"]    # saved-data keys per city
  def rep(a, b):
      nonlocal html
      assert a in html, "build_app.py: can't find " + a[:60]
      html = html.replace(a, b)

  # 1. links people share must open the real website
  rep('const PAGE_URL = location.origin + location.pathname;', 'const PAGE_URL = "%s";' % (LIVE + P))
  rep('const inviteLink = () => location.origin + location.pathname + "#list-" + LIST;',
      'const inviteLink = () => "%s#list-" + LIST;' % (LIVE + P))

  # 2. use the newest event data: a copy saved from the live site beats the bundled one,
  #    and a fresh copy is fetched in the background on every launch
  LOADER = r'''<script src="./data.js"></script>
  <script src="./walks.js"></script>
  <script src="./rainy.js"></script>
  <script src="./dates.js"></script>
  <script>
  (function(){
    var LIVE = "%s", FILES = [["data.js","wf-app-data%s","WF_DATA"],["walks.js","wf-app-walks%s","WF_WALKS"],["rainy.js","wf-app-rainy%s","WF_RAINY"],["dates.js","wf-app-dates%s","WF_DATES"]];
    function apply(text, global){
      if (typeof text !== "string" || text.indexOf("window." + global) !== 0) return false;
      var before = window[global];
      try { new Function(text)(); } catch(e) { window[global] = before; return false; }
      var d = window[global];
      if (!d || !d.items || !d.items.length) { window[global] = before; return false; }
      return true;
    }
    var inUse = {};
    FILES.forEach(function(f){
      var saved = null; try { saved = localStorage.getItem(f[1]); } catch(e) {}
      inUse[f[0]] = (saved && apply(saved, f[2])) ? saved : null;
    });
    var started = Date.now(), touched = false;
    ["touchstart","mousedown","keydown","scroll"].forEach(function(ev){ addEventListener(ev, function(){ touched = true; }, {once:true, passive:true}); });
    function refresh(){
      var changed = false;
      Promise.all(FILES.map(function(f){
        return fetch(LIVE + f[0] + "?t=" + Date.now(), {cache:"no-store"}).then(function(r){ return r.ok ? r.text() : null; }).then(function(text){
          if (!text || text === inUse[f[0]] || text.indexOf("window." + f[2]) !== 0) return;
          var before = window[f[2]];
          if (!apply(text, f[2])) return;
          window[f[2]] = before;
          try { localStorage.setItem(f[1], text); inUse[f[0]] = text; changed = true; } catch(e) {}
        }).catch(function(){});
      })).then(function(){
        // new events arrived: show them now if the person hasn't started using the app yet,
        // otherwise they appear next time the app opens
        if (changed && !touched && Date.now() - started < 8000) location.reload();
      });
    }
    addEventListener("load", function(){ setTimeout(refresh, 300); });
  })();
  </script>''' % (LIVE + P, KEY, KEY, KEY, KEY)
  m = re.search(r'<script>/\*wf-data\*/.*?</script>', html); assert m, "website data loader not found"
  html = html[:m.start()] + LOADER + html[m.end():]

  # 3. iPhone screen edges: keep the header and sticky bars clear of the clock and camera cutout
  rep('<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">')
  # 4. don't hold the whole screen blank while web fonts download (or forever, with no signal)
  rep('<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">',
      '<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" media="print" onload="this.media=\'all\'">')
  i = html.index('</style>')
  html = html[:i] + '''
  /* app only: safe areas */
  html header{padding-top:calc(12px + env(safe-area-inset-top,0px))}
  html .filters{top:env(safe-area-inset-top,0px)}
  html .wk-h{top:calc(var(--fh,0px) + env(safe-area-inset-top,0px))}
  body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
  input,textarea,.copyarea{-webkit-user-select:text;user-select:text}
  body::before{content:"";position:fixed;top:0;left:0;right:0;height:env(safe-area-inset-top,0px);background:var(--blue);z-index:30}
  ''' + html[i:]

  # 4b2. measurement tags: app version from the Xcode project; "production" only for release builds (WF_RELEASE=1, see npm run app:release)
  pbx = open(os.path.join(root, "ios", "App", "App.xcodeproj", "project.pbxproj")).read()
  mv = re.search(r"MARKETING_VERSION = ([0-9.]+);", pbx).group(1); bn = re.search(r"CURRENT_PROJECT_VERSION = ([0-9]+);", pbx).group(1)
  env = "production" if os.environ.get("WF_RELEASE") == "1" else "development"
  # the same app/www goes into both apps: pick the tag for the platform at run time (Android version from android/app/build.gradle)
  gr = open(os.path.join(root, "android", "app", "build.gradle")).read()
  av = re.search(r'versionName "([0-9.]+)"', gr).group(1); ac = re.search(r"versionCode ([0-9]+)", gr).group(1)
  html, nver = re.subn(r'window\.WF_VERSION="[^"]*";',
      'window.WF_VERSION=(window.Capacitor&&Capacitor.getPlatform&&Capacitor.getPlatform()==="android")?"android-%s+%s":"ios-%s+%s";window.WF_ENV="%s";' % (av, ac, mv, bn, env), html)
  assert nver == 1, "version tag not found"
  print("app measurement tags: ios-%s+%s / android-%s+%s, %s" % (mv, bn, av, ac, env))
  # 4c. website-only bits: the "Get the iPhone app" bar and Safari's App Store banner
  html = re.sub(r'<!--appbar-->.*?<!--/appbar-->\n?', '', html, flags=re.S)
  html = re.sub(r'<meta name="apple-itunes-app"[^>]*>\n?', '', html)
  html = re.sub(r'<!--ga-->.*?<!--/ga-->\n?', '', html, flags=re.S)
  # v1.3: the city switch stays; its links open the city pages bundled in the app ("/sydney/" -> "/sydney/index.html")
  for c in CITIES:
      u = "/" + (c["path"] + "/" if c["path"] else "")
      html, n = re.subn(r'(href="|"url": "|": ")%s"' % re.escape(u), r'\g<1>%sindex.html"' % u, html)
      assert n >= 1, "city link not found: " + u
  assert 'G-HS0P25R6JR' not in html
  assert 'appbar' not in html.split('<style>')[0] and 'id="appbar"' not in html
  # 5. Apple requires the privacy policy to be reachable inside the app
  assert html.count('</footer>') == 1
  html = re.sub(r'href="/?privacy\.html"', 'href="%sprivacy.html"' % LIVE, html)
  rep('</footer>', '<br><a href="%sprivacy.html" style="color:inherit">Privacy policy</a></footer>' % LIVE)

  # 6. native features (reminders, Add to Calendar, share sheet): see src/native_app.js
  i = html.rfind('\nrender();\n')
  assert i > 0
  html = html[:i] + '\n' + open(os.path.join(here, "native_app.js")).read() + html[i:]
  i = html.index('</style>')
  html = html[:i] + '.calbtn{border:1px solid #C9D2DC;background:#fff;color:var(--ink);border-radius:10px;padding:9px 14px;font-size:14px;font-weight:600;min-height:44px}\n' + html[i:]

  return html

if os.path.isdir(out):
    shutil.rmtree(out)
os.makedirs(out)
for cfg in CITIES:
    d = os.path.join(out, cfg["path"]) if cfg["path"] else out
    os.makedirs(d, exist_ok=True)
    src = os.path.join(root, cfg["path"], "index.html") if cfg["path"] else os.path.join(root, "index.html")
    open(os.path.join(d, "index.html"), "w").write(appify(open(src).read(), cfg))
    for name in ["data.js", "walks.js", "rainy.js", "dates.js"]:
        shutil.copy(os.path.join(root, cfg["path"], name), d)
    shutil.copy(os.path.join(root, cfg.get("banner", "banner.svg")), out)
    print("app page:", cfg["key"])
for name in ["banner.svg", "icon.svg", "icon-192.png", "icon-512.png",
             "apple-touch-icon.png", "manifest.webmanifest"]:
    shutil.copy(os.path.join(root, name), out)
# v1.1: the Supabase and QR libraries are loaded on demand from ./vendor/ (bundled, works offline)
shutil.copytree(os.path.join(root, "vendor"), os.path.join(out, "vendor"), ignore=shutil.ignore_patterns("pptxgen-*"))   # the PowerPoint library is for the owner dashboard only
print("app ok", os.path.relpath(out, root))
