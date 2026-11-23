"""Build ../index.html from the source files in this folder.

Usage:  python3 src/build.py
Data lives in ../data.js (rewritten by the twice-weekly refresh) and ../walks.js;
this script only rebuilds the page itself.
"""
import json, os, sys
here = os.path.dirname(os.path.abspath(__file__)); os.chdir(here)
# one page per city: src/cities/<key>.json. The first city lives at the site root; others under /<path>/.
CITY_KEYS = [k for k in ['bayarea', 'sydney', 'london'] if os.path.exists(os.path.join('cities', k + '.json'))]
# every city that has a page, for the city switch in the header
CITIES = []
for k in CITY_KEYS:
    cc = json.load(open(os.path.join('cities', k + '.json')))
    if not cc['path'] or os.path.exists(os.path.join('..', cc['path'], 'data.js')):
        CITIES.append({'key': k, 'short': cc['short'], 'near': cc.get('near', cc['short']), 'brand': cc['brand'], 'url': '/' + (cc['path'] + '/' if cc['path'] else ''), 'tz': cc['tz'], 'banner': cc.get('banner', 'banner.svg')})
_pin = json.load(open(os.path.join('icons', 'paths.json')))['location-pin-7648253']
PIN_SVG = '<svg class="ico" viewBox="%s" aria-hidden="true">%s</svg>' % (_pin['vb'], ''.join('<path fill="currentColor" d="%s"/>' % d for d in _pin['d']))
def city_switch(cfg):
    """Header city switch, the city-suggestion script and (site root only) the remembered-city redirect.
    Wrapped in <!--citysw--> so build_app.py can leave it out of the Bay Area-only iPhone app."""
    # three (or more) city circles, each showing a crop of that city's header art; tapping one opens that city's page
    links = ''.join('<a class="cityc" href="%s" data-city="%s"%s aria-label="%s"><span class="cdot" style="background-image:url(/%s)"></span><span class="cname">%s</span></a>' % (c['url'], c['key'], ' aria-current="page"' if c['key'] == cfg['key'] else '', c['brand'], c['banner'], c['short']) for c in CITIES)
    sw = '<!--citysw--><nav class="citysw" id="citySw" aria-label="Cities">%s</nav><!--/citysw-->\n  ' % links
    js = ('<!--citysw--><script>window.WF_CITIES=' + json.dumps(CITIES, ensure_ascii=False) + ';' + open('city_switch.js').read() + '</script><!--/citysw-->\n')
    redirect = ''
    if not cfg['path']:
        m = {c['key']: c['url'] for c in CITIES if c['url'] != '/'}
        redirect = ('<!--citysw--><script>try{var wfc=localStorage.getItem("wf-city"),wfm=%s;if(wfc&&wfm[wfc]&&!location.hash&&!location.search)location.replace(wfm[wfc])}catch(e){}</script><!--/citysw-->\n' % json.dumps(m))
    return sw, js, redirect
for CITY_KEY in CITY_KEYS:
    CITYCFG = json.load(open(os.path.join('cities', CITY_KEY + '.json')))
    if CITYCFG['path'] and not os.path.exists(os.path.join('..', CITYCFG['path'], 'data.js')):
        print('skipping', CITY_KEY, '(no data yet)'); continue
    c = json.load(open(CITYCFG['coast']))
    ICONS = json.load(open(os.path.join('icons', 'paths.json')))
    js = (open('app.js').read().replace('/*ICONS*/{}', json.dumps(ICONS, separators=(',', ':')))
          .replace('/*BBOX*/[0,0,0,0]', json.dumps(c['bbox']))
          .replace('/*W*/0', str(c['W'])).replace('/*H*/0', str(c['H']))
          .replace('"/*COAST*/"', json.dumps(c['d'])).replace('"/*RULE*/"', json.dumps(c.get('rule', 'evenodd'))))
    head = (open('template_head.html').read()
            .replace('<title>The Bay Area Weekend Fetch</title>', '<title>%s</title>' % CITYCFG['brand'])
            .replace('<h1>The Bay Area <span class="nb">Weekend Fetch</span></h1>', '<h1>%s</h1>' % CITYCFG['h1']))
    SW_HTML, SW_JS, SW_REDIRECT = city_switch(CITYCFG)
    head = head.replace('<head>', '<head>\n' + SW_REDIRECT, 1).replace('<header id="hdr">\n  ', '<header id="hdr">\n  ' + SW_HTML, 1)
    city_js = {k: CITYCFG[k] for k in CITYCFG if k not in ('seo',)}
    open('out_index.html', 'w').write(head
        + '<script>window.WF_CITY=' + json.dumps(city_js, ensure_ascii=False) + ';</script>\n'
        + SW_JS
        + '<script src="./data.js"></script>\n<script src="./walks.js"></script>\n<script src="./rainy.js"></script>\n<script src="./dates.js"></script>\n<script>\n' + js + '\n</script>'
        + open('template_tail.html').read())
    OUTFILE = os.path.join('..', CITYCFG['path'], 'index.html') if CITYCFG['path'] else os.path.join('..', 'index.html')
    sys.argv = [sys.argv[0]]
    exec(open('build_gh.py').read())
    os.remove('out_index.html')
