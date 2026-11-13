"""Smoke test for the site, with the shared-list database (Supabase) mocked.

Setup once:   pip3 install playwright && python3 -m playwright install chromium
Run:          python3 src/tests/test_site.py      (from the repo root)

It serves the repo folder locally, pins "today" to a fixed date, and simulates two
phones sharing one list: star things, lock plans into days, move a plan, filter,
and open the map. Prints PASS or the failing step.
"""
import asyncio, json, os, subprocess, sys, time
from playwright.async_api import async_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PORT = 8799
TODAY = os.environ.get("WF_TODAY", "2026,10,10")  # JS month is 0-based: Nov 10, 2026
SB = "https://halekjplfqkdteurtznv.supabase.co/rest/v1/rpc/*"
DB = []

async def fake_supabase(route):
    req = route.request; fn = req.url.rsplit("/", 1)[1]; b = json.loads(req.post_data or "{}")
    body = None
    if fn == "get_picks":
        body = [r for r in DB if r["list_code"] == b["p_list"]]
    elif fn == "add_pick":
        if not any(r["list_code"] == b["p_list"] and r["item_id"] == b["p_item"] and r["who"] == b["p_who"] for r in DB):
            DB.append({"list_code": b["p_list"], "item_id": b["p_item"], "who": b["p_who"], "item": b["p_item_json"]})
    elif fn == "remove_pick":
        DB[:] = [r for r in DB if not (r["list_code"] == b["p_list"] and r["item_id"] == b["p_item"] and r["who"] == b["p_who"])]
    else:
        body = "ok"
    await route.fulfill(status=200 if body is not None else 204, content_type="application/json",
                        body=json.dumps(body) if body is not None else "", headers={"Access-Control-Allow-Origin": "*"})

async def main():
    errs = []
    async with async_playwright() as p:
        exe = os.environ.get("CHROME")  # optional path to a Chrome binary
        b = await p.chromium.launch(**({"executable_path": exe} if exe else {}))
        async def phone(name):
            c = await b.new_context(viewport={"width": 390, "height": 844})
            await c.add_init_script("(()=>{const R=Date;const f=new R(%s,10,0,0).getTime();class D extends R{constructor(...a){if(a.length===0)super(f);else super(...a);}static now(){return f}};window.Date=D;})()" % TODAY)
            await c.route(SB, fake_supabase)
            pg = await c.new_page(); pg.on("pageerror", lambda e: errs.append(str(e)))
            pg.on("dialog", lambda d: asyncio.ensure_future(d.accept(name)))
            return pg
        me = await phone("Ken")
        # v1.1 retires starting new anonymous shared lists (groups replace them), but existing
        # #list- plans must keep working until people move them into a group: start from one.
        await me.context.add_init_script("localStorage.setItem('wf-list','smoketestsmoketestsmoke1');localStorage.setItem('wf-name','Ken')")
        await me.goto(f"http://localhost:{PORT}/"); await me.wait_for_timeout(400)
        ids = await me.evaluate("DATA.filter(e=>!isPast(e)&&e.cat!=='walk'&&e.cat!=='prog').slice(0,4).map(e=>e.id)")
        await me.click("button[data-view='our-list']"); await me.wait_for_timeout(400)
        assert await me.evaluate("!!document.querySelector('form[data-acctform=email]')"), "sign-in card missing on plans tab"
        for i in ids:
            await me.evaluate(f"toggleStar({json.dumps(i)})"); await me.wait_for_timeout(120)
        assert sum(1 for r in DB if not r["who"].startswith("__lock__")) == len(ids), "stars did not reach the shared list"
        wife = await phone("Sarah"); await wife.goto(await me.evaluate("inviteLink()")); await wife.wait_for_timeout(800)
        await wife.click("[data-expandall]"); await wife.wait_for_timeout(200)
        btn = await wife.query_selector("button.lockbtn[aria-pressed='false']")
        sel = await wife.query_selector("select[data-plan]")
        if btn: await btn.click()
        elif sel:
            v = await sel.evaluate("s=>s.options[1].value"); await sel.select_option(v)
        await wife.wait_for_timeout(400)
        assert any(r["who"].startswith("__lock__") for r in DB), "lock did not reach the shared list"
        await me.reload(); await me.wait_for_timeout(800); await me.click("button[data-view='our-list']"); await me.wait_for_timeout(300)
        assert await me.evaluate("document.querySelectorAll('.prow.locked').length") >= 1, "partner's lock not shown"
        await me.click("button[data-view='events']"); await me.click("[data-filtopen]"); await me.click("[data-cat='show']")
        await me.click(".fdone [data-filtopen]"); await me.wait_for_timeout(200)
        assert await me.evaluate("document.querySelectorAll('#main .card,#main .crow').length") > 0, "show filter empty"
        await me.click("button[data-view='map']"); await me.wait_for_timeout(300)
        assert await me.evaluate("document.querySelectorAll('[data-pin]').length") > 10, "map has no pins"
        await b.close()
    assert not errs, "page errors: " + "; ".join(errs)

if __name__ == "__main__":
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "-d", ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    try:
        asyncio.run(main()); print("PASS")
    except AssertionError as e:
        print("FAIL:", e); sys.exit(1)
    finally:
        srv.terminate()
