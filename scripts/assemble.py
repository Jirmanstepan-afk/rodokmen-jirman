
#!/usr/bin/env python3
"""Sestaví data/rodokmen.json z modulů people_*.py a unions.py.
Tento skript je jen pomocník při prvním sestavení; zdrojem pravdy pro mapu
je výsledný soubor data/rodokmen.json. Nová zjištění přidávejte přímo do JSON
(viz JAK-DOPLNIT.md).
"""
import json, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from people_jirman import PEOPLE as A
from people_jirman_anc import PEOPLE as B
from people_klimes import PEOPLE as C
from people_maroul import PEOPLE as D
from people_syrovy import PEOPLE as E
from people_pross import PEOPLE as F
from unions import UNIONS, IDENTIFICATIONS, CANDIDATE_LINKS

people = A + B + C + D + E + F
ids = [p["id"] for p in people]
dups = [i for i in ids if ids.count(i) > 1]
if dups:
    raise SystemExit(f"Duplicitní id osob: {sorted(set(dups))}")
u_ids = [u["id"] for u in UNIONS]
if len(u_ids) != len(set(u_ids)):
    raise SystemExit("Duplicitní id svazků")

# drop empty optional fields for cleaner JSON? keep consistent keys for extensibility
data = {
  "meta": {
    "title": "Rodokmen rodiny Jirman",
    "subtitle": "Štěpán Jirman a jeho předkové — podle veřejných matrik a rodinných podkladů",
    "updated": "2026-11-24",
    "timezone": "Europe/Helsinki",
    "sources_files": ["ROD-1.md", "ROD-1-doplneni.md"],
    "focus": "stepan-jirman-1997",
    "privacy": "Stránka je veřejná. U žijících osob nejsou adresy ani čísla domů. Seznam možných žijících příbuzných z veřejných rejstříků není zahrnut. Nic není doplněno z domněnky.",
    "certainty_levels": {
      "potvrzeno": {
        "label": "Potvrzeno zápisem",
        "short": "Potvrzeno",
        "description": "Doloženo matričním zápisem (ARON), úředním listem, nebo výslovně potvrzeným rodinným podkladem."
      },
      "pravdepodobne": {
        "label": "Pravděpodobné",
        "short": "Pravděpodobné",
        "description": "Silná souhra znaků, ale zbývá výhrada (jméno, číslo domu, chybějící oddací zápis). Neslučovat potichu."
      },
      "kandidat": {
        "label": "Kandidát — nedoloženo",
        "short": "Nedoloženo",
        "description": "Možná vazba, která v dostupných zápisech není dokázána. Nejvážnější případ: rodiče Ludvíka *1908."
      }
    }
  },
  "branches": {
    "jirman": {"label": "Jirman", "color": "#1f4e5c"},
    "klimes": {"label": "Klimeš", "color": "#a6532a"},
    "soumar": {"label": "Soumar", "color": "#b08d2e"},
    "spacek": {"label": "Špaček", "color": "#c47a3a"},
    "maroul": {"label": "Maroul", "color": "#2f6b4a"},
    "maslo": {"label": "Máslo", "color": "#5a7a3a"},
    "spadt": {"label": "Špadt", "color": "#8b4d6b"},
    "syrovy": {"label": "Syrový", "color": "#3d5a80"},
    "muller": {"label": "Müller", "color": "#4a6670"},
    "tschinkel": {"label": "Tschinkel", "color": "#4d6a8a"},
    "pross": {"label": "Proß", "color": "#7a3045"},
    "rosenberger": {"label": "Rosenberger", "color": "#6b4c7a"},
    "mader": {"label": "Mader", "color": "#7a4a62"},
    "meier": {"label": "Meier", "color": "#5c4a6b"},
    "vejrych": {"label": "Vejrých", "color": "#2d6a6a"},
    "svejdar": {"label": "Švejdar", "color": "#3a6e5c"},
    "solc": {"label": "Šolc", "color": "#6b4e32"}
  },
  "people": people,
  "unions": UNIONS,
  "identifications": IDENTIFICATIONS,
  "candidate_links": CANDIDATE_LINKS,
}

out = HERE.parent / "data" / "rodokmen.json"
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"osob: {len(people)}")
print(f"svazků: {len(UNIONS)}")
print(f"ztotožnění: {len(IDENTIFICATIONS)}")
print(f"kandidátských vazeb: {len(CANDIDATE_LINKS)}")
print(f"živých (bez adres): {sum(1 for p in people if p.get('living'))}")
print(f"zapsáno {out} ({out.stat().st_size} B)")
