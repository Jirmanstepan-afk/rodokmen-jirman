# Jak doplnit nová zjištění do mapy rodokmenu

Mapa se kreslí výhradně ze souboru `data/rodokmen.json`. Stránku ani skript rozložení kvůli nové osobě upravovat nemusíte.

## 1. Přidat osobu

Do pole `people` přidejte objekt. `id` zvolte stabilní, jedinečné, malými písmeny a s pomlčkami (např. `jan-novak-1840`).

Povinné:

- `id`, `name`, `branch`, `certainty` (`potvrzeno` | `pravdepodobne` | `kandidat`)

Doporučené:

- `maiden` — rodné příjmení
- `birth`, `baptism`, `death` — objekty `{ "display": "1. 10. 1850", "date": "1850-10-01", "place": "Nízká Srbská č. 71", "precision": "exact", "note": "…" }`
  - `precision` může být `exact`, `circa`, `year`, `month`, `range`, `conflict`, `unknown`, `uncertain`
- `occupation` — povolání se zdrojem v `sources`
- `places` — další místa (u **žijících** osob **vynechte adresy i čísla domů** a nastavte `"living": true`)
- `sources` — pole `{ "label": "ARON, narození", "signatura": "96-15", "detail": "snímek 47", "apu": "https://…" }`
- `notes`, `interesting`
- `living` — `true` u žijících (veřejná stránka nesmí ukazovat jejich adresy)

Větev `branch` musí existovat v `branches`, nebo ji tam doplňte (`label` + `color`).

## 2. Propojit osoby

**Svazek / manželství** patří do `unions`:

```json
{
  "id": "u-jan-anna-priklad",
  "partners": ["jan-novak-1840", "anna-nova-1842"],
  "married": { "display": "12. 5. 1865", "date": "1865-05-12", "place": "Machov" },
  "children": ["josef-novak-1866"],
  "certainty": "potvrzeno",
  "sources": [{ "label": "ARON", "signatura": "96-16", "detail": "snímek 10" }],
  "notes": []
}
```

Jednoho rodiče (nemanželské dítě) zapište jako svazek s jediným partnerem v `partners`.

**Pravděpodobné ztotožnění dvou zápisů téže osoby** (neslučovat potichu, např. dům 71 / 54) patří do `identifications`:

```json
{ "id": "id-priklad", "a": "jan-a", "b": "jan-b", "certainty": "pravdepodobne", "notes": ["…"], "sources": [] }
```

**Nedoložená vazba** (např. Ludvík *1908 a Josef *1857) patří do `candidate_links`, typicky:

```json
{
  "id": "cand-priklad",
  "type": "parent-child",
  "child": "dite-id",
  "parents": ["mozny-otec-id"],
  "certainty": "kandidat",
  "notes": ["Vazba není dokázána."],
  "sources": []
}
```

Do potvrzeného svazku takovou vazbu nedávejte.

Nic z domněnky nedoplňujte. Držte se ledgeru (`ROD-1.md`, `ROD-1-doplneni.md`).

## 3. Ověřit odkazy

Z adresáře mapy:

```bash
python3 scripts/validate-rodokmen.py
```

Skript nahlásí duplicitní id, odkazy na neexistující osoby a další rozbité vazby. Chyby je třeba opravit před nasazením; upozornění (třeba číslo domu u žijící osoby) zkontrolujte ručně.

## 4. Prohlédnout lokálně

JSON se načítá přes `fetch`, proto stránku neotevírejte jako `file://`.

```bash
cd /workspace/rodokmen/mapa
python3 -m http.server 8765
# pak v prohlížeči http://127.0.0.1:8765/
```

## 5. Znovu nasadit jedním příkazem

Mapa běží na GitHub Pages, stejným způsobem jako mapa obchodních partnerů (`export-market-map`): veřejný repozitář účtu `Jirmanstepan-afk`, větev `main`, kořen webu. Projekt partnerů se nepřepisuje.

Veřejná URL: https://jirmanstepan-afk.github.io/rodokmen-jirman/

Potřebujete přihlášení `gh` k účtu `Jirmanstepan-afk` (už je na tomto stroji).

```bash
cd /workspace/rodokmen/mapa
./deploy.sh
```

Skript ověří `data/rodokmen.json` a odešle změny na `main`. GitHub Pages se obvykle obnoví do minuty. Po nasazení zkontrolujte URL a to, že u žijících osob stále nejsou adresy ani čísla domů.
