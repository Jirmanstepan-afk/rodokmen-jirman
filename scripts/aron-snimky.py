#!/usr/bin/env python3
"""Odkazy na snímky v ARON a náhledy zápisů pro mapu rodokmenu.

Data: data/zdroje.json  (knihy = signatura -> APU, snimky = "signatura|snímek" -> odkaz + náhled)
Obrázky: img/zdroje/<signatura>_s<snímek>.jpg (náhled) a ..._velky.jpg (větší výřez pro lightbox)

Příkazy (spouštět z adresáře mapy):
  python3 scripts/aron-snimky.py doplnit
      Pro každý zdroj s signaturou a snímkem v data/rodokmen.json, který ještě není v zdroje.json,
      dohledá odkaz na snímek v ARON, stáhne snímek (pokud není na disku) a udělá náhled celé strany.
  python3 scripts/aron-snimky.py vyrez SIGNATURA SNIMEK x0,y0,x1,y1
      Náhled = výřez zápisu (relativní souřadnice 0–1 vůči celé straně).
  python3 scripts/aron-snimky.py vyrez-soubor SIGNATURA SNIMEK cesta.jpg
      Náhled = hotový výřez (např. z /workspace/rodokmen/vypisy).
  python3 scripts/aron-snimky.py kniha SIGNATURA APU-UUID
      Zaregistruje novou knihu (APU najdete v URL knihy na aron.vychodoceskearchivy.cz/apu/<uuid>).
  python3 scripts/aron-snimky.py alias SIGNATURA "text v detailu" SNIMEK
      Když zdroj neuvádí „snímek N“ (např. „folio 71“), přiřadí mu číslo snímku.

Rodinné dokumenty (rodný list, rodokmen Klimeš, sdělení) se sem NEDÁVAJÍ — jen text bez obrázku.
"""
from __future__ import annotations
import gzip, json, os, re, sys, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "rodokmen.json"
ZDROJE = ROOT / "data" / "zdroje.json"
IMG = ROOT / "img" / "zdroje"
SNIMKY_ROOT = Path(os.environ.get("ROD_SNIMKY", str(ROOT.parent)))
ARON = "https://aron.vychodoceskearchivy.cz"
UA = {"User-Agent": "Mozilla/5.0 (rodokmen-mapa)", "Accept-Encoding": "gzip"}
NAHLED_W, VELKY_W = 720, 2000

def load_z():
    if ZDROJE.exists():
        return json.loads(ZDROJE.read_text(encoding="utf-8"))
    return {"_info": "Generováno scripts/aron-snimky.py. Odkazy na snímky ARON a náhledy zápisů.", "knihy": {}, "aliasy": {}, "snimky": {}}

