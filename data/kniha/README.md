# Kniha „Kde jsme žili“: jak ji doplňovat

Kniha má dvě podoby, obě se vykreslují ze souborů v této složce:

- `kniha.html` je listovací kniha: otevřená dvoustrana přes celou obrazovku, otáčení listů (StPageFlip, `js/vendor/page-flip-2.0.7.browser.js`), kožené desky a obsah s čísly stran. Stránky se rozdělují automaticky podle výšky okna (`js/kniha-listovani.js`), takže po doplnění textu se nic ručně nestránkuje.
- `kniha-text.html` je klasická textová verze na jednu dlouhou stránku (`js/kniha.js`, `css/kniha.css`).

Obě verze čtou tyto soubory:

- `kniha.json` určuje strukturu: díly, kapitoly, jejich pořadí, nadpisy, podtituly, rody, období a seznam osob (`people`).
- `NN-nazev.md` obsahuje text kapitoly. Píše se v první osobě, vypravěčem je Štěpán.

Rámeček kapitoly („Rody / Místa / Období / Vztah ke mně“), retro mapka, seznam otevřených otázek a číslování poznámek se **počítají automaticky** z `data/rodokmen.json`, `data/mista.json` a `data/zdroje.json`. Po novém kole hledání proto stačí doplnit text a nové osoby se objeví na mapě samy.

## Pravidla obsahu

1. **Fakta jen z dat.** Každé tvrzení o osobě musí mít oporu v zápisu, ideálně s poznámkou `[^sig/snímek: …]`.
2. **Domněnky** se píšou zvlášť jako blok `> Domněnka: …` a jazykem „Domnívám se…“ nebo „Možná…“.
3. **Žijící osoby:** jen jméno a rok, žádné adresy ani čísla domů.
4. **Rodinné dokumenty** (Gerdin křestní list, Klimešův rodokmen 2019) se jen zmiňují, nikdy se nevkládají jako obrázek.
5. **Srovnání s mým životem** jen střídmě. Ze svého života používám jen tohle: mám dvě děti, Jakuba a Magdalenu, a prostě mě zajímá náš původ. Povolání ani zaměstnavatele neuvádět.

## Značky v textu

| Zápis | Výsledek |
|---|---|
| `[[frantisek-klimes-1857]]` | odkaz na osobu (`index.html#id`), text je jméno z dat |
| `[[frantisek-klimes-1857\|František]]` | odkaz na osobu s vlastním textem |
| `[^53-52/12: svatba 13. 2. 1809]` | číslovaná poznámka s odkazem do ARONu a na velký snímek (klíč `sig\|snímek` v `zdroje.json`) |
| `[^Rodinná paměť, 2026.]` | poznámka čistým textem |
| `![53-52/12] Popisek` | samostatný řádek: obrázek (výřez matriky z `img/zdroje`) s popiskem a odkazem do ARONu |
| `> Domněnka: text` | vizuálně odlišená domněnka (na širokém displeji na okraji) |
| `[?q-jan-jirmann-ns24]` | štítek „otevřená otázka“ s odkazem na seznam otázek kapitoly |
| `## Nadpis`, `### Podnadpis`, `- odrážka`, `---` (ornament), `**tučně**`, `*kurzíva*`, `[text](url)` | běžné formátování |

## Postup po kole hledání

1. Doplň osoby a zdroje do `data/*.json` (to dělá hledání, ne kniha).
2. Do příslušné kapitoly `.md` dopiš odstavec s poznámkou. Novou osobu přidej do `people` v `kniha.json`, aby ovlivnila mapku a generace.
3. Nová větev = nový soubor `NN-nazev.md` + položka v `kniha.json` (`id`, `file`, `title`, `lead`, `rody`, `obdobi`, `people`; volitelně `map: false`, `places_text`, `numbered: false`, `no_label`).
4. Potvrzenou domněnku přepiš na fakt s poznámkou. Vyvrácenou smaž.
5. Uprav `updated` v `kniha.json`.
6. Spusť `python3 scripts/kniha-kontrola.py`. Kontroluje id osob, otevřené otázky, klíče snímků a existenci obrázků.
7. Commitni jen soubory knihy (`git add data/kniha …`), pak `git pull --rebase` a `git push`.

Mapka používá II. vojenské mapování 1836–1852 (WMS CENIA, S-JTSK přes Proj4Leaflet). Když se dlaždice nenačtou, přepne se na OSM se sépiovým filtrem.
