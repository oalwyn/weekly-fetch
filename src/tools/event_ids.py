#!/usr/bin/env python3
"""Event ID stability and history for data.js (engagement measurement).

  python3 src/tools/event_ids.py check [REF]   compare data.js with git REF (default HEAD); exit 1 if an event
                                               seems to have been re-listed under a new id
  python3 src/tools/event_ids.py catalog > catalog.csv
                                               every id ever published, with first/last seen and title, from git history

Stars, plans and usage records are keyed by an event's id, so an id must never change while the event is listed.
An occurrence is identified as "<id>@<YYYY-MM-DD>" when a specific day matters (locked-in plans, calendar adds).
"""
import csv, json, re, subprocess, sys, os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

def parse(text):
    m = re.search(r"window\.WF_DATA\s*=\s*", text)
    if not m: raise ValueError("not a data.js")
    body = text[m.end():].strip().rstrip(";")
    return json.loads(body)["items"]

def norm(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())

def venue(e):
    return norm((e.get("meta") or "").split(" · ")[0])[:20]

def dates(e):
    if e.get("dates"): return set(e["dates"])
    if e.get("start"): return {e["start"]} | ({e["end"]} if e.get("end") else set())
    if e.get("deadline"): return {e["deadline"]}
    return set()

def compare(old, new):
    """Returns (reids, removed, added): reids are (old_id, new_id) pairs that look like the same listing."""
    o = {e["id"]: e for e in old}; n = {e["id"]: e for e in new}
    removed = [o[i] for i in o if i not in n]; added = [n[i] for i in n if i not in o]
    reids = []
    for a in removed:
        for b in added:
            same_title = norm(a.get("title"))[:30] == norm(b.get("title"))[:30] and norm(a.get("title"))
            same_place = venue(a) and venue(a) == venue(b)
            overlap = bool(dates(a) & dates(b)) or not (dates(a) and dates(b))
            if same_title and (same_place or overlap):
                reids.append((a["id"], b["id"]))
    return reids, removed, added

def git_show(ref, path="data.js"):
    return subprocess.run(["git", "-C", ROOT, "show", f"{ref}:{path}"], capture_output=True, text=True, check=True).stdout

def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
    if cmd == "check":
        ref = sys.argv[2] if len(sys.argv) > 2 else "HEAD"
        old = parse(git_show(ref)); new = parse(open(os.path.join(ROOT, "data.js")).read())
        reids, removed, added = compare(old, new)
        print(f"kept {len(new) - len(added)}, removed {len(removed)}, added {len(added)}")
        for a, b in reids: print(f"RE-ID: {a} -> {b}  (keep the old id {a})")
        dup = [i for i in {e['id'] for e in new} if sum(1 for e in new if e['id'] == i) > 1]
        for d in dup: print(f"DUPLICATE ID: {d}")
        sys.exit(1 if reids or dup else 0)
    if cmd == "catalog":
        revs = subprocess.run(["git", "-C", ROOT, "log", "--reverse", "--format=%H %cI", "--", "data.js"], capture_output=True, text=True, check=True).stdout.split("\n")
        seen = {}
        for line in filter(None, revs):
            h, when = line.split(" ", 1)
            try: items = parse(git_show(h))
            except Exception: continue
            for e in items:
                r = seen.setdefault(e["id"], {"id": e["id"], "first_seen": when, "title": e.get("title"), "category": e.get("cat"), "venue": (e.get("meta") or "").split(" · ")[0]})
                r["last_seen"] = when; r["title"] = e.get("title"); r["category"] = e.get("cat")
        w = csv.DictWriter(sys.stdout, fieldnames=["id", "first_seen", "last_seen", "title", "category", "venue"])
        w.writeheader(); [w.writerow(r) for r in seen.values()]
        return
    print(__doc__); sys.exit(2)

if __name__ == "__main__":
    main()
