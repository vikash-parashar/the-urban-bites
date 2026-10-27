"""Builds the animated order-status scenes from the anime Manjeet images.

Inputs:  web/public/media/chars/manjeet-*.png (AI images, 1200x896)
Outputs: web/public/media/chars/scene/*.webp|png  (moving parts cut out, holes filled)
         web/src/scenes.gen.ts                    (one SVG string per status, __B__ = asset base)
Run:     python scripts/build_scenes.py   (needs opencv-python-headless, pillow)
"""
import json, os
import cv2, numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'web/public/media/chars')
OUT = os.path.join(SRC, 'scene')
os.makedirs(OUT, exist_ok=True)
R = 'repeatCount="indefinite"'
INK = '#1d1a16'


def load(name):
    return Image.open(os.path.join(SRC, f'manjeet-{name}.png')).convert('RGB')


def cutout(im, polys, grow=9, plate_grow=7, radius=9):
    """Cut polygons out as an RGBA layer and return (layer, bbox, plate with the hole filled)."""
    W, H = im.size
    m = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(m)
    for p in polys:
        d.polygon(p, fill=255)
    m = cv2.dilate(np.array(m), np.ones((grow, grow), np.uint8))
    soft = Image.fromarray(m).filter(ImageFilter.GaussianBlur(1.5))
    layer = im.copy()
    layer.putalpha(soft)
    bbox = Image.fromarray(m).getbbox()
    pm = cv2.dilate(m, np.ones((plate_grow, plate_grow), np.uint8))
    plate = cv2.inpaint(cv2.cvtColor(np.array(im), cv2.COLOR_RGB2BGR), pm, radius, cv2.INPAINT_TELEA)
    return layer.crop(bbox), bbox, Image.fromarray(cv2.cvtColor(plate, cv2.COLOR_BGR2RGB))


def save(img, name, q=80):
    path = os.path.join(OUT, name)
    if name.endswith('.webp'):
        img.save(path, quality=q, method=6, alpha_quality=90)
    else:
        img.save(path, optimize=True)
    return name


def img(name, x=0, y=0, w=1200, h=896):
    return f'<image href="__B__{name}" x="{x}" y="{y}" width="{w}" height="{h}"/>'


def lid(cx, top, rx, ry, rot, skin, dur=4.6, delay=0):
    return f'''<g transform="translate({cx} {top}) rotate({rot})"><g><animateTransform attributeName="transform" type="scale" values="1 0.01;1 0.01;1 1;1 0.01" keyTimes="0;0.93;0.965;1" dur="{dur}s" begin="-{delay}s" {R}/>
<ellipse cx="0" cy="{ry}" rx="{rx}" ry="{ry}" fill="{skin}"/><path d="M-{rx} {ry} Q0 {ry * 2.1:.1f} {rx} {ry}" stroke="#2a120a" stroke-width="3" fill="none"/></g></g>'''


def bubble(x, y, text, w, timing=''):
    return f'''<g{' opacity="0"' if timing else ''}>{timing}<rect x="{x}" y="{y}" width="{w}" height="84" rx="42" fill="#fff" stroke="{INK}" stroke-width="5"/>
<text x="{x + w / 2}" y="{y + 56}" text-anchor="middle" font-family="Baloo 2, system-ui, sans-serif" font-weight="800" font-size="44" fill="{INK}">{text}</text></g>'''


