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
html=html.replace('.okmsg{','.setup{background:#fff;border-radius:14px;padding:14px 16px;margin:0 0 12px}.setup strong{font-size:16px}\n.okmsg{',1)
open(sys.argv[1] if len(sys.argv)>1 else os.path.join("..","index.html"),'w').write(html)
print("ok", len(html))