def save_z(z):
    z["snimky"] = dict(sorted(z["snimky"].items()))
    ZDROJE.write_text(json.dumps(z, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

def get_json(url):
    req = urllib.request.Request(url, headers={**UA, "Accept": "application/json"})
    raw = urllib.request.urlopen(req, timeout=90).read()
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    return json.loads(raw)

_apu_cache = {}
def apu_meta(apu):
    if apu not in _apu_cache:
        _apu_cache[apu] = get_json(f"{ARON}/api/aron/apu/{apu}")
    return _apu_cache[apu]

def snimky_of(src, aliasy):
    """Čísla snímků uvedená ve zdroji (pole snimek, „snímek N“, „snímky A–B“, „snímky A a B“, aliasy)."""
    out = []
    sn = src.get("snimek")
    if sn is not None:
        out += sn if isinstance(sn, list) else [sn]
    det = src.get("detail") or ""
    m = re.search(r"snímky\s+(\d+)\s*[–-]\s*(\d+)", det)
    if m:
        out += list(range(int(m.group(1)), int(m.group(2)) + 1))
    m = re.search(r"snímky\s+([\d ,a]+)", det)
    if m:
        out += [int(n) for n in re.findall(r"\d+", m.group(1))]
    out += [int(n) for n in re.findall(r"snímek\s+(\d+)", det)]
    sig = src.get("signatura")
    if not out and sig:
        for key, n in aliasy.items():
            s, _, txt = key.partition("|")
            if s == sig and txt and txt in det:
                out.append(int(n))
    seen = []
    for o in out:
        if int(o) not in seen:
            seen.append(int(o))
    return seen

def all_sources(d):
    def coll(xs):
        for x in xs or []:
            for s in x.get("sources") or []:
                yield s
    yield from coll(d.get("people"))
    yield from coll(d.get("unions"))
    yield from coll(d.get("open_questions"))
    for b in d.get("unattached_branches") or []:
        yield from coll(b.get("people"))
        yield from coll(b.get("unions"))

def find_page(sig, n):
    pat = re.compile(rf"_{n:05d}_sign-{re.escape(sig)}\.jpe?g$", re.I)
    for base in [SNIMKY_ROOT / "_snimky" / sig, SNIMKY_ROOT / sig / "pages", SNIMKY_ROOT / sig,
                 SNIMKY_ROOT / f"chocen-{sig}" / "pages"]:
        if base.is_dir():
            for f in base.iterdir():
                if pat.search(f.name):
                    return f
    for f in SNIMKY_ROOT.rglob(f"*_{n:05d}_sign-{sig}.*"):
        if pat.search(f.name):
            return f
    return None

def files_by_order(apu):
    m = apu_meta(apu)
    do = (m.get("digitalObjects") or [None])[0]
    if not do:
        return None, {}, {}
    pub, tile = {}, {}
    for f in do.get("files") or []:
        if f.get("type") == "PUBLISHED":
            pub[f["order"]] = f
        elif f.get("type") == "TILE":
            tile[f["order"]] = f
    return do["id"], pub, tile

def download_page(apu, sig, n):
    dao, pub, _ = files_by_order(apu)
    f = pub.get(n)
    if not f:
        raise SystemExit(f"{sig}: snímek {n} v ARON neexistuje")
    dest = SNIMKY_ROOT / "_snimky" / sig
    dest.mkdir(parents=True, exist_ok=True)
    out = dest / f["name"]
    if not out.exists():
        req = urllib.request.Request(f"{ARON}/api/aron/referencedfiles/{f['id']}", headers={"User-Agent": UA["User-Agent"]})
        out.write_bytes(urllib.request.urlopen(req, timeout=180).read())
        time.sleep(0.2)
    return out

def snimek_url(z, sig, n):
    kn = z["knihy"].get(sig)
    if not kn:
        return None
    dao, _, tile = files_by_order(kn["apu"])
    t = tile.get(n)
    if not t:
        return None
    return f"{ARON}/apu/{kn['apu']}/dao/{dao}/file/{t['id']}"

def make_images(sig, n, src_img, box=None):
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = None
    im = Image.open(src_img).convert("L")
    if box:
        W, H = im.size
        x0, y0, x1, y1 = box
        im = im.crop((int(x0 * W), int(y0 * H), int(x1 * W), int(y1 * H)))
    from PIL import ImageOps
    im = ImageOps.autocontrast(im, cutoff=0.5)
    IMG.mkdir(parents=True, exist_ok=True)
    stem = f"{sig}_s{n:03d}"
    big = im.copy(); big.thumbnail((VELKY_W, VELKY_W))
    big.save(IMG / f"{stem}_velky.jpg", quality=68, optimize=True, progressive=True)
    sm = im.copy(); sm.thumbnail((NAHLED_W, 520))
    sm.save(IMG / f"{stem}.jpg", quality=72, optimize=True, progressive=True)
    return f"img/zdroje/{stem}.jpg", f"img/zdroje/{stem}_velky.jpg"

def ensure_entry(z, sig, n, *, crop=None, crop_file=None, force_img=False):
    key = f"{sig}|{n}"
    e = z["snimky"].get(key) or {"signatura": sig, "snimek": n}
    if not e.get("url"):
        u = snimek_url(z, sig, n)
        if u:
            e["url"] = u
    need_img = force_img or not e.get("nahled") or not (ROOT / e["nahled"]).exists()
    if need_img:
        if crop_file:
            nah, vel = make_images(sig, n, crop_file)
            e["vyrez"] = "zápis"
        else:
            page = find_page(sig, n)
            if not page and z["knihy"].get(sig):
                page = download_page(z["knihy"][sig]["apu"], sig, n)
            if not page:
                print(f"  {key}: snímek není na disku ani v ARON — bez náhledu")
                z["snimky"][key] = e
                return e
            nah, vel = make_images(sig, n, page, crop)
            e["vyrez"] = "zápis" if crop else "celá strana"
        e["nahled"], e["velky"] = nah, vel
    z["snimky"][key] = e
    return e

def main(argv):
    if len(argv) < 2:
        print(__doc__); return 1
    cmd = argv[1]
    z = load_z()
    if cmd == "kniha":
        sig, apu = argv[2], argv[3]
        m = apu_meta(apu)
        if f"sign.: {sig} " not in (m.get("name") or ""):
            raise SystemExit(f"APU {apu} není kniha {sig}: {m.get('name')}")
        dao = ((m.get("digitalObjects") or [{}])[0] or {}).get("id")
        z["knihy"][sig] = {"apu": apu, "dao": dao, "nazev": m.get("name"), "popis": m.get("description"),
                           "url": f"{ARON}/apu/{apu}"}
        save_z(z); print("OK", sig, z["knihy"][sig]["url"]); return 0
    if cmd == "alias":
        sig, txt, n = argv[2], argv[3], int(argv[4])
        z.setdefault("aliasy", {})[f"{sig}|{txt}"] = n
        save_z(z); return 0
    if cmd == "vyrez":
        sig, n = argv[2], int(argv[3])
        box = tuple(float(v) for v in argv[4].split(","))
        e = ensure_entry(z, sig, n, crop=box, force_img=True)
        e["vyrez_box"] = list(box)
        save_z(z); print(e); return 0
    if cmd == "vyrez-soubor":
        sig, n, f = argv[2], int(argv[3]), argv[4]
        e = ensure_entry(z, sig, n, crop_file=f, force_img=True)
        e["vyrez_soubor"] = os.path.basename(f)
        save_z(z); print(e); return 0
    if cmd == "doplnit":
        d = json.loads(DATA.read_text(encoding="utf-8"))
        aliasy = z.get("aliasy") or {}
        pairs = set()
        for s in all_sources(d):
            sig = s.get("signatura")
            if not sig:
                continue
            if sig not in z["knihy"]:
                print(f"  POZOR: kniha {sig} není v zdroje.json/knihy — spusťte: scripts/aron-snimky.py kniha {sig} <APU-UUID>")
                continue
            for n in snimky_of(s, aliasy):
                pairs.add((sig, n))
        for sig, n in sorted(pairs):
            if f"{sig}|{n}" in z["snimky"] and z["snimky"][f"{sig}|{n}"].get("nahled"):
                continue
            print("doplňuji", sig, n)
            ensure_entry(z, sig, n)
            save_z(z)
        save_z(z); print("Hotovo,", len(z["snimky"]), "snímků"); return 0
    print(__doc__); return 1

if __name__ == "__main__":
    sys.exit(main(sys.argv))
