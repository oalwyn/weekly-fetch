"""End-to-end test of settings saved to the account (supabase/v1.7-accounts.sql + the v1.7 part of accounts.js).

Two simulated devices sign in to the same account, against supabase/tests/fakesupa.mjs, at phone width.
    python3 src/tests/test_prefs_e2e.py
"""
import sys, subprocess, time, json, urllib.request, os
from playwright.sync_api import sync_playwright
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SB = json.load(open(os.path.join(REPO, 'src/sb.json')))['url']
FAKE, SITE = 'http://localhost:8792', 'http://localhost:8783'
site = subprocess.Popen([sys.executable, '-m', 'http.server', '8783', '-d', REPO], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
fake = subprocess.Popen(['node', os.path.join(REPO, 'supabase/tests/fakesupa.mjs'), REPO, '8792'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
fake.stdout.readline(); time.sleep(1)
passed = failed = 0
def ok(c, m):
    global passed, failed
    if c: passed += 1
    else: failed += 1; print('FAIL:', m)
def sql(q): return json.loads(urllib.request.urlopen(urllib.request.Request(FAKE + '/test/sql', data=json.dumps({'sql': q}).encode(), method='POST')).read())
def forward(route):
    r = route.request; path = r.url[len(SB):]
    req = urllib.request.Request(FAKE + path, data=r.post_data_buffer if r.method not in ('GET', 'HEAD') else None, method=r.method,
                                 headers={k: v for k, v in r.headers.items() if k.lower() in ('authorization', 'apikey', 'content-type')})
    try:
        with urllib.request.urlopen(req) as resp: body, code = resp.read(), resp.status
    except urllib.error.HTTPError as e: body, code = e.read(), e.code
    route.fulfill(status=code, body=body, headers={'content-type': 'application/json', 'access-control-allow-origin': '*'})
def device(browser, errors, tour_done=True):
    ctx = browser.new_context(viewport={'width': 390, 'height': 844})
    if tour_done: ctx.add_init_script("try{if(!localStorage.getItem('wf-tour'))localStorage.setItem('wf-tour','done')}catch(e){}")
    ctx.route(lambda u: not u.startswith('http://localhost') and not u.startswith(SB) and 'fonts.g' not in u, lambda r: r.abort())
    ctx.route(SB + '/**', forward)
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errors.append(str(e)))
    return pg
def sign_in(pg, email, optin=False):
    pg.fill('form[data-acctform=email] input[name=email]', email)
    if optin: pg.check('input[data-optin]')
    pg.click('form[data-acctform=email] button'); pg.wait_for_selector('form[data-acctform=verify]')
    pg.fill('form[data-acctform=verify] input[name=code]', '123456'); pg.click('form[data-acctform=verify] button'); pg.wait_for_timeout(2000)
def cards(pg): return len(pg.query_selector_all('#main .card'))
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); errs = []
        # ---- phone: personalise while signed out, then sign in from the My interests nudge ----
        A = device(b, errs)
        A.goto(SITE + '/'); A.wait_for_timeout(1500)
        full = cards(A)
        A.click('[data-istrip]'); A.click('[data-like="sport"]'); A.click('[data-like="film"]'); A.click('[data-like="teen"]'); A.click('.idone'); A.wait_for_timeout(300)
        fewer = cards(A); ok(fewer < full, 'interests hide cards (%d -> %d)' % (full, fewer))
        ok(A.is_visible('[data-acctgo]'), 'signed out: "Save these to all your devices" shows under My interests')
        A.evaluate("localStorage.setItem('wf-home', JSON.stringify({name:'123 Castro St', lat:37.393871, lon:-122.079987})); localStorage.setItem('wf-dist','15')")
        A.click('[data-acctgo]'); A.wait_for_timeout(600)
        ok(A.evaluate('state.view') == 'our-list' and 'Keep your settings on every device' in A.inner_text('#main'), 'the nudge opens the sign-in card about settings')
        sign_in(A, 'pat@example.com', optin=True)
        A.fill('form[data-acctform=name] input[name=name]', 'Pat'); A.click('form[data-acctform=name] button'); A.wait_for_timeout(2500)
        row = sql("select prefs, email_opt_in, city from user_prefs")
        ok(len(row) == 1, 'first sign-in saves this device\'s settings to the account')
        pr = row[0]['prefs'] if row else {}
        ok(sorted(pr.get('likes_off') or []) == ['film', 'sport', 'teen'], 'interests saved')
        h = ((pr.get('cities') or {}).get('bayarea') or {}).get('home') or {}
        ok(h.get('name') == 'Home area' and h.get('lat') == 37.39 and h.get('lon') == -122.08, 'home saved as a rough area, never the street address: %s' % h)
        ok(((pr.get('cities') or {}).get('bayarea') or {}).get('dist') == 15, 'distance filter saved')
        ok(row and row[0]['email_opt_in'] is True and row[0]['city'] == 'bayarea', 'the email box ticked before signing in is saved')
        ok('saved to your account' in A.inner_text('#main').lower() and A.is_checked('input[data-optinset]'), 'account section shows saved settings and the ticked email box: ' + A.inner_text('#main')[:600])

        # ---- laptop: fresh device signs in → gets the phone's settings ----
        B = device(b, errs, tour_done=False)
        B.add_init_script("try{localStorage.setItem('wf-visits','5')}catch(e){}")   # a returning visitor, so no tour on load
        B.goto(SITE + '/#our-list'); B.wait_for_timeout(1500)
        sign_in(B, 'pat@example.com'); B.wait_for_timeout(1500)
        ok(B.evaluate('[...likesOff].sort().join()') == 'film,sport,teen', 'second device gets the interests')
        ok(B.evaluate('HOME_SET && HOME.lat') == 37.39 and B.evaluate('state.dist') == 15, 'second device gets the home area and distance: %s' % B.evaluate('JSON.stringify([HOME, HOME_SET, state.dist, localStorage.getItem("wf-home"), localStorage.getItem("wf-dist")])'))
        ok(B.evaluate("localStorage.getItem('wf-tour')") == 'done', 'second device knows the tour was seen (no repeat)')
        B.click('button[data-view="events"]'); B.wait_for_timeout(500)
        ok(cards(B) < fewer, 'second device shows the shortened list (interests, plus the 15 mi distance filter): %d' % cards(B))
        ok(B.is_visible('.inudge.ok'), 'My interests says "Saved to your account"')

        # ---- change on the laptop → reaches the phone when it comes back ----
        B.click('[data-istrip]'); B.click('[data-like="sport"]'); B.wait_for_timeout(2500)   # sport back on, saved after a short pause
        ok('sport' not in (sql("select prefs from user_prefs")[0]['prefs'].get('likes_off') or []), 'a change on the second device is saved')
        A.evaluate("prefsPull()"); A.wait_for_timeout(1200)
        ok(A.evaluate('[...likesOff].sort().join()') == 'film,teen', 'the first device picks it up')

        # ---- Sydney page: its own home and distance, same interests ----
        B.goto(SITE + '/sydney/'); B.wait_for_timeout(2500)
        ok(B.evaluate('[...likesOff].sort().join()') == 'film,teen', 'interests are the same in every city')
        ok(not B.evaluate('HOME_SET'), 'no Bay Area home on the Sydney page')
        B.evaluate("localStorage.setItem('wf-home', JSON.stringify({name:'Newtown', lat:-33.8978, lon:151.1795}))"); B.wait_for_timeout(2500)
        c = sql("select prefs from user_prefs")[0]['prefs']['cities']
        ok(c['sydney']['home']['name'] == 'Newtown' and c['bayarea']['home']['lat'] == 37.39, 'each city keeps its own home: %s' % json.dumps(c))

        # ---- email opt-out, then account deletion from the no-group account card ----
        A.click('button[data-view="our-list"]'); A.wait_for_timeout(500)
        A.uncheck('input[data-optinset]'); A.wait_for_timeout(800)
        ok(sql("select email_opt_in from user_prefs")[0]['email_opt_in'] is False, 'email opt-out saved')
        A.click('[data-acct="delete"]'); A.click('[data-acct="delete-yes"]'); A.wait_for_timeout(1500)
        ok(sql("select count(*)::int n from user_prefs")[0]['n'] == 0 and sql("select count(*)::int n from auth.users")[0]['n'] == 0, 'account and saved settings deleted from the account card')
        ok(A.evaluate('[...likesOff].sort().join()') == 'film,teen', 'this device keeps its own settings after deleting the account')
        ok(not errs, 'no page errors: %s' % errs[:3])
        b.close()
finally:
    site.terminate(); fake.terminate()
print(f'{passed} passed, {failed} failed')
sys.exit(1 if failed else 0)
