#!/usr/bin/env python3
"""Make a city's map coastline (the water shape drawn on the Map tab) from OpenStreetMap coastline data.

  1. Download coastline ways a little beyond the map box (public OpenStreetMap data, via any Overpass server):
       [out:json][timeout:240];way["natural"="coastline"](S-0.1,W-0.1,N+0.1,E+0.1);out geom;
  2. Optionally download harbours/rivers/lagoons that OpenStreetMap maps as water areas instead of coastline
     (Sydney Harbour is one: the coastline crosses its entrance):  rel(id:...);out geom;
  3. python3 src/tools/make_coast.py osm.json S N W E out.json [width_px] [water.json]

Writes {"W","H","d","bbox"} like src/coast.json: d is an SVG path of the water (sea, harbours, bays), drawn with
fill-rule evenodd, in pixels of a W x H map (equirectangular, x scaled by cos(mid latitude)).
Pure Python (no geometry libraries). OpenStreetMap coastlines have land on the left and water on the right.
"""
import json, math, sys

def load_ways(path):
    els = json.load(open(path))["elements"]
    ways = []
    for e in els:
        g = e.get("geometry")
        if e.get("type") == "way" and g and len(g) >= 2:
            ways.append([(p["lon"], p["lat"]) for p in g])
    return ways

def chain(ways):
    """Join ways end to start into longer lines (closed loops for islands)."""
    by_start = {}
    for i, w in enumerate(ways): by_start.setdefault(w[0], []).append(i)
    used = [False] * len(ways); out = []
    for i in range(len(ways)):
        if used[i]: continue
        # walk backwards to the true start of this chain
        line = list(ways[i]); used[i] = True
        while True:   # extend forward
            nxt = [j for j in by_start.get(line[-1], []) if not used[j]]
            if not nxt or line[-1] == line[0]: break
            j = nxt[0]; used[j] = True; line += ways[j][1:]
        out.append(line)
    # merge chains whose end meets another chain's start (forward pass may have started mid-chain)
    changed = True
    while changed:
        changed = False
        starts = {c[0]: k for k, c in enumerate(out) if c[0] != c[-1]}
        for k, c in enumerate(out):
            if c is None or c[0] == c[-1]: continue
            m = starts.get(c[-1])
            if m is not None and m != k and out[m] is not None:
                out[k] = c + out[m][1:]; out[m] = None; changed = True; break
        out = [c for c in out if c is not None]
    return out

def clip_line(line, box):
    """Split a line into pieces inside box (Liang–Barsky per segment). Returns list of (points, enters_from_edge, exits_to_edge)."""
    W, S, E, N = box
    inside = lambda p: W <= p[0] <= E and S <= p[1] <= N
    def clip_seg(a, b):
        x0, y0 = a; dx, dy = b[0] - x0, b[1] - y0
        t0, t1 = 0.0, 1.0
        for p, q in ((-dx, x0 - W), (dx, E - x0), (-dy, y0 - S), (dy, N - y0)):
            if p == 0:
                if q < 0: return None
            else:
                r = q / p
                if p < 0:
                    if r > t1: return None
                    t0 = max(t0, r)
                else:
                    if r < t0: return None
                    t1 = min(t1, r)
        return (x0 + t0 * dx, y0 + t0 * dy), (x0 + t1 * dx, y0 + t1 * dy), t0 > 0, t1 < 1
    pieces, cur = [], None
    for a, b in zip(line, line[1:]):
        c = clip_seg(a, b)
        if c is None:
            if cur: pieces.append(cur); cur = None
            continue
        p0, p1, cut_in, cut_out = c
        if cur is None or cut_in:
            if cur: pieces.append(cur)
            cur = {"pts": [p0], "start_edge": cut_in or not inside(a)}
        cur["pts"].append(p1)
        if cut_out:
            cur["end_edge"] = True; pieces.append(cur); cur = None
    if cur: pieces.append(cur)
    for pc in pieces: pc.setdefault("end_edge", False)
    return pieces

def perim(p, box):
    """Position along the box boundary going clockwise (y up) from the top-left corner."""
    W, S, E, N = box; w, h = E - W, N - S; x, y = p
    eps = 1e-9
    if abs(y - N) < eps: return x - W                      # top, left → right
    if abs(x - E) < eps: return w + (N - y)                # right, top → bottom
    if abs(y - S) < eps: return w + h + (E - x)            # bottom, right → left
    return 2 * w + h + (y - S)                             # left, bottom → top

def corner_path(a, b, box):
    """Box corners passed when walking clockwise from perimeter position a to b."""
    W, S, E, N = box; w, h = E - W, N - S; L = 2 * (w + h)
    corners = [(w, (E, N)), (w + h, (E, S)), (2 * w + h, (W, S)), (L, (W, N))]
    out = []; t = a
    d = (b - a) % L
    for k in range(2):   # corners may wrap past the start once
        for pos, c in corners:
            pp = pos + k * L
            if a < pp < a + d: out.append((pp, c))
    return [c for _, c in sorted(out)]

