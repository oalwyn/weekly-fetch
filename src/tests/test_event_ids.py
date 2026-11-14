"""[10] Re-ingesting data keeps event ids and history; a re-issued id is caught."""
import os, sys, subprocess, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools"))
import event_ids as t

old = [
  {"id": "sj-lights", "title": "San Jose Holiday Lights", "meta": "Plaza de Cesar Chavez, San Jose · free", "start": "2026-11-13", "end": "2027-01-01"},
  {"id": "nutcracker-sfb", "title": "The Nutcracker", "meta": "War Memorial Opera House, SF", "dates": ["2026-12-04", "2026-12-05"]},
  {"id": "old-market", "title": "Fall Market", "meta": "Palo Alto", "start": "2026-11-08"},
]
fails = 0
def ok(c, m):
    global fails
    if not c: fails += 1; print("FAIL:", m)

# a normal refresh: same ids kept, one past event dropped, one new
new = [dict(old[0]), dict(old[1], dates=["2026-12-04", "2026-12-05", "2026-12-06"]), {"id": "49ers-rams", "title": "49ers vs. Rams", "meta": "Levi's Stadium, Santa Clara", "start": "2026-12-13"}]
reids, removed, added = t.compare(old, new)
ok(reids == [] and [e["id"] for e in removed] == ["old-market"] and [e["id"] for e in added] == ["49ers-rams"], "normal refresh: ids kept, no re-ID flagged")
ok({e["id"] for e in new} >= {"sj-lights", "nutcracker-sfb"}, "existing events keep their ids (and so their stars, plans and history)")

# a bad refresh: the same listing comes back under a new id
bad = [dict(old[0], id="san-jose-holiday-lights-2026"), old[1]]
reids, _, _ = t.compare(old, bad)
ok(reids == [("sj-lights", "san-jose-holiday-lights-2026")], "re-issued id is flagged")

# a different show at the same venue is not a re-ID
other = [old[0], {"id": "hip-hop-nutcracker", "title": "The Hip Hop Nutcracker", "meta": "San Jose Center for the Performing Arts", "dates": ["2026-12-10"]}]
reids, _, _ = t.compare(old, other)
ok(reids == [], "a different event isn't mistaken for a re-ID")

# occurrence ids are id@day, so history of a multi-day event stays per day
ok("nutcracker-sfb@2026-12-05".split("@")[0] == "nutcracker-sfb", "occurrence id keeps the event id")

# the real data.js parses and has unique ids
items = t.parse(open(os.path.join(t.ROOT, "data.js")).read())
ok(len(items) == len({e["id"] for e in items}), "data.js ids are unique")
print(f"{'PASS' if not fails else 'FAILED'} ({fails} failures)")
sys.exit(1 if fails else 0)