def flames():
    out = []
    for i, x in enumerate(range(352, 548, 28)):
        h = 34 + ((i * 17) % 5) * 7
        d = 0.38 + (i % 3) * 0.09
        out.append(f'''<g transform="translate({x} 836)"><g><animateTransform attributeName="transform" type="scale" values="1 1;0.85 1.3;1.08 0.86;0.92 1.18;1 1" dur="{d:.2f}s" begin="-{i * 0.13:.2f}s" {R}/>
<path d="M0 0 C-13 -{h * 0.3:.0f} -7 -{h * 0.7:.0f} 0 -{h} C7 -{h * 0.7:.0f} 13 -{h * 0.3:.0f} 0 0Z" fill="url(#fl)"/><path d="M0 -2 C-6 -{h * 0.25:.0f} -3 -{h * 0.5:.0f} 0 -{h * 0.62:.0f} C3 -{h * 0.5:.0f} 6 -{h * 0.25:.0f} 0 -2Z" fill="#fff3a0"/></g></g>''')
    sparks = ''.join(f'''<circle r="{2 + i % 2}" fill="#ffcf5a"><animateMotion path="M{360 + i * 30} 820 q{(-1) ** i * 14} -50 {(-1) ** i * 6} -110" dur="{1.4 + i % 3 * 0.3:.1f}s" begin="-{i * 0.37:.2f}s" {R}/><animate attributeName="opacity" values="0;1;0" dur="{1.4 + i % 3 * 0.3:.1f}s" begin="-{i * 0.37:.2f}s" {R}/></circle>''' for i in range(7))
    glow = f'<ellipse cx="447" cy="820" rx="170" ry="46" fill="url(#glow)"><animate attributeName="opacity" values="0.7;1;0.6;0.9;0.7" dur="1.3s" {R}/></ellipse>'
    return glow + ''.join(out) + sparks


def steam(x0=350, y0=650, n=4, gap=42):
    return ''.join(f'''<path d="M{x0 + i * gap} {y0} q-22 -50 0 -100 q22 -50 0 -100 q-22 -50 0 -100" stroke="#fff" stroke-width="{16 + i % 2 * 6}" fill="none" stroke-linecap="round" filter="url(#soft)" opacity="0">
<animate attributeName="opacity" values="0;0.55;0" dur="4s" begin="-{i}s" {R}/><animateTransform attributeName="transform" type="translate" values="0 30;{(-1) ** i * 12} -90" dur="4s" begin="-{i}s" {R}/></path>''' for i in range(n))


def bubbles_food():
    pts = [(330, 690), (372, 684), (415, 694), (470, 688), (530, 686), (575, 692), (395, 700), (505, 698), (560, 684)]
    return ''.join(f'<circle cx="{x}" cy="{y}" r="0" fill="#f0c58e" stroke="#7a3e17" stroke-width="2"><animate attributeName="r" values="0;7;8;0" keyTimes="0;0.5;0.7;1" dur="{1.1 + i % 3 * 0.35:.2f}s" begin="-{i * 0.31:.2f}s" {R}/></circle>' for i, (x, y) in enumerate(pts))


DEFS = '''<defs>
<linearGradient id="fl" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff5a1a"/><stop offset="0.6" stop-color="#ff9a1f"/><stop offset="1" stop-color="#ffd23f" stop-opacity="0.2"/></linearGradient>
<radialGradient id="glow"><stop offset="0" stop-color="#ff8a1f" stop-opacity="0.55"/><stop offset="1" stop-color="#ff8a1f" stop-opacity="0"/></radialGradient>
<filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"/></filter>
<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfeaff"/><stop offset="1" stop-color="#fff4d8"/></linearGradient>
</defs>'''


def push(inner, dur=12):
    return f'<g><animateTransform attributeName="transform" type="scale" values="1;1.035;1" dur="{dur}s" {R}/>{inner}</g>'


scenes = {}

# ---- cooking (timer set) ----
cook = load('cooking')
arm_poly = [(672, 402), (640, 428), (565, 450), (535, 466), (503, 490), (505, 512), (508, 545), (510, 577), (526, 580), (540, 566), (550, 557), (590, 532), (594, 497), (640, 508), (682, 506), (733, 466), (752, 432), (735, 410)]
spat_poly = [(550, 518), (560, 528), (525, 580), (519, 640), (520, 682), (497, 706), (445, 684), (452, 652), (505, 612), (522, 572)]
a_layer, a_box, a_plate = cutout(cook, [arm_poly, spat_poly], grow=11, plate_grow=9, radius=11)
save(a_plate, 'cook-plate.webp')
save(a_layer, 'cook-arm.webp')
ax, ay, aw, ah = a_box[0], a_box[1], a_box[2] - a_box[0], a_box[3] - a_box[1]


