"""End-to-end test of engagement measurement on the website (supabase/v1.3-analytics.sql + accounts.js logger).

Runs the real site against supabase/tests/fakesupa.mjs (real SQL in an in-memory Postgres) at phone width.
Numbers in [brackets] refer to the acceptance tests in the measurement plan.
    python3 src/tests/test_analytics_e2e.py
"""
import sys, subprocess, time, json, urllib.request, os
from playwright.sync_api import sync_playwright
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SB = json.load(open(os.path.join(REPO, 'src/sb.json')))['url']
FAKE, SITE = 'http://localhost:8791', 'http://localhost:8782'
site = subprocess.Popen([sys.executable, '-m', 'http.server', '8782', '-d', REPO], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
fake = subprocess.Popen(['node', os.path.join(REPO, 'supabase/tests/fakesupa.mjs'), REPO, '8791'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
fake.stdout.readline(); time.sleep(1)
passed = failed = 0
def ok(c, m):
    global passed, failed
    if c: passed += 1
    else: failed += 1; print('FAIL:', m)
def get(path): return json.loads(urllib.request.urlopen(FAKE + path).read())
def sql(q): return json.loads(urllib.request.urlopen(urllib.request.Request(FAKE + '/test/sql', data=json.dumps({'sql': q}).encode(), method='POST')).read())
def recs(): return get('/test/analytics')
def forward(route):
    r = route.request; path = r.url[len(SB):]
    req = urllib.request.Request(FAKE + path, data=r.post_data_buffer if r.method not in ('GET', 'HEAD') else None, method=r.method,
                                 headers={k: v for k, v in r.headers.items() if k.lower() in ('authorization', 'apikey', 'content-type')})
    try:
        with urllib.request.urlopen(req) as resp: body, code = resp.read(), resp.status
    except urllib.error.HTTPError as e: body, code = e.read(), e.code
    route.fulfill(status=code, body=body, headers={'content-type': 'application/json', 'access-control-allow-origin': '*'})
def person(browser, errors, fail_analytics=False):
    ctx = browser.new_context(viewport={'width': 390, 'height': 844})
    ctx.grant_permissions(['clipboard-read', 'clipboard-write'])
    ctx.route(lambda u: not u.startswith('http://localhost') and not u.startswith(SB) and 'fonts.g' not in u, lambda r: r.abort())   # no real outside sites
    ctx.route(SB + '/**', forward)
    if fail_analytics: ctx.route(SB + '/rest/v1/rpc/log_client_event', lambda r: r.fulfill(status=500, body='{"message":"down"}'))   # later routes win
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errors.append(str(e)))
    return pg
def sign_in(pg, email):
    pg.click('button[data-view="our-list"]'); pg.wait_for_timeout(500)
    pg.fill('form[data-acctform=email] input[name=email]', email); pg.click('form[data-acctform=email] button'); pg.wait_for_selector('form[data-acctform=verify]')
    pg.fill('form[data-acctform=verify] input[name=code]', '123456'); pg.click('form[data-acctform=verify] button'); pg.wait_for_timeout(1500)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); errs = []
        # ---- signed-out visitor arriving from a newsletter link with junk parameters ----
        A = person(b, errs)
        A.goto(SITE + '/?utm_source=News%20Letter&utm_campaign=Fall_2026&token=secret123&email=a%40b.com#events'); A.wait_for_timeout(1500)
        r = recs()
        ok(len(r) >= 1 and r[0]['event_name'] == 'page_view', 'page_view recorded on load')
        ok(r[0]['source'] == 'newsletter' and r[0]['landing_path'] == '/' and r[0]['environment'] == 'development', '[13] first record carries allowlisted UTM source and plain path; localhost is development')
        ok('secret123' not in json.dumps(r) and 'a@b' not in json.dumps(r), '[13] token and email from the address are not stored')
        anon1 = r[0]['anon_id']; ok(bool(anon1) and not r[0]['signed_in'], 'signed-out record has a device code, no account')
        # [4] local star
        first = A.get_attribute('article.card [data-star]', 'data-star')
        A.click(f'article.card [data-star="{first}"]'); A.wait_for_timeout(800)
        st = [x for x in recs() if x['event_name'] == 'event_starred']
        ok(len(st) == 1 and st[0]['evidence'] == 'client_observed' and st[0]['item_id'] == first and st[0]['placement'] == 'event_card' and st[0]['category'],
           '[1][4] one tap → one event_starred, reported by the device, with placement and category')
        # [3] double tap on a Tickets link → one record; [9] booking click, never a purchase
        tix = A.query_selector('a.price.tix')
        if tix:
            tix.click(modifiers=['Meta']); tix.click(modifiers=['Meta']); A.wait_for_timeout(800)
            bk = [x for x in recs() if x['event_name'] == 'outbound_booking_clicked']
            ok(len(bk) == 1 and bk[0]['dest_host'] and bk[0]['has_outbound_id'], '[3][9] a double tap on Tickets is one outbound_booking_clicked with destination host and click id')
            ok(not any('purchase' in x['event_name'] or 'order' in x['event_name'] for x in recs()), '[9] nothing is labeled a purchase')
            ok(recs() and all(x['city'] == 'bayarea' for x in recs()), 'every record from the Bay Area page carries city bayarea')
        else: ok(False, 'no Tickets link on the page to test')
        # filters and map
        A.click('[data-filtopen]'); A.click('button[data-cat="sport"]'); A.wait_for_timeout(500)
        ok(any(x['event_name'] == 'filter_applied' and x['props'] and x['props'].get('value') == 'sport' for x in recs()), 'filter_applied with the category')
        A.click('button[data-cat="all"]'); A.click('[data-filtopen]')
        A.click('button[data-view="map"]'); A.wait_for_timeout(800)
        A.evaluate("""() => { const g=[...document.querySelectorAll('[data-pin]')].find(p => { const r=p.getBoundingClientRect(); const h=document.elementFromPoint(r.x+r.width/2, r.y+r.height/2); return h && h.closest('[data-pin]'); }); const r=g.getBoundingClientRect(); const o={bubbles:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2,pointerId:1,isPrimary:true};
          const s=document.getElementById('map'); s.dispatchEvent(new PointerEvent('pointerdown',o)); s.dispatchEvent(new PointerEvent('pointerup',o)); }""")
        A.wait_for_timeout(600)
        ok(any(x['event_name'] == 'map_event_opened' for x in recs()), 'map_event_opened when a pin shows its card')
        # ---- [5] sign in: new records carry the account, never the device code; earlier records untouched ----
        n_before = len(recs())
        sign_in(A, 'ann@example.com')
        A.fill('form[data-acctform=name] input', 'Ann'); A.click('form[data-acctform=name] button'); A.wait_for_timeout(1000)
        A.fill('form[data-acctform=create] input', 'Household'); A.click('form[data-acctform=create] button'); A.wait_for_timeout(1500)
        r = recs()
        ok(any(x['event_name'] == 'sign_in' and x['signed_in'] and not x['anon_id'] for x in r), '[5] sign_in recorded under the account, without the device code')
        ok(sum(1 for x in r if x['event_name'] == 'group_created' and x['evidence'] == 'server_confirmed') == 1, 'group_created confirmed by the server')
        ok(all(not x['signed_in'] for x in r[:n_before]), '[5] activity from before sign-in is not re-labeled with the account')
        ok(not any(x['signed_in'] and x['anon_id'] for x in r), '[6] no record links the device code to the account')
        sess_before = {x['session_id'] for x in r[:n_before]}; sess_after = {x['session_id'] for x in r[n_before:] if x['signed_in'] and x['session_id']}
        ok(sess_after and not (sess_before & sess_after), '[6] signing in starts a new session (the two are never linked)')
        # [1] group star: exactly one record, from the server
        A.click('[data-acct=close]') if A.is_visible('[data-acct=close]') else None
        A.click('button[data-view="events"]'); A.wait_for_timeout(500)
        second = A.evaluate("[...document.querySelectorAll('article.card [data-star]')].map(b=>b.dataset.star).find(i=>i!==%s)" % json.dumps(first))
        A.click(f'article.card [data-star="{second}"]'); A.wait_for_timeout(1500)
        gs = [x for x in recs() if x['event_name'] == 'event_starred' and x['item_id'] == second]
        ok(len(gs) == 1 and gs[0]['evidence'] == 'server_confirmed' and gs[0]['in_group'] and gs[0]['placement'] == 'event_card' and gs[0]['category'],
           '[1] one group star → exactly one server-confirmed record with placement and category')
        # [8] invite opened/copied is separate from joining
        A.click('button[data-view="our-list"]'); A.wait_for_timeout(500)
        if A.is_visible('[data-acct=invite]'): A.click('[data-acct=invite]'); A.wait_for_timeout(300)
        share = A.query_selector('[data-acct=share]')
        if share: share.click(); A.wait_for_timeout(800)
        r = recs()
        ok(any(x['event_name'] == 'invite_share_opened' for x in r) and not any(x['event_name'] == 'group_joined' for x in r), '[8] sharing an invite is not a join')
        code = sql("select join_code from groups limit 1")[0]['join_code']
        B = person(b, errs); B.goto(f'{SITE}/join/?c={code}'); B.wait_for_timeout(1500)
        sign_in(B, 'ben@example.com')
        B.fill('form[data-acctform=name] input', 'Ben'); B.click('form[data-acctform=name] button'); B.wait_for_timeout(2000)
        jn = [x for x in recs() if x['event_name'] == 'group_joined']
        ok(len(jn) == 1 and jn[0]['evidence'] == 'server_confirmed' and (jn[0]['props'] or {}).get('via') == 'link', '[8] the join is recorded once, by the server, via the link')
        # ---- [6] sign out: a new device code, so the next person on this device is separate ----
        A.click('button[data-view="our-list"]'); A.wait_for_timeout(400)
        A.click('[data-acct=settings]') if A.is_visible('[data-acct=settings]') else None
        A.wait_for_timeout(300); A.click('[data-acct=signout]'); A.wait_for_timeout(1200)
        anon2 = A.evaluate("localStorage.getItem('wf-anon')")
        ok(anon2 and anon2 != anon1, '[6] signing out replaces the device code')
        A.reload(); A.wait_for_timeout(1200)
        last = recs()[-1]
        ok(last['event_name'] == 'page_view' and not last['signed_in'] and last['anon_id'] == anon2, '[6] the next visit is a new anonymous identity')
        # ---- [14] analytics down: the app still works ----
        e14 = []
        C = person(b, e14, fail_analytics=True); C.goto(SITE + '/#events'); C.wait_for_timeout(1000)
        sid = C.get_attribute('article.card [data-star]', 'data-star')
        C.click(f'article.card [data-star="{sid}"]'); C.wait_for_timeout(600)
        ok(C.get_attribute(f'article.card [data-star="{sid}"]', 'aria-pressed') == 'true' and not e14, '[14] starring works and nothing breaks when analytics fails')
        q = C.evaluate("JSON.parse(localStorage.getItem('wf-aq')||'[]').length")
        ok(q >= 1, 'failed records wait in a small local queue for later (the server ignores repeats)')
        # ---- [15] dashboard: refused for a non-admin, shown for an admin ----
        D = person(b, errs); D.goto(SITE + '/'); D.wait_for_timeout(800); sign_in(D, 'dan@example.com')
        D.goto(SITE + '/admin/'); D.wait_for_timeout(1500)
        ok("doesn't have access" in D.inner_text('body'), "[15] the dashboard refuses an account that isn't an admin")
        sql("insert into analytics_admins(user_id) select id from auth.users where email = 'dan@example.com'")
        D.reload(); D.wait_for_timeout(2000)
        body = D.inner_text('body')
        ok('Weekly' in body and 'Meaningful retention' in body and 'America/Los_Angeles' in body and 'not yet eligible' in body, 'dashboard shows sections, timezone and not-yet-eligible cells')
        ok('records left out of KPIs' in body, 'dashboard health shows excluded (development) records')
        D.screenshot(path='/tmp/fetch-admin.png', full_page=True) if os.environ.get('SHOT') else None
        ok(not errs, 'no page errors: ' + '; '.join(errs[:3]))
        b.close()
finally:
    site.terminate(); fake.terminate()
print(f'{passed} passed, {failed} failed')
sys.exit(1 if failed else 0)
