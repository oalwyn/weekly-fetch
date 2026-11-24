#!/usr/bin/env python3
"""Check a city's data files before saving (used by every refresh run; see src/refresh/method.md).

  python3 src/tools/check_data.py <city key>        e.g. seattle, la, montana, london, sydney, bayarea

Checks <path>/data.js: unique ids with the city's prefix, coordinates inside the map box, prices, categories, golf
levels; and walks.js / rainy.js / dates.js when present. Prints counts by category and region. Exit 1 on a problem.
"""
import json, os, re, sys, datetime
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CATS = ['hol', 'mkt', 'dog', 'food', 'art', 'show', 'sport', 'golf', 'film', 'kids', 'teen', 'prog', 'join', 'vol', 'cult', 'learn', 'fmd', 'evt']

def load(path, var):
    s = open(path, encoding='utf-8').read()
    m = re.search(r'window\.' + var + r'\s*=\s*', s)
    if not m: raise SystemExit(f'{path}: no window.{var} = ...')
    return json.loads(s[m.end():].strip().rstrip(';'))

def main():
    key = sys.argv[1]
    city = json.load(open(os.path.join(ROOT, 'src', 'cities', key + '.json')))
    base = os.path.join(ROOT, city['path']) if city['path'] else ROOT
    pre = city.get('prefix', '')
    coast = os.path.join(ROOT, 'src', city['coast'])
    S, N, W, E = json.load(open(coast))['bbox'] if os.path.exists(coast) else city['map_bbox']
    probs, warns = [], []
    d = load(os.path.join(base, 'data.js'), 'WF_DATA'); items = d['items']
    ids = [e.get('id', '') for e in items]
    dup = {i for i in ids if ids.count(i) > 1}
    if dup: probs.append('duplicate ids: ' + ', '.join(sorted(dup)[:5]))
    if pre: probs += [f'id without prefix {pre}: {i}' for i in ids if not i.startswith(pre)][:5]
    probs += [f'bad id characters: {i}' for i in ids if not re.match(r'^[a-z0-9][a-z0-9-]*$', i)][:5]
    for e in items:
        i = e.get('id')
        if e.get('cat') not in CATS: probs.append(f'{i}: bad cat {e.get("cat")}')
        if e.get('price') and e['price'] not in ('free', 'tickets'): probs.append(f'{i}: bad price {e["price"]}')
        if e.get('lat') is not None and not (S <= e['lat'] <= N and W <= e['lon'] <= E): probs.append(f'{i}: outside the map box')
        if e.get('cat') == 'golf' and e.get('lvl') not in ('pro', 'amateur', 'community'): probs.append(f'{i}: golf needs lvl pro/amateur/community')
        if e.get('cat') == 'prog' and not e.get('deadline'): warns.append(f'{i}: prog without a deadline')
        if not e.get('title') or not e.get('meta'): probs.append(f'{i}: needs title and meta')
        if e.get('cat') not in ('prog', 'film') and not (e.get('start') or e.get('dates') or e.get('days') or e.get('tbc')):
            (warns if e.get('sec') in ('dog', 'food', 'radar') else probs).append(f'{i}: no dates')
    if not d.get('updated'): probs.append('no "updated"')
    for f, var in (('walks.js', 'WF_WALKS'), ('rainy.js', 'WF_RAINY'), ('dates.js', 'WF_DATES')):
        p = os.path.join(base, f)
        if os.path.exists(p):
            x = load(p, var); xs = x.get('items', [])
            xi = [y.get('id') for y in xs]
            if len(set(xi)) != len(xi): probs.append(f'{f}: duplicate ids')
            probs += [f'{f} {y.get("id")}: outside the map box' for y in xs if y.get('lat') is not None and not (S <= y['lat'] <= N and W <= y['lon'] <= E)][:5]
            print(f'{f}: {len(xs)} items')
        elif city['path']:
            print(f'{f}: missing (a new city needs it before going live)')
    cats = {}; regs = {}
    for e in items:
        cats[e['cat']] = cats.get(e['cat'], 0) + 1
        if e.get('lat') is not None:
            for r in city['regions']:
                k, lo, hi, w, ea = (r + [None] * 5)[:5]
                if (lo is None or e['lat'] >= lo) and (hi is None or e['lat'] < hi) and (w is None or e['lon'] > w) and (ea is None or e['lon'] < ea):
                    regs[k] = regs.get(k, 0) + 1; break
    dated = [e for e in items if e.get('cat') != 'prog']
    print(f'{len(items)} items · deep_through {d.get("deep_through", "-")}')
    print('categories:', json.dumps(dict(sorted(cats.items(), key=lambda x: -x[1]))))
    print('regions:', json.dumps(dict(sorted(regs.items(), key=lambda x: -x[1]))))
    print(f'free {sum(e.get("price") == "free" for e in dated)}/{len(dated)} · local {sum(bool(e.get("local")) for e in items)} · aud {sum(bool(e.get("aud")) for e in items)} · fd {sum(bool(e.get("fd")) for e in items)} · golf {cats.get("golf", 0)}')
    if warns: print('warnings (standing items, fine):', '; '.join(warns[:6]))
    if probs:
        print('PROBLEMS:'); [print(' -', p) for p in probs[:40]]; sys.exit(1)
    print('OK')

if __name__ == '__main__':
    main()