def stir(dur=1.3):
    return f'''<g><animateTransform attributeName="transform" type="rotate" values="-3 705 440;3.5 705 440;-3 705 440" keyTimes="0;0.5;1" calcMode="spline" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" dur="{dur}s" {R}/>{img('cook-arm.webp', ax, ay, aw, ah)}</g>'''


cook_lids = lid(777, 169, 14, 6.5, 0, '#b4643f') + lid(835, 158, 15.5, 7, -6, '#a65d3f')
scenes['cooking'] = push(img('cook-plate.webp') + flames() + bubbles_food() + stir() + steam() + cook_lids
                         + bubble(40, 40, 'Masala bhun raha sai! 🔥', 520))

# ---- hold (busy, please wait) ----
clock = f'''<g transform="translate(1060 150)"><circle r="92" fill="#fff" stroke="{INK}" stroke-width="7"/>
{''.join(f'<line x1="0" y1="-78" x2="0" y2="-64" stroke="{INK}" stroke-width="7" transform="rotate({r})"/>' for r in range(0, 360, 90))}
<line x1="0" y1="0" x2="0" y2="-44" stroke="{INK}" stroke-width="10" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" values="0;360" dur="24s" {R}/></line>
<line x1="0" y1="0" x2="0" y2="-68" stroke="#ff4f9a" stroke-width="7" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" values="0;360" dur="2s" {R}/></line>
<circle r="9" fill="{INK}"/></g>'''
scenes['hold'] = push(img('cook-plate.webp') + flames() + bubbles_food() + stir(2.6) + steam() + cook_lids + clock
                      + bubble(40, 40, 'Thoda sabar ji, rush sai ☕', 560))

# ---- placed (writing the order) ----
pl = load('placed')
hand_poly = [(635, 352), (656, 348), (690, 418), (714, 424), (712, 446), (690, 457), (655, 462), (622, 442), (612, 420), (628, 404)]
h_layer, h_box, h_plate = cutout(pl, [hand_poly], grow=9, plate_grow=7)
save(h_plate, 'placed-plate.webp')
save(h_layer, 'placed-hand.webp')
hx, hy, hw, hh = h_box[0], h_box[1], h_box[2] - h_box[0], h_box[3] - h_box[1]
scribble = f'''<g><animateTransform attributeName="transform" type="translate" values="0 0;-5 2;2 4;-4 1;3 3;0 0" dur="0.9s" {R}/>{img('placed-hand.webp', hx, hy, hw, hh)}</g>'''
chips = ''.join(f'''<!--chip{i}--><g opacity="0"><animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;{0.12 + i * 0.16:.2f};{0.2 + i * 0.16:.2f};0.92;1" dur="5s" {R}/>
<animateTransform attributeName="transform" type="translate" values="0 18;0 18;0 0;0 0;0 0" keyTimes="0;{0.12 + i * 0.16:.2f};{0.2 + i * 0.16:.2f};0.92;1" dur="5s" {R}/>
<rect x="60" y="{160 + i * 74}" width="360" height="60" rx="30" fill="#fff" stroke="{INK}" stroke-width="4"/>
<text x="240" y="{200 + i * 74}" text-anchor="middle" font-family="Baloo 2, system-ui, sans-serif" font-weight="700" font-size="32" fill="{INK}">__I{i}__</text></g><!--/chip{i}-->''' for i in range(3))
pl_lids = lid(775, 171, 13.5, 6.5, 0, '#b0603d') + lid(835, 158, 15.5, 7, -8, '#a65d3f', delay=0.4)
scenes['placed'] = push(img('placed-plate.webp') + scribble + chips + pl_lids + bubble(40, 40, 'Likh liya ji! ✍️', 380))

