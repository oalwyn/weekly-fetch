#!/usr/bin/env python3
"""Event pages for shared links (sharing, phase 2).

Writes e/<event id>/index.html for every event in data.js, sydney/data.js and london/data.js. Each page is tiny:
- link-preview tags (title, date, place, price, the city's preview picture) so Messages, WhatsApp, Facebook and others
  show the event, not just the city;
- it forwards the visitor straight on to the city page with that event pinned (<city>/?e=<id>), keeping any share code;
- noindex, so search engines keep sending people to the city pages instead.

Pages for events that drop out of the list are left in place, so old links still work (the city page then says the event
has finished and suggests others). Run by .github/workflows/event-pages.yml after every refresh, or by hand:
    python3 src/tools/event_pages.py
"""
import html, json, os, re, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SITE = 'https://theweekendfetch.com'
OK_ID = re.compile(r'^[a-z0-9][a-z0-9-]{1,99}$')
FREE_SEG = re.compile(r'^(free|free entry|free admission|free event|free, .*)$', re.I)


def load(path, var):
    s = open(path, encoding='utf-8').read()
    s = s[s.index('=') + 1:].strip().rstrip(';')
    return json.loads(s)


def page(e, city):
    esc = lambda t: html.escape(str(t or ''), quote=True)
    url = '/' + (city['path'] + '/' if city['path'] else '')
    segs = [x.strip() for x in str(e.get('meta') or '').split(' · ') if x.strip()]
    place = segs[0] if segs else ''
    price = 'Free' if e.get('price') == 'free' else ('Tickets needed' if e.get('price') == 'tickets' else '')
    desc = ' · '.join(x for x in [e.get('when'), place, price] if x)
    target = url + '?e=' + e['id']
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(e.get('title'))} · {esc(city['brand'])}</title>
<meta name="robots" content="noindex">
<meta name="description" content="{esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{esc(city['brand'])}">
<meta property="og:title" content="{esc(e.get('title'))}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{SITE}/e/{e['id']}/">
<meta property="og:image" content="{SITE}/og-{city['key']}.png">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{esc(city['brand'])}">
<meta name="twitter:card" content="summary_large_image">
<link rel="canonical" href="{SITE}{target}">
<script>location.replace({json.dumps(target)} + (location.search ? "&" + location.search.slice(1) : ""));</script>
<style>body{{margin:0;font-family:Inter,system-ui,-apple-system,sans-serif;background:#EEF2F5;color:#1F2A37}}main{{max-width:560px;margin:0 auto;padding:40px 20px}}a{{color:#2F5D8A;font-weight:700}}p.b{{color:#5B6B7B;font-size:14px}}</style>
</head><body><main><p class="b">{esc(city['brand'])}</p><h1>{esc(e.get('title'))}</h1><p>{esc(desc)}</p>
<p><a href="{esc(target)}">See it on The Weekend Fetch</a></p></main></body></html>
'''


def main():
    n = skipped = 0
    for key in ['bayarea', 'sydney', 'london']:
        city = json.load(open(os.path.join(ROOT, 'src', 'cities', key + '.json'), encoding='utf-8'))
        data = os.path.join(ROOT, city['path'], 'data.js') if city['path'] else os.path.join(ROOT, 'data.js')
        if not os.path.exists(data):
            continue
        for e in load(data, 'WF_DATA')['items']:
            if not OK_ID.match(str(e.get('id') or '')):
                skipped += 1
                continue
            d = os.path.join(ROOT, 'e', e['id'])
            os.makedirs(d, exist_ok=True)
            out = page(e, city)
            f = os.path.join(d, 'index.html')
            if not os.path.exists(f) or open(f, encoding='utf-8').read() != out:
                open(f, 'w', encoding='utf-8').write(out)
            n += 1
    print(f'event pages: {n} current' + (f', {skipped} skipped (id not url-safe)' if skipped else ''))


if __name__ == '__main__':
    sys.exit(main())
