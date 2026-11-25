/* Společné čtení rodokmenu pro mapu míst a statistiku povolání.
   Nic se nedomýšlí: jen údaje ze strukturovaných polí (+ výslovné
   „žil v …“ / „Bydliště …“ v poznámkách, pokud obec je v mista.json). */
(function (global) {
  "use strict";

  const EVENT_TYPES = {
    narozeni: { label: "Narození", color: "#2f6b4a", short: "N" },
    krest: { label: "Křest", color: "#3d7a8a", short: "K" },
    snatek: { label: "Sňatek", color: "#a8453a", short: "S" },
    umrti: { label: "Úmrtí", color: "#4a443a", short: "Ú" },
    bydliste: { label: "Bydliště", color: "#1f4e5c", short: "B" },
    povolani: { label: "Povolání v místě", color: "#9a6b16", short: "P" },
    puvod: { label: "Původ / příslušnost", color: "#6b4c7a", short: "Př" }
  };

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function fold(s) {
    return String(s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ß/g, "ss")
      .toLowerCase();
  }

  function allPeople(data) {
    const out = data.people ? data.people.slice() : [];
    for (const b of data.unattached_branches || []) out.push(...(b.people || []));
    return out;
  }

  function allUnions(data) {
    const out = data.unions ? data.unions.slice() : [];
    for (const b of data.unattached_branches || []) out.push(...(b.unions || []));
    return out;
  }

  function unattachedIdSet(data) {
    const s = new Set();
    for (const b of data.unattached_branches || []) {
      for (const p of b.people || []) s.add(p.id);
    }
    return s;
  }

  function yearOf(ev) {
    if (!ev) return null;
    if (ev.date && /^\d{4}/.test(ev.date)) return +ev.date.slice(0, 4);
    const m = String(ev.display || ev.note || "").match(/(1[5-9]\d{2}|20\d{2})/);
    return m ? +m[1] : null;
  }

  function yearsInText(s) {
    const out = [];
    const re = /\b(1[5-9]\d{2}|20\d{2})\b/g;
    let m;
    while ((m = re.exec(String(s || "")))) out.push(+m[1]);
    return out;
  }

  function stripHouseNo(s) {
    return String(s || "")
      .replace(/\s*č\.?\s*p\.?\s*\d+([–-]\w+)?/gi, "")
      .replace(/\s*č\.\s*\d+([–-]\w+)?/gi, "")
      .replace(/\s+\d+\s*$/g, "")
      .replace(/\s+\d+(?=\s*[,;(]|$)/g, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function isUncertainRaw(raw, rules) {
    const s = String(raw || "");
    for (const r of rules || []) {
      if (r.id === "lhota-bez-privlastku") continue;
      try {
        if (new RegExp(r.pattern, "i").test(s)) return r;
      } catch (e) { /* ignore bad rule */ }
    }
    return null;
  }

  function aliasBoundary(textFold, aliasFold, at) {
    const after = at + aliasFold.length;
    const beforeOk = at === 0 || !/[a-z0-9]/.test(textFold[at - 1]);
    const afterOk = after === textFold.length || !/[a-z0-9]/.test(textFold[after]);
    return beforeOk && afterOk;
  }

  function compileGazetteer(mista) {
    const places = (mista.places || []).map((p) => ({
      ...p,
      aliasesFold: (p.aliases || [p.name]).map((a) => ({ raw: a, fold: fold(a) }))
        .sort((a, b) => b.fold.length - a.fold.length)
    }));
    const byId = new Map(places.map((p) => [p.id, p]));
    const aliasList = [];
    for (const p of places) {
      for (const a of p.aliasesFold) aliasList.push({ place: p, ...a });
    }
    aliasList.sort((a, b) => b.fold.length - a.fold.length);
    return { places, byId, aliasList, unplacedRules: mista.unplaced_rules || [] };
  }

  function declineCandidates(text) {
    const s = String(text || "").trim();
    if (!s) return [];
    const out = [s];
    const add = (x) => { if (x && !out.includes(x)) out.push(x); };
    // běžné tvary v zápisech: v Broumově, do Ruprechtic, z Rožmitálu, v Nízké Srbské
    if (/ově$/.test(s)) add(s.replace(/ově$/, "ov"));
    if (/ě$/.test(s)) add(s.replace(/ě$/, ""));
    if (/ích$/.test(s)) { add(s.replace(/ích$/, "e")); add(s.replace(/ích$/, "a")); }
    if (/ách$/.test(s)) { add(s.replace(/ách$/, "y")); add(s.replace(/ách$/, "a")); }
    if (/ic$/.test(s) && !/ice$/.test(s)) add(s + "e");
    if (/u$/.test(s)) add(s.replace(/u$/, ""));
    if (/á$/.test(s)) add(s.replace(/á$/, "a"));
    return out;
  }

  function matchPlaceName(text, gaz) {
    const f = fold(text);
    if (!f) return null;
    for (const a of gaz.aliasList) {
      let from = 0;
      while (from <= f.length - a.fold.length) {
        const at = f.indexOf(a.fold, from);
        if (at < 0) break;
        if (aliasBoundary(f, a.fold, at)) return a.place;
        from = at + 1;
      }
    }
    return null;
  }

  function cleanForMatch(raw) {
    let s = String(raw || "").trim();
    s = s.replace(/^(příslušn[áý]\s+do|původ\s+z|z)\s+/i, "");
    // kostel …, Obec  /  Obec, kostel …
    s = s.replace(/^kostel\s+sv\.\s*[^,]+,\s*/i, "");
    s = s.replace(/,\s*kostel\s+sv\.\s*.+$/i, "");
    // odříznout faru, panství, okres, hrabství, „ženich z…“ za čárkou
    s = s.replace(/,\s*(fara|panství|okres|okr\.|hrabství|dům|ženich)\b[\s\S]*$/i, "");
    // závorky, které nejsou alternativním názvem, drop
    s = s.replace(/\(\s*(narození|bydliště[^)]*|rodiče[^)]*|otec[^)]*|matka[^)]*|manžel[^)]*|první manžel[^)]*|sňatek[^)]*|děti[^)]*|původ[^)]*|index|oddací kniha[^)]*|fara[^)]*|panství[^)]*|roky?[^)]*|†[^)]*|[12]\d{3}[^)]*)\s*\)/gi, " ");
    // roky v závorce typu (1799, 1808)
    s = s.replace(/\(\s*[\d,–\-/\s]+\s*\)/g, " ");
    s = stripHouseNo(s);
    s = s.replace(/[.,;]+$/g, "").replace(/\s{2,}/g, " ").trim();
    return s;
  }

  function classifyKindFromRaw(raw) {
    const s = String(raw || "").toLowerCase();
    if (/(příslušn[áý]\s+do|původ\s+z|\(původ\))/.test(s)) return "puvod";
    if (/\bnarození\b/.test(s)) return "narozeni";
    if (/\bsňatek\b/.test(s)) return "snatek";
    if (/\bbydliště\b/.test(s)) return "bydliste";
    return "bydliste";
  }

  function isRelativeOnlyPlace(raw) {
    const s = String(raw || "").toLowerCase();
    // místo rodičů / otce / matky / manžela není událost této osoby
    if (/\(\s*(rodiče|otec|matka|manžel|první manžel)\b/.test(s)) return true;
    if (/\b(otec|matka|rodiče)\s*$/.test(s)) return true;
    return false;
  }

  function resolvePlace(raw, gaz) {
    const original = String(raw || "").trim();
    if (!original) return { status: "empty" };
    const unc = isUncertainRaw(original, gaz.unplacedRules);
    if (unc) return { status: "unplaced", reason: unc.reason, rule: unc.id, original };
    const cleaned = cleanForMatch(original);
    let place = matchPlaceName(cleaned, gaz) || matchPlaceName(original, gaz);
    if (!place) {
      for (const cand of declineCandidates(cleaned)) {
        place = matchPlaceName(cand, gaz);
        if (place) break;
      }
    }
    if (place) return { status: "ok", place, original, cleaned };
    // Lhota bez přívlastku
    const core = fold(cleaned);
    if (/^lhota\b/.test(core) && !/nachodska/.test(core)) {
      const rule = (gaz.unplacedRules || []).find((r) => r.id === "lhota-bez-privlastku");
      return { status: "unplaced", reason: (rule && rule.reason) || "Lhota bez přívlastku.", rule: "lhota-bez-privlastku", original };
    }
    return { status: "unknown", original, cleaned };
  }

  function publicPlaceLabel(raw, living) {
    if (living) return stripHouseNo(raw);
    return String(raw || "").trim();
  }

  function personLink(id) {
    return "./index.html#" + encodeURIComponent(id);
  }

  function pushEvent(events, ev) {
    if (!ev || !ev.placeId) return;
    events.push(ev);
  }

  function extractNoteResidences(person, gaz) {
    const out = [];
    const texts = [];
    const b = person.birth;
    if (b && b.note) texts.push(b.note);
    for (const n of person.notes || []) texts.push(n);
    const reZil = /žil[ai]?\s+v\s+([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][A-Za-záčďéěíňóřšťúůýž ]+?)(?:\.|$|;|,)/gi;
    const reBydl = /bydliště(?:\s+podle\s+rodokmenu)?\s*:\s*([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ][A-Za-záčďéěíňóřšťúůýž ]+)/gi;
    for (const t of texts) {
      let m;
      reZil.lastIndex = 0;
      while ((m = reZil.exec(t))) out.push(m[1].trim());
      reBydl.lastIndex = 0;
      while ((m = reBydl.exec(t))) out.push(m[1].trim());
    }
    return out;
  }

  // Povolání: „Pozice, Obec č. N (rok)“ nebo „Pozice v Obci“
  function extractOccupationPlaces(occ, gaz) {
    const found = [];
    if (!occ) return found;
    const chunks = String(occ).split(/[;./](?=\s)/);
    // also try the whole string
    const parts = chunks.length ? chunks : [occ];
    for (const chunk of parts) {
      const res = resolvePlace(chunk, gaz);
      if (res.status !== "ok") continue;
      const ys = yearsInText(chunk);
      found.push({
        place: res.place,
        original: chunk.trim(),
        year: ys.length ? ys[ys.length - 1] : null,
        years: ys
      });
    }
    return found;
  }

  function eventKey(e) {
    return [e.personId, e.type, e.placeId, e.year || "", e.label].join("|");
  }

  function extractEvents(data, mista) {
    const gaz = compileGazetteer(mista);
    const events = [];
    const unplaced = [];
    const seenUnplaced = new Set();
    const people = allPeople(data);
    const unions = allUnions(data);
    const unatt = unattachedIdSet(data);
    const byId = new Map(people.map((p) => [p.id, p]));

    function noteUnresolved(raw, person, typ, extra) {
      const res = resolvePlace(raw, gaz);
      if (res.status === "ok" || res.status === "empty") return res;
      const key = (res.status || "") + "|" + raw + "|" + (person && person.id) + "|" + typ;
      if (!seenUnplaced.has(key)) {
        seenUnplaced.add(key);
        unplaced.push({
          original: raw,
          reason: res.reason || "Obec se nepodařilo bezpečně ztotožnit se seznamem míst.",
          status: res.status,
          personId: person && person.id,
          personName: person && person.name,
          type: typ,
          extra: extra || null
        });
      }
      return res;
    }

    function addResolved(person, typ, raw, year, display, extra) {
      if (!raw) return;
      if (isRelativeOnlyPlace(raw)) return;
      const res = noteUnresolved(raw, person, typ, extra);
      if (res.status !== "ok") return;
      const living = !!person.living;
      pushEvent(events, {
        type: typ,
        placeId: res.place.id,
        placeName: res.place.name,
        lat: res.place.lat,
        lon: res.place.lon,
        country: res.place.country,
        personId: person.id,
        personName: person.name,
        maiden: person.maiden || null,
        branch: person.branch || null,
        living,
        unattached: unatt.has(person.id),
        year: year || null,
        dateDisplay: display || null,
        placeLabel: publicPlaceLabel(raw, living),
        original: living ? publicPlaceLabel(raw, true) : String(raw).trim()
      });
    }

    for (const p of people) {
      const b = p.birth;
      if (b && b.place) addResolved(p, "narozeni", b.place, yearOf(b), b.display);
      const ba = p.baptism;
      if (ba && ba.place) addResolved(p, "krest", ba.place, yearOf(ba), ba.display);
      const dth = p.death;
      if (dth && dth.place) addResolved(p, "umrti", dth.place, yearOf(dth), dth.display);

      for (const pl of p.places || []) {
        if (isRelativeOnlyPlace(pl)) continue;
        const typ = classifyKindFromRaw(pl);
        const ys = yearsInText(pl);
        // narození/sňatek v poli places, pokud už máme stejné z birth/married, pořád můžeme ukázat jako bydliště?
        // Pokud typ je narozeni a už máme birth.place ve stejném místě, přeskočíme duplicitu později.
        addResolved(p, typ === "narozeni" || typ === "snatek" || typ === "puvod" ? typ : "bydliste", pl, ys[0] || yearOf(p.birth), ys[0] ? String(ys[0]) : null);
      }

      for (const np of extractNoteResidences(p, gaz)) {
        addResolved(p, "bydliste", np, null, null, "poznamka");
      }

      if (p.occupation && JOB_HINT.test(p.occupation)) {
        for (const op of extractOccupationPlaces(p.occupation, gaz)) {
          pushEvent(events, {
            type: "povolani",
            placeId: op.place.id,
            placeName: op.place.name,
            lat: op.place.lat,
            lon: op.place.lon,
            country: op.place.country,
            personId: p.id,
            personName: p.name,
            maiden: p.maiden || null,
            branch: p.branch || null,
            living: !!p.living,
            unattached: unatt.has(p.id),
            year: op.year,
            dateDisplay: op.year ? String(op.year) : null,
            placeLabel: publicPlaceLabel(op.original, !!p.living),
            original: publicPlaceLabel(op.original, !!p.living),
            occupationSnippet: p.living ? null : op.original.trim()
          });
        }
      }
    }

    for (const u of unions) {
      const married = u.married || (u.date && typeof u.date === "object" ? u.date : null);
      if (!married || !married.place) continue;
      const y = yearOf(married);
      const partners = (u.partners || []).map((id) => byId.get(id)).filter(Boolean);
      const raw = married.place;
      // neurčité místo sňatku (Broumovsko) — zapiš k unplaced jednou, bez osobního bodu
      const res = resolvePlace(raw, gaz);
      if (res.status !== "ok") {
        noteUnresolved(raw, partners[0] || { id: u.id, name: "sňatek " + u.id }, "snatek");
        continue;
      }
      const who = partners.length ? partners : [{ id: u.id, name: "Svazek", living: false, branch: null }];
      for (const p of who) {
        const living = !!p.living;
        pushEvent(events, {
          type: "snatek",
          placeId: res.place.id,
          placeName: res.place.name,
          lat: res.place.lat,
          lon: res.place.lon,
          country: res.place.country,
          personId: p.id,
          personName: p.name,
          maiden: p.maiden || null,
          branch: p.branch || null,
          living,
          unattached: unatt.has(p.id),
          year: y,
          dateDisplay: married.display || null,
          placeLabel: publicPlaceLabel(raw, living),
          original: living ? publicPlaceLabel(raw, true) : String(raw).trim(),
          unionId: u.id,
          partnerIds: u.partners || []
        });
      }
    }

    // dedup
    const uniq = [];
    const keys = new Set();
    for (const e of events) {
      const k = eventKey(e);
      if (keys.has(k)) continue;
      keys.add(k);
      uniq.push(e);
    }

    return { events: uniq, unplaced, gazetteer: gaz };
  }

  const JOB_HINT = /\b(tkadlec|chalupník|podruh|sedlák|rolník|krejčí|dělník|dělnice|výměnkář|nádeník|zahradník|obuvník|tesař|truhlář|vochlář|rychtář|měšťan|průvodčí|záložník|weber|häusler|inwohner|inmann|textor|schneider|civis|bauer)\b/i;

  function isFamilyOnlyOccupation(text) {
    const s = String(text || "").trim();
    if (!s) return false;
    if (/^(manželka|dcera|syn|manžel)\b/i.test(s) && !JOB_HINT.test(s.slice(0, 60))) return true;
    if (/^v roce \d{4} vdova\b/i.test(s) && !JOB_HINT.test(s)) return true;
    return false;
  }

  function matchCategories(text, catalog) {
    const cats = catalog.categories || [];
    const folded = fold(text);
    const hits = [];
    for (const c of cats) {
      if (c.id === "neuvedeno" || c.id === "rodina") continue;
      for (const pat of c.patterns || []) {
        const pf = fold(pat);
        if (pf && folded.includes(pf)) {
          hits.push(c);
          break;
        }
      }
    }
    return hits;
  }

  function classifyOccupation(person, catalog) {
    const raw = person.occupation;
    if (raw == null || String(raw).trim() === "") {
      return {
        person,
        raw: null,
        categories: [{ id: "neuvedeno", label: "Neuvedeno", notJob: true, explain: "V datech u této osoby pole povolání chybí." }],
        jobs: [],
        kind: "neuvedeno"
      };
    }
    const hits = matchCategories(raw, catalog);
    const jobs = hits.filter((c) => !c.notJob);
    const status = hits.filter((c) => c.notJob);
    if (jobs.length) {
      return { person, raw, categories: jobs.concat(status), jobs, kind: "povolani" };
    }
    if (status.length) {
      return { person, raw, categories: status, jobs: [], kind: "status" };
    }
    if (isFamilyOnlyOccupation(raw)) {
      const rod = (catalog.categories || []).find((c) => c.id === "rodina");
      return { person, raw, categories: [rod || { id: "rodina", label: "Jen údaj o rodině", notJob: true }], jobs: [], kind: "rodina" };
    }
    // text je, ale nepasuje na vzory — pořád ho ukážeme jako nezařazené znění, ne jako vymyšlenou kategorii
    return {
      person,
      raw,
      categories: [{ id: "jine", label: "Jiné / nezařazené znění", notJob: false, explain: "Znění z dat se nepodařilo zařadit do připravených kategorií; původní formulace zůstává." }],
      jobs: [{ id: "jine", label: "Jiné / nezařazené znění", notJob: false }],
      kind: "jine"
    };
  }

  function extractOccupations(data, catalog) {
    const people = allPeople(data);
    const unatt = unattachedIdSet(data);
    const rows = people.map((p) => {
      const r = classifyOccupation(p, catalog);
      r.unattached = unatt.has(p.id);
      r.branch = p.branch || null;
      r.living = !!p.living;
      r.birthYear = yearOf(p.birth);
      const ys = yearsInText(p.occupation);
      r.occYears = ys;
      r.century = r.birthYear ? Math.floor(r.birthYear / 100) * 100 : (ys[0] ? Math.floor(ys[0] / 100) * 100 : null);
      return r;
    });
    return rows;
  }

  function navHtml(active) {
    const items = [
      { href: "./index.html", id: "rodokmen", label: "Rodokmen" },
      { href: "./mapa.html", id: "mapa", label: "Mapa míst" },
      { href: "./povolani.html", id: "povolani", label: "Povolání" }
    ];
    return `<nav class="sitenav" aria-label="Sekce webu">${items.map((it) =>
      `<a href="${it.href}"${it.id === active ? ' class="is-active" aria-current="page"' : ""}>${esc(it.label)}</a>`
    ).join("")}</nav>`;
  }

  global.RodokmenMista = {
    EVENT_TYPES,
    esc,
    fold,
    allPeople,
    allUnions,
    yearOf,
    yearsInText,
    stripHouseNo,
    compileGazetteer,
    resolvePlace,
    publicPlaceLabel,
    personLink,
    extractEvents,
    extractOccupations,
    classifyOccupation,
    navHtml
  };
})(window);
