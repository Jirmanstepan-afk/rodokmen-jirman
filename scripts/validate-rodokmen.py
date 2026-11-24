#!/usr/bin/env python3
"""Kontrola data/rodokmen.json: jedinečná id a rozbité odkazy."""
from __future__ import annotations
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "rodokmen.json"

ALLOWED_CERT = {"potvrzeno", "pravdepodobne", "kandidat"}

def main() -> int:
    if not DATA.is_file():
        print(f"CHYBÍ {DATA}", file=sys.stderr)
        return 2
    data = json.loads(DATA.read_text(encoding="utf-8"))
    people = data.get("people") or []
    unions = data.get("unions") or []
    ident = data.get("identifications") or []
    cands = data.get("candidate_links") or []
    branches = set((data.get("branches") or {}).keys())
    errors: list[str] = []
    warnings: list[str] = []

    ids = [p.get("id") for p in people]
    if any(not i for i in ids):
        errors.append("Některá osoba nemá id.")
    seen = {}
    for i in ids:
        if not i:
            continue
        seen[i] = seen.get(i, 0) + 1
    for i, n in seen.items():
        if n > 1:
            errors.append(f"Duplicitní id osoby: {i} ({n}×)")
    idset = set(seen)

    focus = (data.get("meta") or {}).get("focus")
    if focus and focus not in idset:
        errors.append(f"meta.focus odkazuje na neexistující id: {focus}")

    for p in people:
        pid = p.get("id")
        if not p.get("name"):
            errors.append(f"{pid}: chybí name")
        c = p.get("certainty")
        if c and c not in ALLOWED_CERT:
            errors.append(f"{pid}: neznámá jistota {c!r}")
        b = p.get("branch")
        if b and branches and b not in branches:
            warnings.append(f"{pid}: větev {b!r} není v branches")
        if p.get("living"):
            # hrubá kontrola, že u živých nejsou typické adresní vzory v polích míst
            blob = " ".join(p.get("places") or [])
            for key in ("birth", "death", "baptism"):
                place = ((p.get(key) or {}) if isinstance(p.get(key), dict) else {}).get("place") or ""
                blob += " " + place
            # čísla popisná typicky „č. 12“ — u živých nechceme
            if "č. " in blob or "č.p." in blob.lower() or "Kolonie" in blob:
                warnings.append(f"{pid}: living=true, ale v místě je číslo domu nebo ulice — zkontrolovat soukromí")

    uids = [u.get("id") for u in unions]
    for i, n in {x: uids.count(x) for x in uids}.items():
        if i and n > 1:
            errors.append(f"Duplicitní id svazku: {i}")

    def need(pid, ctx):
        if not pid:
            errors.append(f"{ctx}: prázdné id")
        elif pid not in idset:
            errors.append(f"{ctx}: neexistující id {pid}")

    for u in unions:
        uid = u.get("id") or "?"
        for pid in u.get("partners") or []:
            need(pid, f"svazek {uid} / partners")
        for pid in u.get("children") or []:
            need(pid, f"svazek {uid} / children")
        c = u.get("certainty")
        if c and c not in ALLOWED_CERT:
            errors.append(f"svazek {uid}: neznámá jistota {c!r}")

    for it in ident:
        iid = it.get("id") or "?"
        need(it.get("a"), f"ztotožnění {iid} / a")
        need(it.get("b"), f"ztotožnění {iid} / b")
        if it.get("a") and it.get("a") == it.get("b"):
            errors.append(f"ztotožnění {iid}: a a b jsou stejné id")

    for l in cands:
        lid = l.get("id") or "?"
        need(l.get("child"), f"kandidát {lid} / child")
        for pid in l.get("parents") or []:
            need(pid, f"kandidát {lid} / parents")
        mu = l.get("maybe_parent_union")
        if mu and mu not in set(uids):
            errors.append(f"kandidát {lid}: maybe_parent_union {mu} neexistuje")

    # osiřelé osoby (nikde ve svazku, ztotožnění ani kandidátovi)
    used = set()
    for u in unions:
        used.update(u.get("partners") or [])
        used.update(u.get("children") or [])
    for it in ident:
        used.add(it.get("a")); used.add(it.get("b"))
    for l in cands:
        used.add(l.get("child"))
        used.update(l.get("parents") or [])
    orphans = [i for i in idset if i not in used]
    for i in orphans:
        warnings.append(f"osoba {i} není v žádném svazku, ztotožnění ani kandidátské vazbě")

    print(f"Soubor: {DATA}")
    print(f"Osob: {len(people)}  svazků: {len(unions)}  ztotožnění: {len(ident)}  kandidátů: {len(cands)}")
    if errors:
        print(f"\nChyby ({len(errors)}):")
        for e in errors:
            print("  -", e)
    if warnings:
        print(f"\nUpozornění ({len(warnings)}):")
        for w in warnings:
            print("  -", w)
    if not errors:
        print("\nOK — odkazy na id jsou v pořádku.")
        return 0
    return 1

if __name__ == "__main__":
    sys.exit(main())
