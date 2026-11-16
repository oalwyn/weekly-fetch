import os
import re
html=open('out_index.html').read()
def rep(a,b):
    global html
    assert a in html, a[:60]; html=html.replace(a,b)
# app-style head tags
rep('<meta name="theme-color" content="#2F5D8A">','''<meta name="theme-color" content="#2F5D8A">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="apple-touch-icon.png?v=5">
<link rel="icon" type="image/png" href="icon-192.png?v=5">''')
# search engines, link previews and the App Store (website only; build_app.py strips the <!--appbar--> block and the app banner tag)
SEO=CITYCFG['seo']; PAGEURL='https://theweekendfetch.com/'+(CITYCFG['path']+'/' if CITYCFG['path'] else '')
_esc=lambda t: t.replace('&','&amp;').replace('"','&quot;')
rep('<title>%s</title>' % CITYCFG['brand'],'''<title>'''+SEO['title']+'''</title>
<meta name="description" content="'''+_esc(SEO['description'])+'''">
<link rel="canonical" href="'''+PAGEURL+'''">
<meta property="og:type" content="website">
<meta property="og:site_name" content="'''+CITYCFG['brand']+'''">
<meta property="og:title" content="'''+CITYCFG['brand']+'''">
<meta property="og:description" content="'''+_esc(SEO['og_description'])+'''">
<meta property="og:url" content="'''+PAGEURL+'''">
<meta property="og:image" content="https://theweekendfetch.com/icon-512.png">
<meta name="twitter:card" content="summary">
<meta name="apple-itunes-app" content="app-id=6833697642">
<meta name="google-site-verification" content="2N3Uxn8G6NY2M8kNgwB9BkPi0ISLloUzPGOYMEj6YGY">
<meta name="msvalidate.01" content="B7752A49FADD355C226B4174CB823640">
<!--ga--><script>(function(){
  // Google Analytics 4, website only: no ad features, no Google signals; skipped when the browser sends Global Privacy Control or Do Not Track
  if (navigator.globalPrivacyControl || navigator.doNotTrack === "1") return;
  var s = document.createElement("script"); s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=G-HS0P25R6JR"; document.head.appendChild(s);
  window.dataLayer = window.dataLayer || []; window.gtag = function(){ dataLayer.push(arguments); };
  gtag("js", new Date());
  gtag("config", "G-HS0P25R6JR", { allow_google_signals: false, allow_ad_personalization_signals: false });
})();</script><!--/ga-->
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"'''+CITYCFG['brand']+'''","url":"'''+PAGEURL+'''","description":"'''+SEO['web_description']+'''"},{"@type":"MobileApplication","name":"The Bay Area Weekend Fetch","operatingSystem":"iOS","applicationCategory":"LifestyleApplication","offers":{"@type":"Offer","price":"0","priceCurrency":"USD"},"downloadUrl":"https://apps.apple.com/app/id6833697642"}]}</script>''')
rep('<header id="hdr">','''<!--appbar--><div class="appbar" id="appbar"><span>📱 Get the free iPhone app</span><a href="https://apps.apple.com/app/id6833697642" target="_blank" rel="noopener" data-k="app_store">Download on the App Store ›</a><button aria-label="Hide" onclick="this.parentNode.remove();try{localStorage.setItem('wf-appbar-off','1')}catch(e){}">×</button></div><script>/* App Store bar: not on a first visit, and not in iPhone Safari, which already shows Apple's own app banner */(function(){var d=document.getElementById('appbar');try{var u=navigator.userAgent,saf=/iPhone|iPad|iPod/.test(u)&&/Safari/.test(u)&&!/CriOS|FxiOS|EdgiOS|OPiOS|GSA/.test(u),v=+localStorage.getItem('wf-visits')||0;localStorage.setItem('wf-visits',v+1);if(localStorage.getItem('wf-appbar-off')||saf||v<1)d.remove()}catch(e){d.remove()}})();</script><!--/appbar-->
<header id="hdr">''')
rep('.okmsg{','.appbar{display:flex;align-items:center;gap:10px;background:#0E2338;color:#fff;font-size:13px;padding:7px 8px 7px 14px}.appbar span{flex:1}.appbar a{color:#fff;font-weight:700;text-decoration:none;background:#2F5D8A;border-radius:8px;padding:6px 10px;white-space:nowrap}.appbar button{background:none;border:0;color:#B9C7D6;font-size:20px;line-height:1;padding:4px 6px}\n.okmsg{')
rep('Check with the organizer before you go.<br>','Check with the organizer before you go.<br>'+SEO['footer_places']+' <a href="privacy.html" style="color:inherit">Privacy</a><br>')
rep('const PAGE_URL = "https://claude.ai/artifact/H7osiXWK9HTJwUmtsebTjA";','const PAGE_URL = location.origin + location.pathname;')
# 1. stop writing picks into the address bar: this site saves them normally
start=html.index('function syncHash(){'); end=html.index('\n}',start)+2
html=html[:start]+'''function syncHash(){
  // after opening a shared picks link, tidy the address back to the plain site URL
  if (location.hash.startsWith("#picks-")) { try { history.replaceState(null, "", location.pathname + location.search + (typeof LIST==="string"&&LIST ? "#list-"+LIST : "")); } catch(e) {} }
}'''+html[end:]
# 2. no Claude sign-in on this site: drop the shared-list connection
rep('\nconnect();','\n')
rep('setTimeout(()=>t.textContent="Send my picks",2500)','setTimeout(()=>t.textContent="Share my picks",2500)')
rep('Link copied. Paste it into a text or email, then open it on the other device.','Link copied. Paste it into a text to someone you plan with, or open it on your other device.')
rep('Refreshed every Monday morning. Stars are kept between refreshes.','Refreshed every Monday morning. Your stars are kept between refreshes.')
assert 'Saving to the shared list' not in html and 'signed in' not in html.lower().replace('signed-in',''), [m.start() for m in re.finditer('signed in',html)]
import sys, json
cfg=json.load(open('sb.json'))
mod=open('gh_sync.js').read().replace('__SB_URL__',cfg['url']).replace('__SB_KEY__',cfg['key'])
i=html.rfind('\nrender();\n')
assert i>0
html=html[:i]+'\n'+mod+html[i:]
# v1.1 accounts and groups, right after the old shared-list code (it wraps some of its functions)
i=html.rfind('\nrender();\n')
html=html[:i]+'\n'+open('accounts.js').read().replace('__SB_APPLE__','1' if cfg.get('appleWeb') else '0')+html[i:]
# catch a sign-in link (#access_token=...) or a join link (#join-CODE) before any other code rewrites the address
import datetime
WEBVER='web-'+datetime.date.today().strftime('%Y%m%d')
EARLY=('<script>window.WF_VERSION="'+WEBVER+'";(function(){var h=location.hash||"",u=location.pathname+location.search,'
       'go=function(){try{history.replaceState(null,"",u+"#our-list")}catch(e){}};'
       'if(/access_token=/.test(h)){var p=new URLSearchParams(h.slice(1));window.__wfTokens={access_token:p.get("access_token"),refresh_token:p.get("refresh_token")};go()}'
       'else if(/^#join-[A-Za-z0-9]{4,10}$/.test(h)){window.__wfJoin=h.slice(6).toUpperCase();go()}'
       'else if(/error_description=/.test(h)){window.__wfAuthError=1;go()}})();</script>\n')
