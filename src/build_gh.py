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
<link rel="apple-touch-icon" href="apple-touch-icon.png?v=4">
<link rel="icon" type="image/png" href="icon-192.png?v=4">''')
# search engines, link previews and the App Store (website only; build_app.py strips the <!--appbar--> block and the app banner tag)
rep('<title>The Bay Area Weekend Fetch</title>','''<title>The Bay Area Weekend Fetch · Bay Area events this weekend</title>
<meta name="description" content="Things to do this weekend in the San Francisco Bay Area: holiday markets and lights, concerts and shows, sports games, new movies, dog-friendly outings and kids' events, from Marin and Napa to San Jose, Santa Cruz and Carmel. Free or ticketed, with a shared weekend planner.">
<link rel="canonical" href="https://theweekendfetch.com/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="The Bay Area Weekend Fetch">
<meta property="og:title" content="The Bay Area Weekend Fetch">
<meta property="og:description" content="What's on this weekend around the Bay Area, refreshed every Monday and Thursday. Star events and plan them with friends.">
<meta property="og:url" content="https://theweekendfetch.com/">
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
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"The Bay Area Weekend Fetch","url":"https://theweekendfetch.com/","description":"Things to do this weekend in the San Francisco Bay Area."},{"@type":"MobileApplication","name":"The Bay Area Weekend Fetch","operatingSystem":"iOS","applicationCategory":"LifestyleApplication","offers":{"@type":"Offer","price":"0","priceCurrency":"USD"},"downloadUrl":"https://apps.apple.com/app/id6833697642"}]}</script>''')
rep('<header id="hdr">','''<!--appbar--><div class="appbar" id="appbar"><span>📱 Get the free iPhone app</span><a href="https://apps.apple.com/app/id6833697642" target="_blank" rel="noopener" data-k="app_store">Download on the App Store ›</a><button aria-label="Hide" onclick="this.parentNode.remove();try{localStorage.setItem('wf-appbar-off','1')}catch(e){}">×</button></div><script>try{if(localStorage.getItem('wf-appbar-off'))document.getElementById('appbar').remove()}catch(e){}</script><!--/appbar-->
<header id="hdr">''')
rep('.okmsg{','.appbar{display:flex;align-items:center;gap:10px;background:#0E2338;color:#fff;font-size:13px;padding:7px 8px 7px 14px}.appbar span{flex:1}.appbar a{color:#fff;font-weight:700;text-decoration:none;background:#2F5D8A;border-radius:8px;padding:6px 10px;white-space:nowrap}.appbar button{background:none;border:0;color:#B9C7D6;font-size:20px;line-height:1;padding:4px 6px}\n.okmsg{')
rep('Check with the organizer before you go.<br>','Check with the organizer before you go.<br>Things to do in San Francisco, the Peninsula, Silicon Valley, Santa Cruz, Monterey, Carmel, Marin, Napa and Sonoma. <a href="privacy.html" style="color:inherit">Privacy</a><br>')
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
rep('Refreshed every Monday and Thursday morning. Stars are kept between refreshes.','Refreshed every Monday and Thursday morning. Your stars are kept between refreshes.')
assert 'Saving to the shared list' not in html and 'signed in' not in html.lower().replace('signed-in',''), [m.start() for m in re.finditer('signed in',html)]
import sys, json
cfg=json.load(open('sb.json'))
mod=open('gh_sync.js').read().replace('__SB_URL__',cfg['url']).replace('__SB_KEY__',cfg['key'])
i=html.rfind('\nrender();\n')
assert i>0
html=html[:i]+'\n'+mod+html[i:]
# v1.1 accounts and groups, right after the old shared-list code (it wraps some of its functions)
i=html.rfind('\nrender();\n')
html=html[:i]+'\n'+open('accounts.js').read()+html[i:]
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
PAIR='<script src="./data.js"></script>\n<script src="./walks.js"></script>'
assert html.count(PAIR)==1
html=html.replace(PAIR, '<script>/*wf-data*/(function(){var v=Math.floor(Date.now()/3e5);document.write(\'<script src="./data.js?v=\'+v+\'"><\\/script><script src="./walks.js?v=\'+v+\'"><\\/script>\')})();</script>')
html=html.replace('.okmsg{','.setup{background:#fff;border-radius:14px;padding:14px 16px;margin:0 0 12px}.setup strong{font-size:16px}\n.okmsg{',1)
open(sys.argv[1] if len(sys.argv)>1 else os.path.join("..","index.html"),'w').write(html)
# owner-only engagement dashboard (reads only through admin_* functions that check the signed-in account)
if len(sys.argv) <= 1:
    adm=open('admin.html').read().replace('__SB_URL__',cfg['url']).replace('__SB_KEY__',cfg['key'])
    os.makedirs(os.path.join('..','admin'), exist_ok=True)
    open(os.path.join('..','admin','index.html'),'w').write(adm)
print("ok", len(html))
