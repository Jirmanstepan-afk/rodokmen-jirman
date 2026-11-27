#!/usr/bin/env python3
"""Vyznačené snímky matričních zápisů (PIL).
Pro každou položku ve scripts/anotace-spec.json vyřízne oblast z velkého snímku (img/zdroje/*_velky.jpg),
orámuje celý zápis a klíčová slova, šipkou je spojí se štítkem (přepis + český překlad)
a pod obrázek napíše, co ze zápisu plyne. Polohy rámečků jsou ručně odečtené ze snímku (souřadnice velkého snímku).
Výstup: img/zdroje/<sig>_s<NNN>_anotace.jpg + kopie do ../vypisy/<sig>/ a data/anotace.json (pro web a knihu).
Originály se nemění."""
import json, pathlib, shutil, textwrap
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = pathlib.Path(__file__).resolve().parent.parent
SPEC = json.load(open(ROOT / 'scripts/anotace-spec.json', encoding='utf-8'))
FD = '/usr/share/fonts/truetype/sand-box/google/Noto Serif/'
F_REG = FD + 'NotoSerif-VariableFont_wdth,wght.ttf'
F_IT = FD + 'NotoSerif-Italic-VariableFont_wdth,wght.ttf'
SANS = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
SANS_B = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
COLORS = ['#d62828', '#1d6fd1', '#2a9d3f', '#c46a00', '#8e3bc4', '#0f8b8d', '#b5179e', '#5c6b00']
OUT_W = 1600

def font(path, size, bold=False):
    f = ImageFont.truetype(path, size)
    try:
        if bold: f.set_variation_by_name('Bold')
    except Exception: pass
    return f

def wrap(draw, text, fnt, maxw):
    words, lines, cur = text.split(), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if draw.textlength(t, font=fnt) <= maxw: cur = t
        else:
            if cur: lines.append(cur)
            cur = w
    if cur: lines.append(cur)
    return lines

def arrow(d, p0, p1, col, w=4):
    import math
    d.line([p0, p1], fill=col, width=w)
    a = math.atan2(p1[1] - p0[1], p1[0] - p0[0]); L = 20
    pts = [p1, (p1[0] - L * math.cos(a - .42), p1[1] - L * math.sin(a - .42)), (p1[0] - L * math.cos(a + .42), p1[1] - L * math.sin(a + .42))]
    d.polygon(pts, fill=col)

def _dash(d, b, col, w=5, L=16):
    x0, y0, x1, y1 = b
    for a, c in (((x0, y0), (x1, y0)), ((x0, y1), (x1, y1))):
        x = a[0]
        while x < c[0]: d.line([(x, a[1]), (min(x + L, c[0]), a[1])], fill=col, width=w); x += 2 * L
    for a, c in (((x0, y0), (x0, y1)), ((x1, y0), (x1, y1))):
        y = a[1]
        while y < c[1]: d.line([(a[0], y), (a[0], min(y + L, c[1]))], fill=col, width=w); y += 2 * L