assert html.count('<script src="./data.js"></script>')==1
html=html.replace('<script src="./data.js"></script>', EARLY+'<script src="./data.js"></script>')
# load the latest events: a version tag that changes every 5 minutes stops phones reusing an old saved data.js
PAIR='<script src="./data.js"></script>\n<script src="./walks.js"></script>\n<script src="./rainy.js"></script>'
assert html.count(PAIR)==1
html=html.replace(PAIR, '<script>/*wf-data*/(function(){var v=Math.floor(Date.now()/3e5);document.write(\'<script src="./data.js?v=\'+v+\'"><\\/script><script src="./walks.js?v=\'+v+\'"><\\/script><script src="./rainy.js?v=\'+v+\'"><\\/script>\')})();</script>')
html=html.replace('.okmsg{','.setup{background:#fff;border-radius:14px;padding:14px 16px;margin:0 0 12px}.setup strong{font-size:16px}\n.okmsg{',1)
# pages for other cities live in a folder: shared files (icons, banner, vendor scripts, privacy page) come from the site root;
# the city's own data.js/walks.js stay next to its page. City-specific saved settings get their own keys in this browser.
if CITYCFG['path']:
    # the iPhone app is Bay Area only for now: no App Store bar or banner on other cities' pages
    html = re.sub(r'<!--appbar-->.*?<!--/appbar-->\n?', '', html, flags=re.S)
    html = re.sub(r'<meta name="apple-itunes-app"[^>]*>\n?', '', html)
    html = re.sub(r'''(href|src)="(?!https?:|/|#|\$|'|data:|\./data\.js|\./walks\.js)(\./)?''', r'\1="/', html)
    html = html.replace('url(banner.svg', 'url(/' + CITYCFG.get('banner', 'banner.svg'))   # each city has its own header art
    html = html.replace('"./vendor/', '"/vendor/')   # sign-in and QR libraries live at the site root
    html = html.replace('<link rel="manifest" href="/manifest.webmanifest">', '<link rel="manifest" href="/%s/manifest.webmanifest">' % CITYCFG['path'])
    ns = '<script>/*city-storage*/(function(){var C=%s,K={"wf-home":1,"wf-dist":1,"wf-vb2":1,"wf-saved-ids":1,"wf-locks":1,"wf-gid":1,"wf-main":1,"wf-gcache":1,"wf-view2":1,"wf-list":1,"wf-cache":1,"wf-lcache":1,"wf-queue":1,"wf-list-converted":1,"wf-group":1};var P=Storage.prototype,g=P.getItem,s=P.setItem,r=P.removeItem,f=function(k){return K[k]?k+"@"+C:k};P.getItem=function(k){return g.call(this,f(k))};P.setItem=function(k,v){return s.call(this,f(k),v)};P.removeItem=function(k){return r.call(this,f(k))};})();</script>\n' % json.dumps(CITYCFG['key'])
    html = html.replace('<script>window.WF_CITY=', ns + '<script>window.WF_CITY=', 1)
os.makedirs(os.path.dirname(os.path.abspath(OUTFILE)), exist_ok=True)
open(OUTFILE,'w').write(html)
# owner-only engagement dashboard (reads only through admin_* functions that check the signed-in account)
if not CITYCFG['path']:
    adm=open('admin.html').read().replace('__SB_URL__',cfg['url']).replace('__SB_KEY__',cfg['key'])
    adm=(adm.replace('__CITY_OPTIONS__', ''.join('<option value="%s">%s</option>' % (c['key'], c['short']) for c in CITIES))
            .replace('__CITY_NAMES__', json.dumps({c['key']: c['short'] for c in CITIES})))
    os.makedirs(os.path.join('..','admin'), exist_ok=True)
    open(os.path.join('..','admin','index.html'),'w').write(adm)
print("ok", len(html))
