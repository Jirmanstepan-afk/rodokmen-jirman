#!/usr/bin/env python3
"""Celostránková infografika „Čím se živili“ pro přílohu knihy (98-povolani.md).
Počty se znovu počítají z data/rodokmen.json: osoby v přímé linii Štěpána, nežijící,
s polem occupation a s matričním pramenem (signatura/apu). Úseky povolání, které mluví
jen o rodině („manželka…“, „dcera…“, „syn…“) nebo jsou výslovně neověřené, se nepočítají.
Kategorie podle data/povolani-kategorie.json. Výstup: img/kniha/povolani-infografika.png
(vykreslí se přes headless Chromium s písmy knihy)."""
import json, re, unicodedata, collections, pathlib, asyncio, html
ROOT = pathlib.Path(__file__).resolve().parent.parent
d = json.load(open(ROOT / 'data/rodokmen.json'))
cat = json.load(open(ROOT / 'data/povolani-kategorie.json'))

def fold(s):
    return unicodedata.normalize('NFD', (s or '').replace('ß', 'ss')).encode('ascii', 'ignore').decode().lower()

P = {p['id']: p for p in d['people']}
par = {}
for u in d['unions']:
    for c in u.get('children', []):
        par.setdefault(c, u['partners'])
focus = d['meta']['focus']
gen = {focus: 1}
q = [focus]
while q:
    i = q.pop(0)
    for p in par.get(i, []):
        if p not in gen:
            gen[p] = gen[i] + 1
            q.append(p)

FAMILY = re.compile(r'^\s*(manželka|manžel|dcera|syn|selská dcera|v křestním|v sňatku|vdova)\b', re.I)
cats = [c for c in cat['categories'] if c['id'] not in ('status', 'rodina', 'neuvedeno')]
cnt = collections.Counter()
bygen = collections.defaultdict(collections.Counter)
people_n = 0
for pid, g in gen.items():
    p = P[pid]
    o = p.get('occupation')
    if p.get('living') or not o:
        continue
    if not any(s.get('signatura') or s.get('apu') for s in p.get('sources', [])):
        continue
    segs = [s for s in re.split(r';', o) if s.strip() and not FAMILY.match(s) and 'neověřen' not in s]
    hit = set()
    for s in segs:
        f = fold(s)
        for c in cats:
            if any(fold(x) and fold(x) in f for x in c.get('patterns', [])):
                hit.add(c['id'])
    if not hit:
        continue
    people_n += 1
    for h in hit:
        cnt[h] += 1
        bygen[g][h] += 1

label = {c['id']: c['label'] for c in cats}
short = {'sedlak': 'sedlák / rolník', 'chalupnik': 'chalupník / domkář', 'podruh': 'podruh', 'vymenkar': 'výměnkář',
         'tkadlec': 'tkadlec / textil', 'krejci': 'krejčí', 'obuvnik': 'švec / obuvník', 'tesar': 'tesař', 'truhlar': 'truhlář',
         'mlynar': 'mlynářský tovaryš', 'zahradnik': 'zahradník', 'nadenik': 'nádeník', 'delenik': 'dělník / dělnice',
         'zeleznicar': 'železničář', 'sluzebna': 'služebná', 'rychtar': 'rychtář', 'mestan': 'měšťan', 'vojak': 'voják'}
rows = cnt.most_common()
mx = rows[0][1]
gens = sorted(bygen)
top = [k for k, _ in rows[:7]]
updated = d['meta'].get('updated', '')

def bar(k, v):
    w = 86 * v / mx
    return f'''<div class="row"><div class="lab">{html.escape(short.get(k, label[k]))}</div>
      <div class="track"><div class="bar" style="width:{w:.1f}%"></div><span class="num" style="left:calc({w:.1f}% + 8px)">{v}</span></div></div>'''

def cell(g, k):
    v = bygen[g][k]
    if not v:
        return '<td class="z">·</td>'
    gmax = max(bygen[x][y] for x in gens for y in top)
    r = 8 + 14 * (v / max(1, gmax)) ** 0.7
    return f'<td><span class="dot" style="width:{r*2:.0f}px;height:{r*2:.0f}px">{v}</span></td>'

