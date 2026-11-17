"""Android launcher icons, splash screens and the Google Play icon from ../../icon.svg ("Sunny weekend").

Usage:  python3 src/tools/make_android_icons.py      (needs playwright + chromium, like the site tests)

Android "adaptive" icons have two layers that phones crop to a circle, squircle or rounded square:
  - background: the blue sky and wave (full bleed)
  - foreground: the calendar card and sun, shrunk to sit inside the 66dp safe circle of the 108dp canvas
"""
import os, re
from playwright.sync_api import sync_playwright

root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
res = os.path.join(root, "android", "app", "src", "main", "res")
svg = open(os.path.join(root, "icon.svg")).read()
inner = svg[svg.index(">", svg.index("<svg")) + 1: svg.rindex("</svg>")]
inner = re.sub(r"<!--.*?-->", "", inner, flags=re.S)
lines = [l for l in inner.strip().split("\n") if l.strip()]
BG = "\n".join(lines[:2])          # sky rect + wave
FG = "\n".join(lines[2:])          # card, pins, text, sun
S = 0.72                           # foreground scale: the card fits the safe circle with a little air
FG_SVG = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><g transform="translate(%g %g) scale(%g)">%s</g></svg>'
          % (256 * (1 - S), 256 * (1 - S) + 8, S, FG))
BG_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">%s</svg>' % BG
FULL = svg
DENS = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}

def shot(page, markup, w, h, out, radius=None, bg="transparent"):
    clip = ""
    if radius == "round": clip = "border-radius:50%;"
    elif radius: clip = "border-radius:%dpx;" % radius
    page.set_viewport_size({"width": w, "height": h})
    page.set_content('<html><body style="margin:0;background:%s"><div style="width:%dpx;height:%dpx;overflow:hidden;%s">%s</div></body></html>'
                     % (bg, w, h, clip, markup.replace("<svg ", '<svg width="100%" height="100%" ', 1)))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    page.screenshot(path=out, omit_background=True, clip={"x": 0, "y": 0, "width": w, "height": h})

def splash(page, w, h, out):
    k = min(w, h) * 0.42
    page.set_viewport_size({"width": w, "height": h})
    page.set_content('<html><body style="margin:0;background:#2F5D8A;display:grid;place-items:center;height:%dpx">'
                     '<div style="width:%dpx;height:%dpx">%s</div></body></html>' % (h, k, k, FG_SVG.replace("<svg ", '<svg width="100%" height="100%" ', 1)))
    page.screenshot(path=out, clip={"x": 0, "y": 0, "width": w, "height": h})

with sync_playwright() as p:
    b = p.chromium.launch(); page = b.new_page()
    for d, m in DENS.items():
        a = round(108 * m); l = round(48 * m)
        shot(page, FG_SVG, a, a, os.path.join(res, "mipmap-" + d, "ic_launcher_foreground.png"))
        shot(page, BG_SVG, a, a, os.path.join(res, "mipmap-" + d, "ic_launcher_background.png"))
        shot(page, FULL, l, l, os.path.join(res, "mipmap-" + d, "ic_launcher.png"), radius=round(l * 0.18))
        shot(page, FULL, l, l, os.path.join(res, "mipmap-" + d, "ic_launcher_round.png"), radius="round")
    # splash screens Capacitor ships (shown briefly on older Android; Android 12+ shows the icon on blue)
    for f in os.listdir(res):
        sp = os.path.join(res, f, "splash.png")
        if f.startswith("drawable") and os.path.exists(sp):
            from struct import unpack
            with open(sp, "rb") as fh: fh.seek(16); w, h = unpack(">II", fh.read(8))
            splash(page, w, h, sp)
    # Google Play store icon: 512x512, full bleed (Play rounds the corners itself)
    shot(page, FULL, 512, 512, os.path.join(root, "play-store", "icon-512.png"))
    b.close()

# adaptive icon: both layers are images
for n in ("ic_launcher.xml", "ic_launcher_round.xml"):
    open(os.path.join(res, "mipmap-anydpi-v26", n), "w").write('''<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
''')
open(os.path.join(res, "values", "ic_launcher_background.xml"), "w").write('''<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#2F5D8A</color>
</resources>
''')
print("android icons ok")
