"""End-to-end test of v1.1 accounts and groups on the website.

Runs the site against supabase/tests/fakesupa.mjs: the real supabase/v1.1-groups.sql in an
in-memory Postgres (PGlite), with fake email sign-in codes (the code is always 123456).
Two or three simulated people at phone width: sign in, name, create a group, invite by link,
star and lock, settings, convert an old #list- plan, leave, sign out, delete account.

Run from the repo root (needs node, `npm install`, and Playwright):
    python3 src/tests/test_groups_e2e.py            # screenshots go to a temp folder
"""
import sys, subprocess, time, json, urllib.request, os
from playwright.sync_api import sync_playwright
import tempfile
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
SB = json.load(open(os.path.join(REPO, 'src/sb.json')))['url']
FAKE = 'http://localhost:8790'
site = subprocess.Popen([sys.executable, '-m', 'http.server', '8781', '-d', REPO], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
fake = subprocess.Popen(['node', os.path.join(REPO, 'supabase/tests/fakesupa.mjs'), REPO, '8790'], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
fake.stdout.readline(); time.sleep(1)
passed = failed = 0
def ok(c, m):
    global passed, failed
    if c: passed += 1
    else: failed += 1; print('FAIL:', m)
def forward(route):
    r = route.request; path = r.url[len(SB):]
    req = urllib.request.Request(FAKE + path, data=r.post_data_buffer if r.method not in ('GET', 'HEAD') else None, method=r.method,
                                 headers={k: v for k, v in r.headers.items() if k.lower() in ('authorization', 'apikey', 'content-type')})
    try:
        with urllib.request.urlopen(req) as resp: body, code = resp.read(), resp.status
    except urllib.error.HTTPError as e: body, code = e.read(), e.code
    route.fulfill(status=code, body=body, headers={'content-type': 'application/json', 'access-control-allow-origin': '*'})
def sql(q): return json.loads(urllib.request.urlopen(urllib.request.Request(FAKE + '/test/sql', data=json.dumps({'sql': q}).encode(), method='POST')).read())
def person(browser, errors, storage=None):
    ctx = browser.new_context(viewport={'width': 390, 'height': 844})
    if storage: ctx.add_init_script('(()=>{' + ''.join(f'localStorage.setItem({json.dumps(k)},{json.dumps(v)});' for k, v in storage.items()) + '})()')
    ctx.route(SB + '/**', forward)
    pg = ctx.new_page(); pg.on('pageerror', lambda e: errors.append(str(e)))
    pg.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    return pg
def plans(pg): pg.click('button[data-view="our-list"]'); pg.wait_for_timeout(600)
def sign_in(pg, email):
    pg.fill('form[data-acctform=email] input[name=email]', email); pg.click('form[data-acctform=email] button'); pg.wait_for_selector('form[data-acctform=verify]')
    pg.fill('form[data-acctform=verify] input[name=code]', '123456'); pg.click('form[data-acctform=verify] button'); pg.wait_for_timeout(1200)
try:
    with sync_playwright() as p:
        b = p.chromium.launch(); errs = []
        # ---- Olivier: signs in, names himself, creates a group, stars + locks ----
        A = person(b, errs); A.goto('http://localhost:8781/#events'); A.wait_for_timeout(800)
        plans(A); ok(A.is_visible('form[data-acctform=email]'), 'signed-out plans tab shows email sign-in')
        ok('Start our shared plans' not in A.inner_text('main'), 'old anonymous "start shared plans" card retired')
        A.screenshot(path=f'{OUT}/e2e-1-signin.png')
        A.fill('form[data-acctform=email] input[name=email]', 'olivier@example.com'); A.click('form[data-acctform=email] button')
        A.wait_for_selector('form[data-acctform=verify]'); A.screenshot(path=f'{OUT}/e2e-2-code.png')
        A.fill('form[data-acctform=verify] input[name=code]', '000000'); A.click('form[data-acctform=verify] button'); A.wait_for_timeout(800)
        ok(A.is_visible('.errmsg'), 'wrong code shows an error')
        A.fill('form[data-acctform=verify] input[name=code]', '123456'); A.click('form[data-acctform=verify] button'); A.wait_for_timeout(1200)
        ok(A.is_visible('form[data-acctform=name]'), 'after sign-in asks for a first name')
        A.fill('form[data-acctform=name] input', 'Olivier'); A.click('form[data-acctform=name] button'); A.wait_for_timeout(1000)
        ok(A.is_visible('form[data-acctform=create]') and A.is_visible('form[data-acctform=join]'), 'offers create or join')
        A.fill('form[data-acctform=create] input', 'Our household'); A.click('form[data-acctform=create] button'); A.wait_for_timeout(1500)
        code = A.inner_text('.icode').strip()
        ok(len(code) == 6 and A.is_visible('.qr svg'), f'invite panel shows code {code} and a QR code')
        ok('theweekendfetch.com/join/?c=' + code in A.inner_text('.ilink'), 'invite link uses the new domain')
        A.screenshot(path=f'{OUT}/e2e-3-invite.png', full_page=True)
        A.click('[data-acct=close]'); A.click('button[data-view="events"]'); A.wait_for_timeout(500)
        first = A.get_attribute('[data-star]', 'data-star'); A.click(f'[data-star="{first}"]'); A.wait_for_timeout(1200)
        rows = sql(f"select who from group_picks where item_id = '{first}'"); ok(len(rows) == 1, 'star saved to the group')
        plans(A); A.click(f'[data-expand="{first}"]'); A.wait_for_timeout(300)
        lock = A.query_selector(f'[data-lock="{first}"]') or None
        if lock: lock.click()
        else: A.select_option(f'select[data-plan="{first}"]', index=1)
        A.wait_for_timeout(1200)
        ok(len(sql(f"select day from group_locks where item_id = '{first}'")) == 1, 'locked-in day saved to the group')
        # ---- Sam: opens the invite link signed out, signs in, joins ----
        B = person(b, errs); B.goto(f'http://localhost:8781/join/?c={code.lower()}'); B.wait_for_timeout(1500)
        ok('invited to a group' in B.inner_text('main'), 'invite link while signed out asks to sign in to join')
        sign_in(B, 'sam@example.com')
        B.fill('form[data-acctform=name] input', 'Sam'); B.click('form[data-acctform=name] button'); B.wait_for_timeout(1500)
        txt = B.inner_text('main')
        ok('Our household' in txt, 'Sam lands in the group after sign-in (pending invite kept through sign-in and naming)')
        if 'Our household' not in txt:
            B.fill('form[data-acctform=join] input', code); B.click('form[data-acctform=join] button'); B.wait_for_timeout(1200); txt = B.inner_text('main')
        B.click('button[data-view="events"]'); B.wait_for_timeout(500)
        ok('Olivier' in B.inner_text(f'#card-{first}'), "Sam sees Olivier's star on the event card")
        B.click(f'[data-star="{first}"]'); B.wait_for_timeout(1200)
        A.evaluate('sync()'); A.wait_for_timeout(1200); A.click('button[data-view="events"]'); A.wait_for_timeout(400)
        ok('You & Sam' in A.inner_text(f'#card-{first}'), "Olivier sees 'You & Sam' after sync")
        plans(A)
        A.screenshot(path=f'{OUT}/e2e-4-group.png', full_page=True)
        # ---- who's going and meet-up ----
        if not A.is_visible('.going'): A.click(f'[data-expand="{first}"]'); A.wait_for_timeout(300)
        ok(A.is_visible('.going') and A.get_attribute('.rbtn.going', 'aria-pressed') == 'true', 'locking it in marks Olivier as going')
        plans(B)
        if not B.is_visible('.going'): B.click(f'[data-expand="{first}"]'); B.wait_for_timeout(300)
        B.click('.rbtn.no'); B.wait_for_timeout(1200)
        ok(sql(f"select status from group_rsvps r join auth.users u on u.id = r.user_id where u.email = 'sam@example.com' and item_id = '{first}'")[0]['status'] == 'no', "Sam's Can't saved")
        B.click('.going [data-acct=meet-edit]'); B.wait_for_timeout(200)
        B.fill('form[data-acctform=meet] input[name=t]', '10:30'); B.fill('form[data-acctform=meet] input[name=p]', 'Front gate'); B.click('form[data-acctform=meet] button.copybtn:not(.alt)'); B.wait_for_timeout(1200)
        ok(sql(f"select meet_time, meet_place from group_locks where item_id = '{first}'")[0] == {'meet_time': '10:30', 'meet_place': 'Front gate'}, 'meet-up saved')
        A.evaluate('sync()'); A.wait_for_timeout(1200); plans(A)
        if not A.is_visible('.going'): A.click(f'[data-expand="{first}"]'); A.wait_for_timeout(300)
        t = A.inner_text('main')
        ok('Meet 10:30am · Front gate' in t and "Can't: Sam" in t and 'Going: Olivier' in t, 'Olivier sees the meet-up and who is going')
        ok('1 going' in A.inner_text(f'.prow:has([data-expand="{first}"]) .pg'), 'folded row shows the headcount')
        A.screenshot(path=f'{OUT}/e2e-4b-going.png', full_page=True)
        # ---- second group with a plan the same day: All my plans shows the clash ----
        day = sql(f"select day::text d from group_locks where item_id = '{first}'")[0]['d']
        A.click('[data-acct=settings]'); A.wait_for_timeout(200); A.click('[data-acct=add]'); A.wait_for_timeout(200)
        A.fill('.apanel form[data-acctform=create] input', 'Friends'); A.click('.apanel form[data-acctform=create] button'); A.wait_for_timeout(1500)
        g2 = sql("select id from groups where name = 'Friends'")[0]['id']
        sql(f"insert into group_locks(group_id,item_id,day,item) values ('{g2}','zz-hike','{day}','{{\"title\":\"Friends hike\",\"when\":\"Sat\"}}')")
        A.click('[data-acct=close]') if A.is_visible('[data-acct=close]') else None
        A.select_option('select[data-gswitch]', '__all'); A.wait_for_timeout(1500)
        ok(A.locator('.arow').count() == 2 and A.locator('.arow.clash').count() == 2 and 'Clashes with' in A.inner_text('main'), 'All my plans lists both groups and flags the clash')
        A.screenshot(path=f'{OUT}/e2e-4c-all.png', full_page=True)
        A.click(f'[data-acct=open-group][data-id="{first}"]'); A.wait_for_timeout(1500)
        ok(A.is_visible('.going') and 'Friends hike' in A.inner_text(f'.prow:has([data-expand="{first}"])'), 'Open in group returns to the plan, still showing the clash')
        # ---- settings: rename, members, new code (owner), Sam can't make codes ----
        A.click('[data-acct=settings]'); A.wait_for_timeout(300)
        ok('Sam' in A.inner_text('.members') and 'owner' in A.inner_text('.members'), 'members list shows both, with owner')
        A.screenshot(path=f'{OUT}/e2e-5-settings.png', full_page=True)
        A.fill('form[data-acctform=rename-group] input', 'The Alwyns'); A.click('form[data-acctform=rename-group] button'); A.wait_for_timeout(1000)
        ok('The Alwyns' in A.inner_text('.gbar'), 'group renamed')
        if not A.is_visible('[data-acct=newcode]'): A.click('[data-acct=settings]'); A.wait_for_timeout(200)
        A.click('[data-acct=newcode]'); A.wait_for_timeout(1000)
        ok(sql("select join_code from groups")[0]['join_code'] != code, 'owner made a new join code')
        plans(B); B.click('[data-acct=settings]'); B.wait_for_timeout(200)
        ok(not B.is_visible('[data-acct=newcode]'), 'non-owner has no "new code" button')
        # ---- old shared plan converts into a group ----
        L = 'oldlistoldlistoldlist123'
        sql(f"insert into picks(list_code,item_id,who,item) values ('{L}','{first}','Dana','{{\"title\":\"x\"}}'),('{L}','{first}','Kim','{{\"title\":\"x\"}}'),('{L}','{first}','__lock__2026-12-05','{{\"title\":\"x\"}}')")
        C = person(b, errs, {'wf-list': L, 'wf-name': 'Kim'}); C.goto('http://localhost:8781/#our-list'); C.wait_for_timeout(1200)
        sign_in(C, 'kim@example.com'); C.wait_for_timeout(800)
        ok(C.is_visible('form[data-acctform=convert]'), 'old shared-plan user is offered "move into a group" (name Kim carried over)')
        C.click('form[data-acctform=convert] button'); C.wait_for_timeout(1500)
        g = sql(f"select id from groups where legacy_list_code = '{L}'")
        ok(len(g) == 1 and len(sql(f"select 1 from group_picks where group_id = '{g[0]['id']}'")) == 2, 'old plan became a group with both stars')
        C.screenshot(path=f'{OUT}/e2e-6-converted.png', full_page=True)
        C.click('button[data-view="events"]'); C.wait_for_timeout(500)
        ok('Dana' in C.inner_text(f'#card-{first}') and 'You' in C.inner_text(f'#card-{first}'), "old stars show by name (Dana) and Kim's own as You")
        # ---- leave, sign out, delete account ----
        B.click('[data-acct=leave]'); B.wait_for_timeout(1200)
        ok(B.is_visible('form[data-acctform=create]'), 'after leaving, Sam is offered create/join again')
        B.click('[data-acct=signout]'); B.wait_for_timeout(800)
        ok(B.is_visible('form[data-acctform=email]'), 'sign out returns to the sign-in card')
        sign_in(B, 'sam@example.com'); B.wait_for_timeout(500)
        A.click('[data-acct=settings]') if not A.is_visible('[data-acct=delete]') else None; A.wait_for_timeout(200)
        A.click('[data-acct=delete]'); A.wait_for_timeout(200); ok(A.is_visible('[data-acct=delete-yes]'), 'delete asks to confirm')
        A.click('[data-acct=delete-yes]'); A.wait_for_timeout(1500)
        ok(len(sql("select 1 from auth.users where email = 'olivier@example.com'")) == 0, 'account deleted')
        ok(A.is_visible('form[data-acctform=email]') and 'deleted' in A.inner_text('main'), 'after deletion, back to signed-out view')
        # ---- usage counts and errors ----
        ev = json.loads(urllib.request.urlopen(FAKE + '/test/events').read()); kinds = [e['kind'] for e in ev]
        for k in ['app_open', 'sign_in', 'create_group', 'star', 'lock', 'join_group']: ok(k in kinds, f'usage count recorded: {k}')
        ok(all(e['platform'] == 'web' for e in ev), 'usage counts tagged web')
        ok(not errs, 'no page errors: ' + ' | '.join(errs[:5]))
        b.close()
finally:
    site.terminate(); fake.terminate()
print(f'{passed} passed, {failed} failed')
sys.exit(1 if failed else 0)
