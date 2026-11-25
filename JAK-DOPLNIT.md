# Jak doplnit nová zjištění do mapy rodokmenu

Mapa se kreslí výhradně ze souboru `data/rodokmen.json`. Stránku ani skript rozložení kvůli nové osobě upravovat nemusíte.

**Do mapy (`people`, `unions`) přidávejte jen osoby a vazby s jistotou:** doložené matričním zápisem se signaturou a s jasnou vazbou na existující osobu, úředním listem, nebo jedním ze dvou zdrojových dokumentů (rodný list Gerdy 1948, rodokmen Klimeš 2019). Nové *pravděpodobné* ani *kandidátské* uzly a vazby do mapy nedávejte.


**Hlavní graf jen se spojení na Štěpána.** Každá osoba v `people` musí být přes `unions` spojená s `meta.focus` (Štěpán Jirman). Jisté osoby bez této vazby dejte do `unattached_branches` (oddíl Nepřipojené větve v panelu). Data zůstanou v JSON a po doložení vazby stačí přesunout oddíl zpět do `people`/`unions` a doplnit jeden svazek. Validátor hlásí chybu na každý nepřipojený uzel v hlavním grafu.

Nejisté čtení, slučování domů, chybějící sňatky a nedoložené rodičovství zapisujte do pole `open_questions` v `data/rodokmen.json` (kopie je v `data/otevrene-dotazy.json`). Mapa je ukáže v panelu **Otevřené dotazy**, ne jako uzly.


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
- `sources` — pole `{ "label": "ARON, narození", "signatura": "96-15", "detail": "snímek 47, folio 45" }` (viz oddíl 2b — odkaz na snímek a fotka se doplní samy)
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

## 2b. Zdroje: proklik na snímek v ARON a fotka zápisu

Každý zdroj se signaturou (`"signatura": "141-4"`) a číslem snímku v `detail` (`"snímek 29"`, `"snímky 32 a 47"`, `"snímky 26–29"`) se v detailu osoby zobrazí jako:

- tlačítko **ARON snímek N ↗** — otevře přesně ten snímek v prohlížeči archivu,
- **náhled fotky** zápisu; klik otevře velkou verzi (lightbox) s odkazem do ARON.

Odkazy a náhledy jsou v `data/zdroje.json` a `img/zdroje/`. Doplňují se skriptem (z adresáře mapy):

```bash
# nová kniha (APU je v adrese knihy na aron.vychodoceskearchivy.cz/apu/<uuid>)
python3 scripts/aron-snimky.py kniha 96-15 89e9015b-d31a-4b96-8437-085cfa61151f
# pro všechny zdroje v rodokmen.json doplnit odkaz na snímek + náhled celé strany (stáhne snímek, když není na disku)
python3 scripts/aron-snimky.py doplnit
# lepší náhled: výřez jen příslušného zápisu (relativně 0–1: x0,y0,x1,y1 vůči celé straně)
python3 scripts/aron-snimky.py vyrez 141-4 29 0.05,0.10,0.94,0.29
# nebo hotový výřez z /workspace/rodokmen/vypisy
python3 scripts/aron-snimky.py vyrez-soubor 96-3 94 /workspace/rodokmen/vypisy/jirman-jan-1825-L.jpg
# zdroj bez „snímek N“ (např. „folio 71“) přiřadit ke snímku
python3 scripts/aron-snimky.py alias 13-9353 "folio 71" 77
```

Formát odkazu na snímek: `https://aron.vychodoceskearchivy.cz/apu/<APU>/dao/<DAO>/file/<id dlaždice>` — skript bere id souboru typu `TILE` s pořadím = číslo snímku (id typu `PUBLISHED` prohlížeč neotevře na správné straně).

Volitelná pole zdroje (rozšíření schématu), když je potřeba přebít automatiku:

| pole | význam |
|---|---|
| `snimek` | číslo snímku (nebo pole čísel), když není v `detail` |
| `url` | vlastní odkaz (https), přednost před automatickým |
| `image` / `image_full` | vlastní náhled / velká verze (cesta v repozitáři, např. `img/zdroje/…jpg`) |