# ---- cancelled (same pose, order torn up) ----
torn = f'''<g><animateTransform attributeName="transform" type="translate" values="0 0;0 0;120 -60;220 120;260 330;260 330" keyTimes="0;0.15;0.3;0.55;0.8;1" dur="4s" {R}/>
<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;0.14;0.16;0.7;0.82;1" dur="4s" {R}/>
<g transform="translate(650 500)"><g><animateTransform attributeName="transform" type="rotate" values="0;0;-30;40;90;90" keyTimes="0;0.15;0.3;0.55;0.8;1" dur="4s" {R}/>
<rect x="-50" y="-64" width="100" height="128" rx="6" fill="#fff" stroke="{INK}" stroke-width="4"/>
{''.join(f'<line x1="-32" y1="{-30 + k * 22}" x2="{26 if k < 3 else 0}" y2="{-30 + k * 22}" stroke="#3d5cff" stroke-width="5"/>' for k in range(4))}</g></g></g>'''
stamp = f'''<g transform="translate(260 300)"><g><animateTransform attributeName="transform" type="scale" values="0;0;1.25;1;1;0" keyTimes="0;0.32;0.4;0.46;0.92;1" dur="4s" {R}/>
<circle r="110" fill="#fff" stroke="#c62828" stroke-width="14"/><path d="M-48 -48 L48 48 M48 -48 L-48 48" stroke="#c62828" stroke-width="24" stroke-linecap="round"/></g></g>'''
scenes['cancelled'] = (f'<g style="filter:saturate(0.55)">{img("placed-plate.webp")}{img("placed-hand.webp", hx, hy, hw, hh)}{pl_lids}</g>'
                       f'<rect width="1200" height="896" fill="#c62828" opacity="0.08"/>' + torn + stamp + bubble(40, 40, 'Koi baat na ji 🙏', 380))

# ---- ready (calling the customer) ----
rd = load('ready')
phone_poly = [(305, 670), (330, 652), (420, 655), (505, 682), (502, 760), (380, 785), (310, 768), (300, 700)]
p_layer, p_box, p_plate = cutout(rd, [phone_poly], grow=7, plate_grow=7)
save(p_plate, 'ready-plate.webp')
save(p_layer, 'ready-phone.webp')
px, py, pw, ph = p_box[0], p_box[1], p_box[2] - p_box[0], p_box[3] - p_box[1]
D = '4s'
shake = f'''<g><animateTransform attributeName="transform" type="rotate" values="0 400 770;-2.5 400 770;2.5 400 770;-2.5 400 770;2.5 400 770;0 400 770;0 400 770" keyTimes="0;0.05;0.1;0.15;0.2;0.25;1" dur="{D}" {R}/>{img('ready-phone.webp', px, py, pw, ph)}</g>'''
rings = ''.join(f'''<path d="M{330 - i * 26} {640 - i * 22} q-{28 + i * 10} -{20 + i * 8} -{6 + i * 4} -{56 + i * 18} M{470 + i * 26} {640 - i * 22} q{28 + i * 10} -{20 + i * 8} {6 + i * 4} -{56 + i * 18}" stroke="#d32f2f" stroke-width="9" fill="none" stroke-linecap="round" opacity="0">
<animate attributeName="opacity" values="0;1;0;1;0;0" keyTimes="0;0.06;0.12;0.18;0.26;1" dur="{D}" begin="{i * 0.08}s" {R}/></path>''' for i in range(3))
ear = ''.join(f'''<path d="M{700 - i * 24} {170 - i * 8} q-{22 + i * 8} {30 + i * 6} 0 {66 + i * 16}" stroke="#d32f2f" stroke-width="8" fill="none" stroke-linecap="round" opacity="0">
<animate attributeName="opacity" values="0;0;1;0;1;0;0" keyTimes="0;0.3;0.38;0.46;0.54;0.62;1" dur="{D}" begin="{i * 0.1}s" {R}/></path>''' for i in range(3))
tring = f'''<g opacity="0"><animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.04;0.24;0.28;1" dur="{D}" {R}/>
<text x="400" y="560" text-anchor="middle" font-family="Bowlby One, Arial Black, sans-serif" font-size="56" fill="#d32f2f">Tring tring!</text></g>'''
tag = f'''<g transform="translate(900 650)"><g><animateTransform attributeName="transform" type="rotate" values="-8;8;-8" dur="1.6s" {R}/>
<line x1="0" y1="0" x2="0" y2="40" stroke="{INK}" stroke-width="4"/><rect x="-80" y="40" width="160" height="62" rx="14" fill="#22c55e" stroke="{INK}" stroke-width="5"/>
<text x="0" y="84" text-anchor="middle" font-family="Baloo 2, system-ui, sans-serif" font-weight="800" font-size="34" fill="#fff">Ready ✓</text></g></g>'''
scenes['ready'] = push(img('ready-plate.webp') + shake + rings + ear + tring + tag
                       + bubble(40, 40, 'Order taiyaar sai ji! 🛍️', 520, f'<animate attributeName="opacity" values="0;0;1;1;0" keyTimes="0;0.3;0.36;0.94;1" dur="{D}" {R}/>'))

