"""Build ../index.html from the source files in this folder.

Usage:  python3 src/build.py
Data lives in ../data.js (rewritten by the twice-weekly refresh) and ../walks.js;
this script only rebuilds the page itself.
"""
import json, os, sys
here = os.path.dirname(os.path.abspath(__file__)); os.chdir(here)
c = json.load(open('coast.json'))
js = (open('app.js').read()
      .replace('/*BBOX*/[0,0,0,0]', json.dumps(c['bbox']))
      .replace('/*W*/0', str(c['W'])).replace('/*H*/0', str(c['H']))
      .replace('"/*COAST*/"', json.dumps(c['d'])))
open('out_index.html', 'w').write(open('template_head.html').read()
    + '<script src="./data.js"></script>\n<script src="./walks.js"></script>\n<script>\n' + js + '\n</script>'
    + open('template_tail.html').read())
sys.argv = [sys.argv[0]]
import os as _os
exec(open('build_gh.py').read())
_os.remove('out_index.html')