def render(it):
    src = ROOT / it['src']
    im = Image.open(src).convert('RGB')
    x0, y0, x1, y1 = it['crop']
    skips = sorted(it.get('skip', []))
    parts, cur = [], x0
    for a, b_ in skips:
        parts.append((cur, a)); cur = b_
    parts.append((cur, x1))
    GAP = 14
    cw = sum(b_ - a for a, b_ in parts) + GAP * (len(parts) - 1)
    crop = Image.new('RGB', (cw, y1 - y0), '#f6eedb')
    ox = 0; cuts = []
    for k, (a, b_) in enumerate(parts):
        crop.paste(im.crop((a, y0, b_, y1)), (ox, 0)); ox += b_ - a
        if k < len(parts) - 1: cuts.append(ox + GAP / 2); ox += GAP
    s = OUT_W / crop.width
    crop = crop.resize((OUT_W, round(crop.height * s)), Image.LANCZOS)
    crop = ImageOps.autocontrast(crop, cutoff=0.5)
    cd = ImageDraw.Draw(crop)
    for c in cuts:
        X = c * s
        for yy in range(0, crop.height, 14): cd.line([(X, yy), (X, yy + 7)], fill='#8a6a35', width=3)
    def MX(x):
        off = 0
        for a, b_ in skips:
            if x >= b_: off += (b_ - a) - GAP
            elif x > a: x = a
        return round((x - x0 - off) * s)
    T = lambda b: (MX(b[0]), round((b[1] - y0) * s), MX(b[2]), round((b[3] - y0) * s))
    marks = it['marks']
    # štítky: rozvržení do řad podle polohy
    dtmp = ImageDraw.Draw(crop)
    mx_row = max(sum(1 for m in marks if m.get('pos') == 'top'), sum(1 for m in marks if m.get('pos') != 'top'))
    sz = 1.0 if mx_row <= 3 else (0.9 if mx_row <= 4 else 0.8)
    f_lat = font(F_IT, round(27 * sz)); f_cs = font(F_REG, round(29 * sz), True); f_arr = font(SANS_B, round(27 * sz)); f_head = font(SANS_B, 30); f_sub = font(SANS, 22)
    f_pl = font(F_REG, 29); f_plb = font(F_REG, 29, True)
    pad, gap = 26, 18
    def bx0(m):
        b = m['box'][0] if isinstance(m['box'][0], list) else m['box']
        return (b[0] + b[2]) / 2
    groups = {'top': [], 'bottom': []}
    for i in sorted(range(len(marks)), key=lambda i: bx0(marks[i])):
        groups['top' if marks[i].get('pos') == 'top' else 'bottom'].append(i)
    def layout(idx):
        if not idx: return [], [], 0
        ncol = min(6, len(idx)) if len(idx) <= 6 else (len(idx) + 1) // 2
        colw = (OUT_W - 2 * pad - (ncol - 1) * gap) / ncol
        labs = []
        for i in idx:
            m = marks[i]
            lt = ('„' + m['lat'] + '“' if m.get('lat') else '') + (' (čtení nejisté)' if m.get('nejiste') else '')
            lat = wrap(dtmp, lt.strip(), f_lat, colw - 30) if lt.strip() else []
            cs = wrap(dtmp, m['cs'], f_cs, colw - 30 - round(34 * sz))
            h = 18 + len(lat) * round(36 * sz) + len(cs) * round(38 * sz) + 12
            labs.append((i, lat, cs, h, colw))
        rows = [labs[k:k + ncol] for k in range(0, len(labs), ncol)]
        rh = [max(l[3] for l in r) for r in rows]
        return rows, rh, sum(rh) + gap * (len(rows) - 1)
    rows_t, rh_t, h_t = layout(groups['top'])
    rows_b, rh_b, h_b = layout(groups['bottom'])
    head_h = 92
    img_top = head_h + (h_t + 56 if h_t else 0)
    lab_top = img_top + crop.height + 46
    d0 = ImageDraw.Draw(crop)
    pl_lines = wrap(d0, 'Co z toho plyne: ' + it['plyne'], f_pl, OUT_W - 2 * pad - 20) if it.get('plyne_v_obrazku') else []
    note_lines = wrap(d0, it['poznamka'], f_sub, OUT_W - 2 * pad - 20) if it.get('poznamka') else []
    H = lab_top + h_b + 34 + len(pl_lines) * 42 + (len(note_lines) * 30 + 10 if note_lines else 0) + 40
    W = OUT_W
    out = Image.new('RGB', (W, H), '#f6eedb')
    out.paste(crop, (0, img_top))
    d = ImageDraw.Draw(out)
    d.rectangle([0, 0, W, head_h], fill='#2f2116')
    d.text((pad, 14), it['title'], font=f_head, fill='#f3e2bd')
    d.text((pad, 54), it['zdroj'], font=f_sub, fill='#cdb78f')
    eb = T(it['entry']); eb = (eb[0], eb[1] + img_top, eb[2], eb[3] + img_top)
    d.rounded_rectangle([eb[0] - 9, eb[1] - 9, eb[2] + 9, eb[3] + 9], radius=12, outline='#e0a100', width=4)
    boxes = {}
    for i, m in enumerate(marks):
        col = m.get('color') or COLORS[i % len(COLORS)]
        bl_ = m['box'] if isinstance(m['box'][0], list) else [m['box']]
        bs = []
        for bx in bl_:
            b = T(bx); b = (b[0], b[1] + img_top, b[2], b[3] + img_top)
            ov = Image.new('RGBA', out.size, (0, 0, 0, 0)); od = ImageDraw.Draw(ov)
            r, g_, bl = int(col[1:3], 16), int(col[3:5], 16), int(col[5:7], 16)
            od.rectangle(b, fill=(r, g_, bl, 34))
            out.paste(Image.alpha_composite(out.convert('RGBA'), ov).convert('RGB'))
            d = ImageDraw.Draw(out)
            if m.get('nejiste'):
                _dash(d, b, col)
            else:
                d.rounded_rectangle(b, radius=6, outline=col, width=5)
            bs.append(b)
        boxes[i] = (bs, col)
    def draw_rows(rows, rh, y, top):
        nonlocal d
        for r, hh in zip(rows, rh):
            n = len(r); colw = r[0][4]
            tot = n * colw + (n - 1) * gap
            x = (W - tot) / 2
            for (i, lat, cs, h, _) in r:
                bs, col = boxes[i]
                b = bs[0]
                ly0 = y + (hh - h if top else 0)
                lx0, lx1, ly1 = x, x + colw, ly0 + h
                bc = (b[0] + b[2]) / 2
                sx = min(max(bc, lx0 + 30), lx1 - 30)
                if top: arrow(d, (sx, ly1), (bc, b[1] - 4), col, 4)
                else: arrow(d, (sx, ly0), (bc, b[3] + 4), col, 4)
                d.rounded_rectangle([lx0, ly0, lx1, ly1], radius=12, fill='#fffaf0', outline=col, width=4)
                ty = ly0 + 14
                for ln in lat:
                    d.text((lx0 + 14, ty), ln, font=f_lat, fill='#3a2c1a'); ty += round(36 * sz)
                for k, ln in enumerate(cs):
                    if k == 0: d.text((lx0 + 14, ty + 1), '→', font=f_arr, fill=col)
                    d.text((lx0 + 14 + round(34 * sz), ty), ln, font=f_cs, fill=col); ty += round(38 * sz)
                x += colw + gap
            y += hh + gap
        return y
    if rows_t: draw_rows(rows_t, rh_t, head_h + 20, True)
    y = draw_rows(rows_b, rh_b, lab_top, False) if rows_b else lab_top
    # co z toho plyne
    y += 16
    if pl_lines: d.line([pad, y, W - pad, y], fill='#c9b48a', width=2)
    y += 14
    first = True
    for ln in pl_lines:
        if first and ln.startswith('Co z toho plyne:'):
            d.text((pad + 10, y), 'Co z toho plyne:', font=f_plb, fill='#8a2f1c')
            off = d.textlength('Co z toho plyne: ', font=f_plb)
            d.text((pad + 10 + off, y), ln[len('Co z toho plyne: '):], font=f_pl, fill='#2a2116')
        else:
            d.text((pad + 10, y), ln, font=f_pl, fill='#2a2116')
        first = False; y += 42
    for ln in note_lines:
        d.text((pad + 10, y + 6), ln, font=f_sub, fill='#6b5b43'); y += 30
    return out

def main():
    index = {}
    for it in SPEC['polozky']:
        img = render(it)
        sig, n = it['key'].split('|')
        name = f"{sig}_s{int(n):03d}_anotace.jpg"
        dst = ROOT / 'img/zdroje' / name
        img.save(dst, quality=85, optimize=True)
        vy = ROOT.parent / 'vypisy' / sig
        if vy.is_dir():
            shutil.copyfile(dst, vy / name)
        index[it['key']] = {'soubor': f'img/zdroje/{name}', 'plyne': it['plyne'], 'titulek': it['title'],
                            'oznaceno': [(m.get('lat') or '') + (' (?)' if m.get('nejiste') else '') + ' → ' + m['cs'] for m in it['marks']]}
        print('ok', name, img.size)
    json.dump({'_info': 'Generováno scripts/anotace-snimku.py ze scripts/anotace-spec.json. Vyznačené snímky zápisů pro knihu a web; originály zůstávají v img/zdroje.',
               'snimky': index}, open(ROOT / 'data/anotace.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

if __name__ == '__main__':
    main()