# ---- done (handshake + wave) ----
dn = load('done')
wave_poly = [(970, 40), (1000, 20), (1060, 38), (1082, 70), (1084, 160), (1102, 190), (1150, 280), (1166, 338), (1164, 362), (1122, 370), (1094, 322), (1058, 244), (1040, 192), (1000, 182), (960, 142), (946, 118), (965, 110), (985, 128)]
w_layer, w_box, w_plate = cutout(dn, [wave_poly], grow=9, plate_grow=9, radius=11)
save(w_plate, 'done-plate.webp')
save(w_layer, 'done-wave.webp')
wx, wy, ww, wh = w_box[0], w_box[1], w_box[2] - w_box[0], w_box[3] - w_box[1]
wave = f'''<g><animateTransform attributeName="transform" type="rotate" values="-7 1138 350;9 1138 350;-7 1138 350" calcMode="spline" keyTimes="0;0.5;1" keySplines="0.45 0 0.55 1;0.45 0 0.55 1" dur="0.9s" {R}/>{img('done-wave.webp', wx, wy, ww, wh)}</g>'''
hearts = ''.join(f'''<path d="M0 0 C-14 -14 -28 0 0 22 C28 0 14 -14 0 0Z" fill="#ff4f9a" stroke="{INK}" stroke-width="3" opacity="0">
<animate attributeName="opacity" values="0;1;0" dur="2.4s" begin="-{i * 0.8}s" {R}/><animateMotion path="M{520 + (i - 1) * 40} 640 q{(i - 1) * 30} -120 {(i - 1) * 10} -260" dur="2.4s" begin="-{i * 0.8}s" {R}/></path>''' for i in range(3))
scenes['done'] = push(img('done-plate.webp') + wave + hearts + lid(801, 225, 16, 7, -4, '#a85f3d', delay=1)
                      + bubble(40, 40, 'Fer aaiyo ji! 👋', 360))

# ---- delivery (on the scooter) ----
dv = load('delivery')
arr = np.array(dv).astype(int)
bg = np.median(arr[:40, :40].reshape(-1, 3), axis=0)
diff = np.abs(arr - bg).sum(axis=2)
fg = (diff > 45).astype(np.uint8)
yy = np.arange(arr.shape[0])[:, None]
lum = arr.mean(axis=2)
fg[(yy > 838) & (lum > 110)] = 0          # drop the painted floor shadow, keep the dark tyres
fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
n, lab, stats, _ = cv2.connectedComponentsWithStats(fg)
keep = np.zeros_like(fg)
for k in range(1, n):
    if stats[k, cv2.CC_STAT_AREA] > 3000:
        keep[lab == k] = 1
