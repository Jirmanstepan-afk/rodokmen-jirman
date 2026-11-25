#!/usr/bin/env python3
"""Kontrola knihy: odkazy na osoby, prameny (sig/snímek), obrázky, otevřené otázky a soubory kapitol.
Spuštění z adresáře mapy:  python3 scripts/kniha-kontrola.py"""
import json, re, os, sys
os.chdir(os.path.join(os.path.dirname(__file__), '..'))
d = json.load(open('data/rodokmen.json'))
z = json.load(open('data/zdroje.json'))
k = json.load(open('data/kniha/kniha.json'))
people = {p['id']: p for p in d['people']}
for b in d.get('unattached_branches', []):
    for p in b['people']: people[p['id']] = p
qs = {q['id'] for q in d.get('open_questions', [])}
sn = z.get('snimky', {})
err = warn = 0
words = 0
for part in k['parts']:
    for ch in part['chapters']:
        f = 'data/kniha/' + ch['file']
        if not os.path.exists(f):
            print('CHYBA: chybí soubor', f); err += 1; continue
        t = open(f).read()
        words += len(re.findall(r'\w+', t))
        for pid in ch.get('people', []):
            if pid not in people: print(f'CHYBA {f}: people „{pid}“ neexistuje'); err += 1
        for pid in re.findall(r'\[\[([a-z0-9-]+)', t):
            if pid not in people: print(f'CHYBA {f}: osoba [[{pid}]] neexistuje'); err += 1
            elif people[pid].get('living') and re.search(r'č\.\s*\d', t.split(pid,1)[1][:120]):
                print(f'POZOR {f}: u žijící osoby {pid} je blízko číslo domu'); warn += 1
        for q in re.findall(r'\[\?([a-z0-9-]+)\]', t):
            if q not in qs: print(f'CHYBA {f}: otevřená otázka {q} neexistuje'); err += 1
        for sig, n in re.findall(r'\[\^([0-9A-Za-z-]+)/(\d+)[\]:]', t):
            if f'{sig}|{n}' not in sn and sig not in z.get('knihy', {}):
                print(f'POZOR {f}: pramen {sig}/{n} nemá odkaz v zdroje.json'); warn += 1
        for sig, n in re.findall(r'^!\[([0-9A-Za-z-]+)/(\d+)\]', t, re.M):
            s = sn.get(f'{sig}|{n}')
            if not s or not os.path.exists(s.get('nahled', '')):
                print(f'CHYBA {f}: obrázek {sig}/{n} není v img/zdroje'); err += 1
        if re.search(r'Gerd[^\n]{0,40}(list)[^\n]*\.(jpg|png)', t, re.I):
            print(f'CHYBA {f}: rodinný dokument jako obrázek'); err += 1
print(f'Kapitol: {sum(len(p["chapters"]) for p in k["parts"])}, slov asi {words}. Chyby: {err}, upozornění: {warn}.')
sys.exit(1 if err else 0)