**Rodinné dokumenty** (rodný a křestní list Gerdy, rodokmen Klimeš 2019, podklady a sdělení uživatele) se na veřejné mapě **nezobrazují jako fotky ani soubory** — obsahují žijící osoby. Ve zdroji zůstává jen text. Validátor hlásí chybu, kdyby měl takový zdroj `image`.

## 2a. Otevřené dotazy

Nejisté položky patří do `open_questions`:

```json
{
  "id": "q-priklad",
  "title": "Krátký název dotazu",
  "summary": "Jedna až dvě věty, co není jisté.",
  "details": "Souvislosti a co se nesmí sloučit.",
  "related_ids": ["id-osoby-v-mape"],
  "sources": [{ "label": "ARON", "signatura": "96-15", "detail": "snímek 32" }]
}
```

Pole `identifications` a `candidate_links` se v mapě už jako vazby nepoužívají pro nové případy; stejný obsah zapište jako otevřený dotaz. Po úpravě zkopírujte pole i do `data/otevrene-dotazy.json`.


Nic z domněnky nedoplňujte. Držte se ledgeru (`ROD-1.md`, `ROD-1-doplneni.md`).

## 3. Ověřit odkazy

Z adresáře mapy:

```bash
python3 scripts/validate-rodokmen.py
```

Skript nahlásí duplicitní id, odkazy na neexistující osoby a další rozbité vazby, chybějící náhledy/odkazy na snímky (upozornění) a obrázky u rodinných dokumentů (chyba). Chyby je třeba opravit před nasazením; upozornění (třeba číslo domu u žijící osoby) zkontrolujte ručně.

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

Skript ověří `data/rodokmen.json`, **nejdřív stáhne a začlení cizí změny z GitHubu** (`git pull --rebase --autostash`, nic nepřepisuje) a odešle změny na `main`. GitHub Pages se obvykle obnoví do minuty. Po nasazení zkontrolujte URL a to, že u žijících osob stále nejsou adresy ani čísla domů.

## 6. Jak se mapa kreslí (pro úpravy kódu)

`js/layout.js` skládá strom po generacích (řádek 0 = Štěpán, 1 = rodiče, …): manželé vedle sebe s uzlem páru (kroužek se srdcem), z uzlu jedna čára dolů na sběrnici a z ní ke každému dítěti; předci každého partnera nad ním, sourozenci předků s rodinami po straně. Bloky se skládají podle obrysů řádků, takže se karty nepřekrývají a čáry nevedou přes karty (kdyby mezi manžely ležela cizí karta, spojí je „závorka“ pod kartami). Přímá linie Štěpánových předků je zlatá; najetí nebo klik na osobu zvýrazní cestu ke Štěpánovi. Nové osoby stačí přidat do JSON — rozložení se přepočítá samo.

## 7. Mapa míst a statistika povolání

Kromě stromu jsou na webu dvě další stránky, které čtou stejný `data/rodokmen.json` (včetně nepřipojených větví):

- `mapa.html` — zeměpisná mapa událostí (Leaflet + OpenStreetMap). Souřadnice obcí jsou v `data/mista.json`. Novou obec doplňte tam (souřadnice z Wikidata P625 nebo Nominatim, se zdrojem). Nejistá nebo nezamčená místa se na mapu jako bod nedávají.
- `povolani.html` — statistika živností. Kategorie a české vysvětlení jsou v `data/povolani-kategorie.json`. Původní formulace z matriky se nemění.

U žijících osob mapa ukazuje jen obec, nikdy číslo domu. Události a povolání se skládají v prohlížeči z dat, takže nová osoba v `rodokmen.json` se na obou stránkách objeví sama, pokud její obec už je v `mista.json`.

## Kniha (`kniha.html`)

`kniha.html` je rodinná kronika v první osobě (vypravěč Štěpán) jako listovací kniha, `kniha-text.html` je tatáž kniha jako jedna textová stránka. Text kapitol je v `data/kniha/NN-nazev.md`, struktura v `data/kniha/kniha.json`. Značky a postup jsou popsané v `data/kniha/README.md`. Po každém kole hledání stačí dopsat odstavec do příslušné kapitoly (fakta s poznámkou `[^sig/snímek: …]`, domněnky jako `> Domněnka: …`) a spustit `python3 scripts/kniha-kontrola.py`. Rámečky kapitol, generace, retro mapky (II. vojenské mapování) a otevřené otázky se počítají z dat samy.
