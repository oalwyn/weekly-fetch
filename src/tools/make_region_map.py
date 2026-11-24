#!/usr/bin/env python3
"""Map for an inland region (a whole state, e.g. Montana): the state outline instead of a coastline.

  1. Download the state's boundary relation (public OpenStreetMap data, via any Overpass server):
       [out:json];relation["boundary"="administrative"]["admin_level"="4"]["name"="Montana"];out geom;
  2. Optionally download its big lakes (natural=water relations or closed ways, by name).
  3. python3 src/tools/make_region_map.py border.json S N W E out.json [width_px] [lakes.json]

Writes {"W","H","bbox","d","out","rule"}: d = the lakes (drawn as water), out = the state outline; the app shades
everything outside it (a full-map rectangle plus this outline, filled evenodd) and strokes the border.
Same projection as make_coast.py (equirectangular, x scaled by cos(mid latitude)).
"""
import json, math, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from make_coast import join_rings, water_areas, simplify, area

def main():
    src, S, N, Wl, El, out = sys.argv[1], *map(float, sys.argv[2:6]), sys.argv[6]
    Wpx = int(sys.argv[7]) if len(sys.argv) > 7 else 1000
    lakes = sys.argv[8] if len(sys.argv) > 8 else None
    kx = math.cos(math.radians((S + N) / 2))
    Hpx = round(Wpx * (N - S) / ((El - Wl) * kx))
    proj = lambda p: ((p[0] - Wl) / (El - Wl) * Wpx, (N - p[1]) / (N - S) * Hpx)
    def path(rings, tol, flip_neg=None):
        parts = []
        for r, hole in rings:
            px = simplify([proj(p) for p in r], tol)
            if len(px) < 3: continue
            if flip_neg is not None and (area(px) < 0) != hole: px = px[::-1]
            xs = [p[0] for p in px]; ys = [p[1] for p in px]
            if max(xs) - min(xs) < 1.2 and max(ys) - min(ys) < 1.2: continue
            pts = []
            for x, y in px:
                q = (round(x), round(y))
                if not pts or pts[-1] != q: pts.append(q)
            parts.append("M" + "L".join(f"{x},{y}" for x, y in pts) + "Z")
        return "".join(parts)
    border = []
    for e in json.load(open(src))["elements"]:
        if e.get("type") == "relation":
            border += join_rings([[(p["lon"], p["lat"]) for p in m["geometry"]] for m in e.get("members", [])
                                  if m.get("type") == "way" and m.get("role", "outer") == "outer" and m.get("geometry")])
    res = {"W": str(Wpx), "H": str(Hpx), "bbox": [S, N, Wl, El], "out": path([(r, False) for r in border], 0.8), "d": "", "rule": "nonzero"}
    if lakes:
        o, i = water_areas(lakes)
        res["d"] = path([(r, False) for r in o] + [(r, True) for r in i], 0.6, True)
    json.dump(res, open(out, "w"))
    print(f"{len(border)} border rings, outline {len(res['out'])//1000} kB, lakes {len(res['d'])//1000} kB, {Wpx}x{Hpx}px")

if __name__ == "__main__":
    main()
