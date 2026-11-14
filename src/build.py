"""Build ../index.html from the source files in this folder.

Usage:  python3 src/build.py
Data lives in ../data.js (rewritten by the twice-weekly refresh) and ../walks.js;
this script only rebuilds the page itself.
"""
import json, os, sys
here = os.path.dirname(os.path.abspath(__file__)); os.chdir(here)
# one page per city: src/cities/<key>.json. The first city lives at the site root; others under /<path>/.
CITY_KEYS = [k for k in ['bayarea', 'sydney'] if os.path.exists(os.path.join('cities', k + '.json'))]
for CITY_KEY in CITY_KEYS:
    CITYCFG = json.load(open(os.path.join('cities', CITY_KEY + '.json')))
    if CITYCFG['path'] and not os.path.exists(os.path.join('..', CITYCFG['path'], 'data.js')):
        print('skipping', CITY_KEY, '(no data yet)'); continue
    c = json.load(open(CITYCFG['coast']))
    js = (open('app.js').read()
          .replace('/*BBOX*/[0,0,0,0]', json.dumps(c['bbox']))
          .replace('/*W*/0', str(c['W'])).replace('/*H*/0', str(c['H']))
          .replace('"/*COAST*/"', json.dumps(c['d'])))
    head = (open('template_head.html').read()
            .replace('<title>The Bay Area Weekend Fetch</title>', '<title>%s</title>' % CITYCFG['brand'])
            .replace('<h1>The Bay Area <span class="nb">Weekend Fetch</span></h1>', '<h1>%s</h1>' % CITYCFG['h1']))
    city_js = {k: CITYCFG[k] for k in CITYCFG if k not in ('seo',)}
    open('out_index.html', 'w').write(head
        + '<script>window.WF_CITY=' + json.dumps(city_js, ensure_ascii=False) + ';</script>\n'
        + '<script src="./data.js"></script>\n<script src="./walks.js"></script>\n<script>\n' + js + '\n</script>'
        + open('template_tail.html').read())
    OUTFILE = os.path.join('..', CITYCFG['path'], 'index.html') if CITYCFG['path'] else os.path.join('..', 'index.html')
    sys.argv = [sys.argv[0]]
    exec(open('build_gh.py').read())
    os.remove('out_index.html')
