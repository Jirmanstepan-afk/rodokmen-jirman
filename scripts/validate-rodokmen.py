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

    unattached = data.get("unattached_branches") or []
    ub_people = []
    ub_unions = []
    ub_ids = []
    for b in unattached:
        for p in b.get("people") or []:
            ub_people.append(p)
            ub_ids.append(p.get("id"))
        ub_unions.extend(b.get("unions") or [])
    all_ids_count = {}
    for i in list(ids) + [x for x in ub_ids if x]:
        all_ids_count[i] = all_ids_count.get(i, 0) + 1
    for i, n in all_ids_count.items():
        if n > 1:
            errors.append(f"Duplicitní id osoby napříč hlavním grafem a nepřipojenými větvemi: {i} ({n}×)")
    ub_idset = {i for i in ub_ids if i}
    any_idset = idset | ub_idset

    focus = (data.get("meta") or {}).get("focus")
    if focus and focus not in idset:
        errors.append(f"meta.focus odkazuje na neexistující id v hlavním grafu: {focus}")

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

    # každá osoba v hlavním grafu musí být svazky spojena s meta.focus (Štěpán)
    from collections import defaultdict, deque
    adj = defaultdict(set)
    for u in unions:
        members = list(u.get("partners") or []) + list(u.get("children") or [])
        for a in members:
            for b in members:
                if a and b and a != b:
                    adj[a].add(b)
    connected = set()
    if focus and focus in idset:
        dq = deque([focus])
        while dq:
            x = dq.popleft()
            if x in connected:
                continue
            connected.add(x)
            for n in adj[x]:
                if n in idset and n not in connected:
                    dq.append(n)
    for i in sorted(idset - connected):
        errors.append(f"hlavní graf: osoba {i} není svazky spojena se Štěpánem (meta.focus) — patří do unattached_branches")

    print(f"Soubor: {DATA}")
    questions = data.get("open_questions") or []
    qids = [q.get("id") for q in questions if q.get("id")]
    for i, n in {x: qids.count(x) for x in qids}.items():
        if n > 1:
            errors.append(f"Duplicitní id otevřeného dotazu: {i}")
    for q in questions:
        qid = q.get("id") or "?"
        if not q.get("title") and not q.get("summary"):
            warnings.append(f"dotaz {qid}: chybí title i summary")
        for pid in q.get("related_ids") or []:
            if not pid:
                errors.append(f"dotaz {qid} / related_ids: prázdné id")
            elif pid not in any_idset:
                errors.append(f"dotaz {qid} / related_ids: neexistující id {pid}")

    # Nové pravidlo: v mapě mají být jen jisté osoby a svazky.
    for p in people:
        c = p.get("certainty")
        if c and c != "potvrzeno":
            warnings.append(f"{p.get('id')}: v mapě nemá jistou úroveň (certainty={c!r}) — patří spíš do open_questions")
    for u in unions:
        c = u.get("certainty")
        if c and c != "potvrzeno":
            warnings.append(f"svazek {u.get('id')}: certainty={c!r} — nejisté svazky nepatří do mapy")
    if ident:
        warnings.append(f"identifications má {len(ident)} položek; pravděpodobná ztotožnění patří do open_questions, ne jako vazby v mapě")
    if cands:
        warnings.append(f"candidate_links má {len(cands)} položek; nedoložené vazby patří do open_questions")

    # nepřipojené větve: vlastní id, svazky jen uvnitř větve, stejná pravidla jistoty
    ub_union_ids = [u.get("id") for u in ub_unions]
    for i, n in {x: ub_union_ids.count(x) for x in ub_union_ids if x}.items():
        if n > 1:
            errors.append(f"Duplicitní id svazku v nepřipojených větvích: {i}")
        if i in set(uids):
            errors.append(f"id svazku {i} je v hlavním grafu i v nepřipojené větvi")
    for bid, b in enumerate(unattached):
        label = b.get("id") or f"unattached[{bid}]"
        if not b.get("title") and not b.get("reason"):
            warnings.append(f"{label}: chybí title i reason")
        bids = {p.get("id") for p in (b.get("people") or []) if p.get("id")}
        for p in b.get("people") or []:
            pid = p.get("id")
            if not p.get("name"):
                errors.append(f"nepřipojená větev {label} / {pid}: chybí name")
            c = p.get("certainty")
            if c and c not in ALLOWED_CERT:
                errors.append(f"nepřipojená větev {label} / {pid}: neznámá jistota {c!r}")
            if p.get("living"):
                blob = " ".join(p.get("places") or [])
                for key in ("birth", "death", "baptism"):
                    place = ((p.get(key) or {}) if isinstance(p.get(key), dict) else {}).get("place") or ""
                    blob += " " + place
                if "č. " in blob or "č.p." in blob.lower() or "Kolonie" in blob:
                    warnings.append(f"nepřipojená větev {label} / {pid}: living=true a číslo domu — zkontrolovat soukromí")
        for u in b.get("unions") or []:
            uid = u.get("id") or "?"
            for pid in list(u.get("partners") or []) + list(u.get("children") or []):
                if not pid:
                    errors.append(f"nepřipojená větev {label} / svazek {uid}: prázdné id")
                elif pid not in bids:
                    errors.append(f"nepřipojená větev {label} / svazek {uid}: id {pid} není mezi lidmi této větve")
            c = u.get("certainty")
            if c and c not in ALLOWED_CERT:
                errors.append(f"nepřipojená větev {label} / svazek {uid}: neznámá jistota {c!r}")

    print(f"Osob v hlavním grafu: {len(people)}  svazků: {len(unions)}  nepřipojených osob: {len(ub_people)}  otevřených dotazů: {len(questions)}")
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