def water_rings(chains, box):
    W, S, E, N = box; L = 2 * ((E - W) + (N - S))
    rings, open_pieces = [], []
    for c in chains:
        if c[0] == c[-1] and all(W <= x <= E and S <= y <= N for x, y in c):
            rings.append(c); continue                      # island (land) inside: a hole in the water with evenodd
        for pc in clip_line(c, box):
            if pc["start_edge"] and pc["end_edge"]: open_pieces.append(pc["pts"])
            elif len(pc["pts"]) > 2 and pc["pts"][0] == pc["pts"][-1]: rings.append(pc["pts"])
    # water is on the right of each piece: after leaving the box, go clockwise along the edge to the next piece's start
    starts = [(perim(p[0], box), i) for i, p in enumerate(open_pieces)]
    used = set()
    for i0 in range(len(open_pieces)):
        if i0 in used: continue
        ring, i = [], i0
        while True:
            used.add(i); pts = open_pieces[i]; ring += pts
            ex = perim(pts[-1], box)
            nxt = min(starts, key=lambda s: (s[0] - ex) % L if (s[0] - ex) % L > 1e-12 else L)
            ring += corner_path(ex, nxt[0], box)
            i = nxt[1]
            if i == i0 or i in used: break
        rings.append(ring)
    return rings

def join_rings(ways):
    """Join multipolygon member ways (any direction) into closed rings."""
    ways = [list(w) for w in ways if len(w) >= 2]; rings = []
    while ways:
        r = ways.pop(0)
        while r[0] != r[-1]:
            for k, w in enumerate(ways):
                if w[0] == r[-1]: r += w[1:]; ways.pop(k); break
                if w[-1] == r[-1]: r += w[::-1][1:]; ways.pop(k); break
            else: break
        if r[0] == r[-1] and len(r) >= 4: rings.append(r)
    return rings

def water_areas(path):
    """(outer rings, inner rings) of natural=water relations, plus lakes mapped as single closed ways."""
    outer, inner = [], []
    raw = json.load(open(path))
    for f in raw.get("features", []):   # GeoJSON lakes (e.g. from Nominatim)
        g = f["geometry"]; polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"] if g["type"] == "MultiPolygon" else []
        for poly in polys:
            outer.append([tuple(p) for p in poly[0]]); inner += [[tuple(p) for p in r] for r in poly[1:]]
    for e in raw.get("elements", []):
        g = e.get("geometry")
        if e.get("type") == "way" and g and len(g) >= 4 and g[0] == g[-1]:
            outer.append([(p["lon"], p["lat"]) for p in g]); continue
        if e.get("type") != "relation": continue
        for role, bucket in (("outer", outer), ("inner", inner)):
            ws = [[(p["lon"], p["lat"]) for p in m["geometry"]] for m in e.get("members", []) if m.get("type") == "way" and m.get("role", "outer") == role and m.get("geometry")]
            bucket += join_rings(ws)
    return outer, inner

def area(px):
    return sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(px, px[1:] + px[:1])) / 2

def simplify(pts, tol):
    if len(pts) < 3: return pts
    keep = [False] * len(pts); keep[0] = keep[-1] = True; stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop(); (x1, y1), (x2, y2) = pts[a], pts[b]; dx, dy = x2 - x1, y2 - y1; n = math.hypot(dx, dy) or 1e-9
        best, bi = 0, None
        for k in range(a + 1, b):
            x, y = pts[k]
            d = abs(dy * x - dx * y + x2 * y1 - y2 * x1) / n if (dx or dy) else math.hypot(x - x1, y - y1)   # closed ring: distance from its start
            if d > best: best, bi = d, k
        if bi is not None and best > tol: keep[bi] = True; stack += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]

def main():
    src, S, N, Wl, El, out = sys.argv[1], *map(float, sys.argv[2:6]), sys.argv[6]
    Wpx = int(sys.argv[7]) if len(sys.argv) > 7 else 1000
    box = (Wl, S, El, N)
    kx = math.cos(math.radians((S + N) / 2))
    Hpx = round(Wpx * (N - S) / ((El - Wl) * kx))
    chains = chain(load_ways(src))
    rings = water_rings(chains, box)
    # with extra water areas, fill with nonzero winding: water rings one way, islands/holes the other (overlaps stay water)
    holes = [r for r in rings if r[0] == r[-1] and any(r == c for c in chains)]      # coastline islands
    waters = [(r, False) for r in rings if not any(r is h for h in holes)] + [(h, True) for h in holes]
    water_file = sys.argv[8] if len(sys.argv) > 8 else None
    if water_file:
        o, i = water_areas(water_file)
        waters += [(r, False) for r in o] + [(r, True) for r in i]
    proj = lambda p: ((p[0] - Wl) / (El - Wl) * Wpx, (N - p[1]) / (N - S) * Hpx)
    parts = []
    for r, is_hole in waters:
        px = simplify([proj(p) for p in r], 0.6)
        if len(px) >= 3 and (area(px) < 0) != is_hole: px = px[::-1]      # water: positive area; holes: negative
        if len(px) < 3: continue
        xs = [p[0] for p in px]; ys = [p[1] for p in px]
        if max(xs) - min(xs) < 1.2 and max(ys) - min(ys) < 1.2: continue   # specks
        pts = []
        for x, y in px:
            q = (round(x), round(y))
            if not pts or pts[-1] != q: pts.append(q)
        parts.append("M" + "L".join(f"{x},{y}" for x, y in pts) + "Z")
    res = {"W": str(Wpx), "H": str(Hpx), "d": "".join(parts), "bbox": [S, N, Wl, El]}
    if water_file: res["rule"] = "nonzero"
    json.dump(res, open(out, "w"))
    print(f"{len(rings)} rings, {len(parts)} drawn, {Wpx}x{Hpx}px, {sum(len(p) for p in parts)//1000} kB path")

if __name__ == "__main__":
    main()
