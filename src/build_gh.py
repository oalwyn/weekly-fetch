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
EARLY=('<script>(function(){var h=location.hash||"",u=location.pathname+location.search,'
       'go=function(){try{history.replaceState(null,"",u+"#our-list")}catch(e){}};'
       'if(/access_token=/.test(h)){var p=new URLSearchParams(h.slice(1));window.__wfTokens={access_token:p.get("access_token"),refresh_token:p.get("refresh_token")};go()}'
       'else if(/^#join-[A-Za-z0-9]{4,10}$/.test(h)){window.__wfJoin=h.slice(6).toUpperCase();go()}'
       'else if(/error_description=/.test(h)){window.__wfAuthError=1;go()}})();</script>\n')
assert html.count('<script src="./data.js"></script>')==1
html=html.replace('<script src="./data.js"></script>', EARLY+'<script src="./data.js"></script>')
html=html.replace('.okmsg{','.setup{background:#fff;border-radius:14px;padding:14px 16px;margin:0 0 12px}.setup strong{font-size:16px}\n.okmsg{',1)
open(sys.argv[1] if len(sys.argv)>1 else os.path.join("..","index.html"),'w').write(html)
print("ok", len(html))