alpha = Image.fromarray(keep * 255).filter(ImageFilter.GaussianBlur(1.2))
sc = dv.copy()
sc.putalpha(alpha)
sb = Image.fromarray(keep * 255).getbbox()
save(sc.crop(sb), 'delivery-scooter.webp')
sx, sy, sw, sh = sb[0], sb[1], sb[2] - sb[0], sb[3] - sb[1]
trees = ''.join(f'''<g><animateTransform attributeName="transform" type="translate" values="-260 0;1460 0" dur="4.2s" begin="-{i * 1.4:.1f}s" {R}/>
<rect x="-10" y="560" width="20" height="240" fill="#8b5a2b"/><circle cx="0" cy="520" r="90" fill="#43a047" stroke="{INK}" stroke-width="5"/><circle cx="-30" cy="490" r="32" fill="#66bb6a"/></g>''' for i in range(3))
clouds = ''.join(f'''<g><animateTransform attributeName="transform" type="translate" values="-300 0;1500 0" dur="{16 + i * 5}s" begin="-{i * 7}s" {R}/>
<g transform="translate(0 {120 + i * 90})"><ellipse rx="90" ry="34" fill="#fff"/><ellipse cx="60" cy="-20" rx="60" ry="38" fill="#fff"/><ellipse cx="-50" cy="-10" rx="44" ry="28" fill="#fff"/></g></g>''' for i in range(2))
road = f'''<rect y="800" width="1200" height="96" fill="#3a3a46"/><line x1="0" y1="880" x2="1200" y2="880" stroke="#fff" stroke-width="10" stroke-dasharray="70 50"><animate attributeName="stroke-dashoffset" values="0;-120" dur="0.4s" {R}/></line>'''
speed = ''.join(f'''<line x1="{900 + i * 30}" y1="{520 + i * 70}" x2="{1010 + i * 30}" y2="{520 + i * 70}" stroke="#fff" stroke-width="9" stroke-linecap="round" opacity="0"><animate attributeName="opacity" values="0;0.9;0" dur="0.6s" begin="-{i * 0.2:.1f}s" {R}/><animateTransform attributeName="transform" type="translate" values="-30 0;40 0" dur="0.6s" begin="-{i * 0.2:.1f}s" {R}/></line>''' for i in range(3))
spokes = ''.join(f'''<g opacity="0.45"><animateTransform attributeName="transform" type="rotate" values="0 {cx} {cy};-360 {cx} {cy}" dur="0.35s" {R}/>
<line x1="{cx - r}" y1="{cy}" x2="{cx + r}" y2="{cy}" stroke="#ddd" stroke-width="5"/><line x1="{cx}" y1="{cy - r}" x2="{cx}" y2="{cy + r}" stroke="#ddd" stroke-width="5"/></g>''' for cx, cy, r in [(285, 755, 60), (868, 752, 55)])
bob = f'''<g><animateTransform attributeName="transform" type="translate" values="0 0;0 -5;0 0;0 -2;0 0" dur="0.45s" {R}/>{img('delivery-scooter.webp', sx, sy, sw, sh)}{spokes}
{lid(592, 133, 8, 4.5, 0, '#a85f3d', dur=3.8)}{lid(628, 127, 9, 5, -6, '#a85f3d', dur=3.8)}</g>'''
scenes['out'] = ('<rect width="1200" height="896" fill="url(#sky)"/>' + clouds + trees + road + speed + bob
                 + bubble(40, 40, 'Raste mein sai ji! 🛵', 500))

# ---- write the TS module ----
ts = ['// Generated by scripts/build_scenes.py. Do not edit by hand.',
      '// Each value is the inner markup of an <svg viewBox="0 0 1200 896">; __B__ is replaced with the asset base URL.',
      f'export const SCENE_DEFS = {json.dumps(DEFS)}',
      'export const SCENES: Record<string, string> = {']
for k, v in scenes.items():
    ts.append(f'  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)},')
ts.append('}')
open(os.path.join(ROOT, 'web/src/scenes.gen.ts'), 'w').write('\n'.join(ts) + '\n')
print({f: os.path.getsize(os.path.join(OUT, f)) for f in sorted(os.listdir(OUT))})