doc = f'''<!doctype html><html lang="cs"><head><meta charset="utf-8">
<link rel="stylesheet" href="{(ROOT / 'fonts/fonts.css').as_uri()}">
<style>
html,body{{margin:0}}
body{{width:1200px;min-height:1680px;box-sizing:border-box;padding:70px 84px 80px;font-family:"EB Garamond",Georgia,serif;color:#2a2116;
 background:radial-gradient(ellipse at 50% 30%,#fbf3df 0%,#f3e6c8 60%,#e9d6ad 100%);position:relative}}
body:before{{content:"";position:absolute;inset:26px;border:2px solid #b08a4a;outline:1px solid #d9bf87;outline-offset:-10px;pointer-events:none}}
.sc{{font-family:"Cormorant SC","EB Garamond",serif;letter-spacing:.14em;color:#8a6a35;font-size:24px;text-align:center}}
h1{{font-weight:500;font-size:68px;text-align:center;margin:6px 0 4px;letter-spacing:.01em}}
.lead{{text-align:center;font-style:italic;font-size:26px;color:#5b4a33;margin:0 auto 26px;max-width:900px;line-height:1.3}}
.orn{{text-align:center;color:#a07a3c;font-size:26px;margin:4px 0 22px}}
.row{{display:flex;align-items:center;gap:18px;margin:9px 0}}
.lab{{width:290px;text-align:right;font-size:29px}}
.track{{flex:1;position:relative;height:34px}}
.bar{{height:100%;border-radius:2px 7px 7px 2px;background:linear-gradient(180deg,#8f5a2c,#6e3f1c);box-shadow:inset 0 -3px 0 rgba(0,0,0,.18),0 2px 3px rgba(80,50,20,.25)}}
.num{{position:absolute;top:50%;transform:translateY(-50%);font-size:28px;font-weight:600;color:#5a3a1a}}
h2{{font-family:"Cormorant SC","EB Garamond",serif;font-weight:700;font-size:30px;letter-spacing:.08em;color:#6e3f1c;margin:34px 0 10px;text-align:center}}
table{{border-collapse:collapse;margin:0 auto;font-size:22px}}
th{{font-weight:500;padding:4px 6px;color:#5b4a33}}
th.g{{text-align:right;padding-right:14px;white-space:nowrap}}
thead th{{font-size:20px;line-height:1.05;vertical-align:bottom;width:104px}}
td{{width:104px;height:44px;text-align:center;border-top:1px solid rgba(160,122,60,.25)}}
td.z{{color:#c2ab80}}
.dot{{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(122,58,28,.82);color:#fbeccb;font-size:17px;font-weight:600;font-family:"EB Garamond",serif}}
.note{{font-size:20px;color:#6b5b43;text-align:center;line-height:1.35;margin:22px auto 0;max-width:940px;font-style:italic}}
</style></head><body>
<div class="sc">Příloha · Co z toho plyne</div>
<h1>Čím se živili</h1>
<p class="lead">{people_n} předků v přímé linii, u nichž matrika zapsala povolání. Jeden člověk může mít během života víc povolání.</p>
<div class="orn">❧ ✦ ☙</div>
{''.join(bar(k, v) for k, v in rows)}
<h2>Podle generací</h2>
<table><thead><tr><th></th>{''.join(f'<th>{html.escape(short.get(k, label[k]))}</th>' for k in top)}</tr></thead>
<tbody>{''.join(f'<tr><th class="g">{g}. generace</th>' + ''.join(cell(g, k) for k in top) + '</tr>' for g in gens)}</tbody></table>
<p class="note">Počítáno z rodokmenu k {html.escape('. '.join(str(int(x)) for x in reversed(updated.split('-'))) if updated else '')}: jen povolání doložená matričním zápisem, bez žijících osob a bez údajů jen o rodině („manželka podruha“). Já jsem 1. generace. Číslo v kroužku = počet osob dané generace s tímto povoláním.</p>
</body></html>'''

out_html = pathlib.Path('/tmp/povolani-infografika.html')
out_html.write_text(doc, encoding='utf-8')

async def render():
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--allow-file-access-from-files'])
        pg = await b.new_page(viewport={'width': 1200, 'height': 1680})
        await pg.goto(out_html.as_uri())
        await pg.wait_for_timeout(800)
        h = await pg.evaluate('document.body.scrollHeight')
        await pg.set_viewport_size({'width': 1200, 'height': max(1680, h)})
        await pg.screenshot(path='/tmp/povolani-infografika.png', full_page=True)
        await b.close()
asyncio.run(render())
from PIL import Image
im = Image.open('/tmp/povolani-infografika.png').convert('RGB')
im.save(ROOT / 'img/kniha/povolani-infografika.jpg', quality=88, optimize=True)
print('osob:', people_n, 'počty:', rows)
print('generace:', {g: dict(bygen[g]) for g in gens})
