/* Rodinná kronika – vykreslení knihy z data/kniha/kniha.json a kapitol data/kniha/*.md.
   Text kapitol píše člověk; skript jen doplní odkazy na osoby, poznámky s prameny (ARON),
   ilustrace z img/zdroje, generace vůči Štěpánovi a mapku míst kapitoly.
   Značky v .md: viz data/kniha/README.md. */
(function () {
  "use strict";
  const R = window.RodokmenMista;
  const esc = R.esc;
  const $ = (s, el = document) => el.querySelector(s);

  const S = { data: null, zdroje: null, mista: null, kniha: null, people: new Map(),
    gen: new Map(), questions: new Map(), events: [] };

  /* ---------- generace vůči Štěpánovi ---------- */
  function computeGenerations() {
    const parents = new Map();
    for (const u of R.allUnions(S.data)) {
      for (const c of u.children || []) {
        if (!parents.has(c)) parents.set(c, []);
        parents.get(c).push(...(u.partners || []));
      }
    }
    const focus = S.data.meta.focus;
    const q = [[focus, 0]];
    S.gen.set(focus, 0);
    while (q.length) {
      const [id, g] = q.shift();
      for (const p of parents.get(id) || []) {
        if (!S.gen.has(p)) { S.gen.set(p, g + 1); q.push([p, g + 1]); }
      }
    }
  }
  function genWord(g) {
    if (g === 1) return "rodiče";
    if (g === 2) return "prarodiče";
    if (g <= 6) return "pra".repeat(g - 2) + "rodiče";
    return `předkové v ${g}. generaci`;
  }

  /* ---------- prameny ---------- */
  function snimek(sig, n) {
    const key = `${sig}|${n}`;
    return (S.zdroje.snimky || {})[key] || null;
  }
  function bookUrl(sig) {
    const k = (S.zdroje.knihy || {})[sig];
    return k ? k.url : null;
  }

  /* ---------- inline značky ---------- */
  function inline(text, ctx) {
    let s = esc(text);
    // [[id|text]] nebo [[id]]
    s = s.replace(/\[\[([a-z0-9-]+)(?:\|([^\]]+))?\]\]/g, (m, id, label) => {
      const p = S.people.get(id);
      if (!p) return label || id;
      ctx.people.add(id);
      return `<a class="kn-person" href="./index.html#${encodeURIComponent(id)}" title="${esc(p.name)} – otevřít ve stromu">${label || esc(p.name)}</a>`;
    });
    // [?q-id] otevřená otázka
    s = s.replace(/\[\?([a-z0-9-]+)\]/g, (m, id) => {
      const q = S.questions.get(id);
      ctx.questions.add(id);
      return `<a class="kn-q" href="#oq-${ctx.chapter}-${id}" title="${esc(q ? q.title : id)}">otevřená otázka</a>`;
    });
    // [^sig/snimek: popis] | [^text]
    s = s.replace(/\[\^([^\]]+)\]/g, (m, body) => {
      const raw = body.replace(/&quot;/g, '"');
      return footRef(raw, ctx);
    });
    // [text](url)
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\.\/[^)\s]+)\)/g,
      (m, t, u) => `<a href="${u}"${u.startsWith("http") ? ' target="_blank" rel="noopener"' : ""}>${t}</a>`);
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, "$1<em>$2</em>");
    return s;
  }

  function footRef(raw, ctx) {
    const m = raw.match(/^([0-9A-Za-z-]+)\/(\d+)(?::\s*([\s\S]*))?$/);
    let key, html;
    if (m) {
      const [, sig, n, desc] = m;
      key = `${sig}|${n}`;
      const sn = snimek(sig, n);
      const url = sn ? sn.url : bookUrl(sig);
      html = `${desc ? esc(desc) + ". " : ""}SOA Zámrsk, sbírka matrik, sign. ${esc(sig)}, snímek ${esc(n)}.` +
        (url ? ` <a href="${url}" target="_blank" rel="noopener">${String(url).includes("archium.tsdial") ? "ЦДІАЛ" : "ARON"} ↗</a>` : "") +
        (sn && sn.velky ? ` · <a href="./${sn.velky}" target="_blank" rel="noopener">snímek zápisu</a>` : "");
    } else {
      key = "t|" + raw;
      html = esc(raw);
    }
    let idx = ctx.notes.findIndex((x) => x.key === key);
    if (idx < 0) { ctx.notes.push({ key, html }); idx = ctx.notes.length - 1; }
    const n = idx + 1;
    return `<sup class="kn-fn"><a href="#fn-${ctx.chapter}-${n}" id="fr-${ctx.chapter}-${n}-${ctx.refc++}" aria-label="poznámka ${n}">${n}</a></sup>`;
  }

  function figure(sig, n, caption, ctx) {
    const sn = snimek(sig, n);
    if (!sn) return "";
    ctx.figs++;
    const cap = inline(caption || "", ctx);
    return `<figure class="kn-fig">
      <a href="./${esc(sn.velky || sn.nahled)}" target="_blank" rel="noopener" title="Zvětšit snímek zápisu">
        <img src="./${esc(sn.nahled)}" alt="Výřez matričního zápisu: ${esc(caption || sig)}" loading="lazy"></a>
      <figcaption><span class="kn-fig-no">Obr. ${ctx.chapterNo}.${ctx.figs}</span> ${cap}
        <span class="kn-fig-src">Sign. ${esc(sig)}, snímek ${esc(n)} · <a href="${esc(sn.url)}" target="_blank" rel="noopener">otevřít v ${String(sn.url).includes("archium.tsdial") ? "ЦДІАЛ" : "ARON"} ↗</a></span></figcaption>
    </figure>`;
  }

  /* ---------- bloky ---------- */
  function renderMd(md, ctx) {
    const lines = md.replace(/\r/g, "").split("\n");
    const out = [];
    let para = [], list = [], aside = null;
    const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(" "), ctx)}</p>`); para = []; } };
    const flushList = () => { if (list.length) { out.push(`<ul>${list.map((l) => `<li>${inline(l, ctx)}</li>`).join("")}</ul>`); list = []; } };
    const flushAside = () => {
      if (aside) {
        const body = aside.join(" ").replace(/^Domněnka:\s*/i, "");
        out.push(`<aside class="kn-guess" role="note"><span class="kn-guess-tag">Domněnka</span><p>${inline(body, ctx)}</p></aside>`);
        aside = null;
      }
    };
    const flushAll = () => { flushPara(); flushList(); flushAside(); };
    for (const line of lines) {
      const t = line.trim();
      if (!t) { flushAll(); continue; }
      let m;
      if ((m = t.match(/^(#{2,3})\s+(.*)$/))) {
        flushAll();
        const lvl = m[1].length === 2 ? "h3" : "h4";
        out.push(`<${lvl} class="kn-sub">${inline(m[2], ctx)}</${lvl}>`);
      } else if ((m = t.match(/^!\[([0-9A-Za-z-]+)\/(\d+)\]\s*(.*)$/))) {
        flushAll();
        out.push(figure(m[1], m[2], m[3], ctx));
      } else if (t.startsWith(">")) {
        flushPara(); flushList();
        if (!aside) aside = [];
        aside.push(t.replace(/^>\s?/, ""));
      } else if (t === "---") {
        flushAll();
        out.push('<div class="kn-orn" aria-hidden="true">❦</div>');
      } else if ((m = t.match(/^[-–]\s+(.*)$/))) {
        flushPara(); flushAside();
        list.push(m[1]);
      } else {
        flushList(); flushAside();
        para.push(t);
      }
    }
    flushAll();
    return out.join("\n");
  }

  /* ---------- mapy ---------- */
  const JTSK = "+proj=krovak +lat_0=49.5 +lon_0=24.83333333333333 +alpha=30.28813972222222 +k=0.9999 +x_0=0 +y_0=0 +ellps=bessel +towgs84=589,76,494,0,0,0,0 +units=m +no_defs";
  const RES = [1024.128, 512.064, 256.032, 128.016, 64.008, 32.004, 16.002, 8.001, 4.0005, 2.00025, 1.000125, 0.5000625, 0.25003125];
  let crs5514 = null;
  function getCrs() {
    if (!crs5514 && window.L && L.Proj) {
      crs5514 = new L.Proj.CRS("EPSG:5514", JTSK, {
        resolutions: RES, origin: [-925000, -920000],
        bounds: L.bounds([-925000, -1444353.536], [-400646.464, -920000])
      });
    }
    return crs5514;
  }
  const ATTR_HIST = 'II. vojenské mapování 1836–1852 © Österreichisches Staatsarchiv/Kriegsarchiv, © Laboratoř geoinformatiky UJEP, © MŽP ČR (služba <a href="https://geoportal.gov.cz" target="_blank" rel="noopener">CENIA</a>)';

  function chapterPoints(ids) {
    const set = new Set(ids);
    const m = new Map();
    for (const e of S.events) {
      if (!set.has(e.personId) || e.living) continue;
      if (e.country && e.country !== "CZ") continue;
      if (!m.has(e.placeId)) m.set(e.placeId, { id: e.placeId, name: e.placeName, lat: e.lat, lon: e.lon, evs: [] });
      m.get(e.placeId).evs.push(e);
    }
    return [...m.values()];
  }
  function popupHtml(g) {
    const seen = new Set();
    const rows = [];
    for (const e of g.evs.sort((a, b) => (a.year || 9999) - (b.year || 9999))) {
      const k = e.personId + e.type + (e.year || "");
      if (seen.has(k)) continue; seen.add(k);
      const t = (R.EVENT_TYPES[e.type] || {}).label || e.type;
      rows.push(`<li><a href="./index.html#${encodeURIComponent(e.personId)}">${esc(e.personName)}</a> – ${esc(t.toLowerCase())}${e.year ? " " + e.year : ""}</li>`);
    }
    return `<div class="kn-pop"><strong>${esc(g.name)}</strong><ul>${rows.slice(0, 12).join("")}${rows.length > 12 ? `<li>… a dalších ${rows.length - 12}</li>` : ""}</ul>
      <a href="./mapa.html#misto=${encodeURIComponent(g.id)}">Na velké mapě míst →</a></div>`;
  }

  function buildMap(el, points, fallback) {
    el.innerHTML = "";
    const useHist = !fallback && getCrs();
    const map = L.map(el, {
      crs: useHist ? getCrs() : L.CRS.EPSG3857,
      scrollWheelZoom: false, zoomControl: true, attributionControl: true,
      dragging: !el.closest(".fb-root"), tap: false
    });
    el.classList.toggle("kn-map-fallback", !useHist);
    let layer;
    if (useHist) {
      layer = L.tileLayer.wms("https://gis.cenia.cz/mapcache/II_vojenske_mapovani/wms", {
        layers: "II_vojenske_mapovani", format: "image/jpeg", version: "1.1.1", styles: "",
        tileSize: 256, attribution: ATTR_HIST, maxZoom: 9, minZoom: 2
      });
      let ok = 0, bad = 0;
      layer.on("tileload", () => { ok++; el.dataset.tiles = "hist-ok"; });
      layer.on("tileerror", () => {
        bad++;
        if (bad >= 4 && ok === 0 && !el.dataset.fell) {
          el.dataset.fell = "1";
          map.remove();
          buildMap(el, points, true);
        }
      });
    } else {
      layer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 15, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> (tónováno do sépie)'
      });
      layer.on("tileload", () => { el.dataset.tiles = "osm-ok"; });
    }
    layer.addTo(map);
    const latlngs = [];
    for (const g of points) {
      const icon = L.divIcon({ className: "kn-pin-wrap", html: '<span class="kn-pin"></span>', iconSize: [14, 14], iconAnchor: [7, 7] });
      const mk = L.marker([g.lat, g.lon], { icon, title: g.name }).addTo(map);
      mk.bindTooltip(esc(g.name), { permanent: true, direction: "right", offset: [6, 0], className: "kn-label" });
      mk.bindPopup(popupHtml(g), { maxWidth: 280 });
      latlngs.push([g.lat, g.lon]);
    }
    if (latlngs.length) {
      const b = L.latLngBounds(latlngs);
      map.fitBounds(b.pad(latlngs.length > 1 ? 0.25 : 0), { maxZoom: useHist ? 6 : 12 });
      if (latlngs.length === 1) map.setView(latlngs[0], useHist ? 6 : 12);
    } else {
      map.setView([50.45, 16.25], useHist ? 3 : 9);
    }
    el._map = map;
  }

  function initMap(el) {
    if (el.dataset.ready) return;
    el.dataset.ready = "1";
    const ids = el.dataset.ids.split(",").filter(Boolean);
    const pts = chapterPoints(ids);
    if (!pts.length) { el.closest(".kn-mapbox").hidden = true; return; }
    buildMap(el, pts, false);
  }
  function lazyMaps() {
    const els = [...document.querySelectorAll(".kn-map[data-ids]")];
    const init = initMap;
    if (!("IntersectionObserver" in window)) { els.forEach(init); return; }
    const io = new IntersectionObserver((ents) => {
      for (const en of ents) if (en.isIntersecting) { init(en.target); io.unobserve(en.target); }
    }, { rootMargin: "300px 0px" });
    els.forEach((el) => io.observe(el));
  }

  /* ---------- kapitoly ---------- */
  function placeNamesFor(ids) {
    return chapterPoints(ids).map((g) => g.name);
  }

  function chapterHtml(ch, no, md) {
    const ctx = { chapter: ch.id, chapterNo: no, notes: [], people: new Set(), questions: new Set(), refc: 0, figs: 0 };
    const body = renderMd(md, ctx);
    const ids = ch.people_all ? [...S.gen.entries()].filter(([, g]) => g > 0).map(([id]) => id)
      : [...new Set([...(ch.people || []), ...ctx.people])];
    const gens = ids.map((id) => S.gen.get(id)).filter((g) => g != null && g > 0);
    const gmin = gens.length ? Math.min(...gens) : null, gmax = gens.length ? Math.max(...gens) : null;
    let genTxt = "";
    if (gmin != null && !ch.people_all) genTxt = gmin === gmax ? `${gmin}. generace přede mnou (${genWord(gmin)})`
      : `${gmin}.–${gmax}. generace přede mnou (od ${genWord(gmin)} po ${genWord(gmax)})`;
    const places = ch.places_text || (ch.people_all ? `${placeNamesFor(ids).length} obcí, hlavně Broumovsko, Hronovsko, Policko, Orlické hory a Choceň` : placeNamesFor(ids).join(", "));
    const facts = [
      ch.rody ? `<div><dt>Rody</dt><dd>${esc(ch.rody)}</dd></div>` : "",
      places ? `<div><dt>Místa</dt><dd>${esc(places)}</dd></div>` : "",
      ch.obdobi ? `<div><dt>Období</dt><dd>${esc(ch.obdobi)}</dd></div>` : "",
      genTxt ? `<div><dt>Vztah ke mně</dt><dd>${esc(genTxt)}</dd></div>` : (ch.vztah ? `<div><dt>Vztah ke mně</dt><dd>${esc(ch.vztah)}</dd></div>` : "")
    ].join("");
    const mapIds = ids.filter((id) => !(S.people.get(id) || {}).living);
    const mapBox = ch.map === false ? "" : `<div class="kn-mapbox">
        <div class="kn-map" data-ids="${esc(mapIds.join(","))}" role="img" aria-label="Mapa míst kapitoly ${esc(ch.title)}"></div>
        <div class="kn-map-cap"><span>Místa kapitoly na mapě II. vojenského mapování (1836–1852)</span>
        <a href="./mapa.html">Celá mapa míst →</a></div></div>`;
    const qs = [...ctx.questions].map((id) => {
      const q = S.questions.get(id);
      if (!q) return "";
      return `<li id="oq-${ch.id}-${id}"><strong>${esc(q.title)}</strong> ${esc(q.summary || "")}</li>`;
    }).join("");
    const notes = ctx.notes.map((n, i) => `<li id="fn-${ch.id}-${i + 1}">${n.html}</li>`).join("");
    return `<section class="kn-chapter" id="k-${esc(ch.id)}">
      <header class="kn-ch-head">
        <p class="kn-ch-no">${ch.no_label || `Kapitola ${no}`}</p>
        <h2>${esc(ch.title)}</h2>
        ${ch.lead ? `<p class="kn-lead">${inline(ch.lead, ctx)}</p>` : ""}
        ${facts ? `<dl class="kn-facts">${facts}</dl>` : ""}
      </header>
      ${mapBox}
      <div class="kn-text">${body}</div>
      ${qs ? `<div class="kn-open"><h3>Co v této kapitole ještě nevím</h3><ul>${qs}</ul></div>` : ""}
      ${notes ? `<div class="kn-notes"><h3>Poznámky a prameny</h3><ol>${notes}</ol></div>` : ""}
      <p class="kn-top"><a href="#obsah">↑ Obsah</a></p>
    </section>`;
  }

  function wordCount(s) { return (s.match(/[\p{L}\p{N}]+/gu) || []).length; }

  async function loadBook() {
    const [data, zdroje, mista, kniha] = await Promise.all([
      fetch("./data/rodokmen.json").then((r) => r.json()),
      fetch("./data/zdroje.json").then((r) => r.json()),
      fetch("./data/mista.json").then((r) => r.json()),
      fetch("./data/kniha/kniha.json", { cache: "no-cache" }).then((r) => r.json())
    ]);
    Object.assign(S, { data, zdroje, mista, kniha });
    for (const p of R.allPeople(data)) S.people.set(p.id, p);
    for (const q of data.open_questions || []) S.questions.set(q.id, q);
    S.events = R.extractEvents(data, mista).events;
    computeGenerations();

    const chapters = [];
    for (const part of kniha.parts) for (const ch of part.chapters) chapters.push(ch);
    const texts = await Promise.all(chapters.map((ch) =>
      fetch(`./data/kniha/${ch.file}`, { cache: "no-cache" }).then((r) => r.ok ? r.text() : `*(Kapitola se nepodařila načíst.)*`)));
    const mdBy = new Map(chapters.map((c, i) => [c.id, texts[i]]));

    let no = 0, words = 0;
    const toc = [], html = [], parts = [];
    for (const part of kniha.parts) {
      const items = [];
      const partHtml = `<div class="kn-part" id="d-${esc(part.id)}"><p class="kn-part-no">${esc(part.label || "")}</p><h2>${esc(part.title)}</h2>${part.intro ? `<p>${esc(part.intro)}</p>` : ""}</div>`;
      html.push(partHtml);
      const P = { part, html: partHtml, chapters: [] };
      parts.push(P);
      for (const ch of part.chapters) {
        const numbered = ch.numbered !== false;
        if (numbered) no++;
        const md = mdBy.get(ch.id) || "";
        words += wordCount(md);
        const chHtml = chapterHtml(ch, numbered ? no : "", md);
        html.push(chHtml);
        P.chapters.push({ ch, no: numbered ? no : "", html: chHtml });
        items.push(`<li><a href="#k-${esc(ch.id)}">${numbered ? `<span class="kn-toc-no">${no}.</span> ` : ""}${esc(ch.title)}</a></li>`);
      }
      toc.push(`<li class="kn-toc-part"><a href="#d-${esc(part.id)}">${esc(part.label ? part.label + " – " : "")}${esc(part.title)}</a><ol>${items.join("")}</ol></li>`);
    }
    return { kniha, no, words, peopleCount: S.people.size, parts, toc, html };
  }

  async function main() {
    const { kniha, no, words, toc, html } = await loadBook();
    $("#kn-title").textContent = kniha.title;
    $("#kn-subtitle").textContent = kniha.subtitle || "";
    $("#kn-updated").textContent = `Stav k ${kniha.updated} · ${no} kapitol · asi ${Math.round(words / 100) * 100} slov · ${S.people.size} osob v datech`;
    $("#toc").innerHTML = `<ol>${toc.join("")}</ol>`;
    $("#book").innerHTML = html.join("\n");
    $("#meta-line").textContent = `Rodinná kronika podle matrik · ${no} kapitol`;
    lazyMaps();
    if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
  }

  window.Kniha = { load: loadBook, initMap };
  const autorun = () => { if (document.getElementById("book")) main(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", autorun);
  else autorun();
})();
