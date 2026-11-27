/* Rodokmen – hlavní stránka. Vějíř předků, strom, seznam, filtry a detail osoby.
   Data: data/rodokmen.json, mista.json, zdroje.json, povolani-kategorie.json, kniha/kniha.json,
   volitelně data/anotace.json (vyznačené snímky zápisů). Nic se nedomýšlí – jen pole z dat.
   Pohlaví se odvozuje z pořadí v páru (muž, žena) a z koncovky jména; slouží jen filtru a slovu „otec/matka“. */
(function () {
  "use strict";
  const R = window.RodokmenMista;
  const esc = R.esc, fold = R.fold;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const NS = "http://www.w3.org/2000/svg";
  const isMobile = () => window.matchMedia("(max-width: 720px)").matches;

  const S = {
    data: null, mista: null, zdroje: null, catalog: null, kniha: null, anot: {},
    P: new Map(), parents: new Map(), childUnions: new Map(), partnerUnions: new Map(),
    gen: new Map(), sosa: new Map(), down: new Map(), unatt: new Set(), placeName: new Map(),
    chapters: new Map(), view: "vejir", root: null, depth: 7, sel: null,
    T: { k: 1, x: 0, y: 0 }, maxGen: 0
  };
  const F = { rod: new Set(), pov: "", misto: "", genOd: 0, genDo: 99, stol: new Set(), doklad: "", pohlavi: "", jenPredci: true, nepripojene: false };

  /* ---------- pomocné ---------- */
  const cleanName = (n) => String(n || "").replace(/\s*\([^)]*\)/g, "").replace(/\s{2,}/g, " ").trim();
  function splitName(n) {
    const w = cleanName(n).split(" ");
    if (w.length < 2) return [w[0] || "", ""];
    return [w.slice(0, -1).join(" "), w[w.length - 1]];
  }
  const yearOf = R.yearOf;
  function lifeYears(p) {
    const b = yearOf(p.birth) || yearOf(p.baptism);
    const d = yearOf(p.death);
    const parts = [];
    if (b) parts.push("* " + b);
    if (d) parts.push("† " + d);
    return parts.join("  ");
  }
  function lifeShort(p) {
    const b = yearOf(p.birth) || yearOf(p.baptism);
    const d = yearOf(p.death);
    if (b && d) return b + "–" + d;
    if (b) return "* " + b;
    if (d) return "† " + d;
    return "";
  }
  function mix(hex, w) { // míchání s bílou, w = podíl bílé
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const m = (c) => Math.round(c + (255 - c) * w);
    return `rgb(${m(r)},${m(g)},${m(b)})`;
  }
  const branchOf = (p) => (S.data.branches || {})[p && p.branch] || { label: (p && p.branch) || "—", color: "#7a6a52" };
  const colorOf = (p) => branchOf(p).color;
  const DOC_RE = /(ARON|matri|ЦДІАЛ|SOA|SOkA|archiv|ZA Opava|digi\.archives)/i;
  function isDocSource(s) {
    if (!s) return false;
    if (s.signatura || s.apu) return true;
    if (s.url && /aron\.|tsdial|archives\.cz|matriky|actapublica/i.test(s.url)) return true;
    return DOC_RE.test(s.label || "") && !/Podklad uživatele|Sdělení|Rodokmen Klime/i.test(s.label || "");
  }
  const hasDoc = (arr) => (arr || []).some(isDocSource);
  function inferSex(p, role) {
    if (role) return role;
    const n = cleanName(p.name);
    const w = n.split(" ");
    const last = w[w.length - 1] || "";
    const first = w[0] || "";
    if (/(ová|á)$/i.test(last) && w.length > 1) return "f";
    if (/(a|e|ie|y|th|ith)$/i.test(first) && !/^(Jonas|Tobias|Andreas|Matthias|Lukas|Thomas|Nikolaus|Elias|Jiří|Matěj|Tobiáš|Lukáš|Mikuláš)$/i.test(first)) return "f";
    return "m";
  }
  const stripHouse = (s) => String(s || "").replace(/,?\s*(č\.\s*p\.|čp\.|č\.)\s*\d+[a-z]?(\s*[–-]\s*\w+)?/gi, "").replace(/\s{2,}/g, " ").trim();
  const txt = (p, s) => (p.living ? stripHouse(s) : String(s || ""));
  function centuryOf(y) { return y ? Math.floor((y - 1) / 100) + 1 : null; }
  function birthYear(p) {
    return yearOf(p.birth) || yearOf(p.baptism) || null;
  }
  function relWord(g, sex) {
    const f = sex === "f";
    if (g === 0) return "Štěpán";
    if (g === 1) return f ? "matka" : "otec";
    if (g === 2) return f ? "babička" : "děd";
    if (g <= 6) return "pra".repeat(g - 2) + (f ? "babička" : "děd");
    return f ? "předkyně" : "předek";
  }
  function genWord(g) {
    if (g === 0) return "Štěpán";
    if (g === 1) return "rodiče";
    if (g === 2) return "prarodiče";
    if (g <= 5) return "pra".repeat(g - 2) + "rodiče";
    return `${g}. generace`;
  }
  function sideOf(id) {
    const n = S.sosa.get(id); const g = S.gen.get(id);
    if (!n || !g) return "";
    return (n >> (g - 1)) === 2 ? "po otci" : "po matce";
  }

  /* ---------- model ---------- */
  function build() {
    const d = S.data;
    S.unatt = new Set();
    for (const b of d.unattached_branches || []) for (const p of b.people || []) S.unatt.add(p.id);
    for (const p of R.allPeople(d)) S.P.set(p.id, p);
    const role = new Map();
    for (const u of R.allUnions(d)) {
      const ps = u.partners || [];
      if (ps.length === 2) { role.set(ps[0], "m"); role.set(ps[1], "f"); }
      for (const pid of ps) { if (!S.partnerUnions.has(pid)) S.partnerUnions.set(pid, []); S.partnerUnions.get(pid).push(u); }
      for (const c of u.children || []) {
        if (!S.childUnions.has(c)) S.childUnions.set(c, u);
      }
    }
    for (const p of S.P.values()) p._sex = inferSex(p, role.get(p.id));
    for (const [c, u] of S.childUnions) {
      const ps = (u.partners || []).map((x) => S.P.get(x)).filter(Boolean);
      let f = null, m = null;
      for (const p of ps) { if (p._sex === "f" && !m) m = p.id; else if (!f) f = p.id; else if (!m) m = p.id; }
      S.parents.set(c, { f, m, u });
    }
    // generace + Sosa + cesta dolů
    const focus = d.meta.focus;
    S.gen.set(focus, 0); S.sosa.set(focus, 1);
    const q = [focus];
    while (q.length) {
      const id = q.shift();
      const pr = S.parents.get(id); if (!pr) continue;
      for (const [k, pid] of [[0, pr.f], [1, pr.m]]) {
        if (!pid || S.gen.has(pid)) continue;
        S.gen.set(pid, S.gen.get(id) + 1); S.sosa.set(pid, S.sosa.get(id) * 2 + k); S.down.set(pid, id);
        q.push(pid);
      }
    }
    S.maxGen = Math.max(...S.gen.values());
    // místa a povolání
    const ev = R.extractEvents(d, S.mista);
    S.events = ev.events;
    for (const pl of S.mista.places || []) S.placeName.set(pl.id, pl.name);
    for (const p of S.P.values()) { p._places = new Set(); p._events = []; }
    for (const e of ev.events) { const p = S.P.get(e.personId); if (p) { p._places.add(e.placeId); p._events.push(e); } }
    for (const p of S.P.values()) {
      const oc = R.classifyOccupation(p, S.catalog);
      p._occ = oc; p._occCats = oc.categories.map((c) => c.id);
      p._by = birthYear(p);
      p._cent = centuryOf(p._by);
      p._doc = hasDoc(p.sources);
      const pr = S.parents.get(S.down.get(p.id)); // vazba na dítě (unie, kde je dítětem jeho potomek)
      p._linkDoc = pr && pr.u ? hasDoc(pr.u.sources) : null;
      p._fold = fold([p.name, p.maiden, (p.aliases || []).join(" "), p.occupation, (p.places || []).join(" "),
        p.birth && p.birth.place, p.death && p.death.place, p._by, yearOf(p.death), branchOf(p).label].filter(Boolean).join(" "));
    }
    // kapitoly knihy
    for (const part of (S.kniha && S.kniha.parts) || []) for (const ch of part.chapters || []) {
      for (const pid of ch.people || []) { if (!S.chapters.has(pid)) S.chapters.set(pid, []); S.chapters.get(pid).push(ch); }
    }
  }
  async function scanChapters() {
    const chs = [];
    for (const part of (S.kniha && S.kniha.parts) || []) for (const ch of part.chapters || []) if (ch.file) chs.push(ch);
    await Promise.all(chs.map(async (ch) => {
      try {
        const md = await (await fetch("./data/kniha/" + ch.file)).text();
        for (const m of md.matchAll(/\[\[([a-z0-9-]+)/g)) {
          if (!S.chapters.has(m[1])) S.chapters.set(m[1], []);
          if (!S.chapters.get(m[1]).includes(ch)) S.chapters.get(m[1]).push(ch);
        }
      } catch (e) { /* nic */ }
    }));
  }

  /* ---------- filtry ---------- */
  function inBase(p) {
    if (S.unatt.has(p.id) && !F.nepripojene) return false;
    if (F.jenPredci && !S.gen.has(p.id) && !S.unatt.has(p.id)) return false;
    return true;
  }
  function filterActive() {
    return F.rod.size || F.pov || F.misto || F.genOd > 0 || F.genDo < S.maxGen || F.stol.size || F.doklad || F.pohlavi;
  }
  function matches(p, skip) {
    if (skip !== "rod" && F.rod.size && !F.rod.has(p.branch)) return false;
    if (skip !== "pov" && F.pov && !p._occCats.includes(F.pov)) return false;
    if (skip !== "misto" && F.misto && !p._places.has(F.misto)) return false;
    if (skip !== "gen" && (F.genOd > 0 || F.genDo < S.maxGen)) {
      const g = S.gen.get(p.id);
      if (g == null || g < F.genOd || g > F.genDo) return false;
    }
    if (skip !== "stol" && F.stol.size && !F.stol.has(p._cent == null ? "?" : String(p._cent))) return false;
    if (skip !== "doklad" && F.doklad && (F.doklad === "zapis") !== p._doc) return false;
    if (skip !== "pohlavi" && F.pohlavi && p._sex !== F.pohlavi) return false;
    return true;
  }
  const baseList = () => [...S.P.values()].filter(inBase);
  function countBy(skip, keyFn) {
    const m = new Map();
    for (const p of baseList()) {
      if (!matches(p, skip)) continue;
      for (const k of keyFn(p)) m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  }

  function initFilters() {
    // generace
    const go = $("#f-gen-od"), gd = $("#f-gen-do");
    for (let g = 0; g <= S.maxGen; g++) {
      const lab = g === 0 ? "1 · Štěpán" : g <= 3 ? (g + 1) + " · " + genWord(g) : String(g + 1);
      go.insertAdjacentHTML("beforeend", `<option value="${g}">${lab}</option>`);
      gd.insertAdjacentHTML("beforeend", `<option value="${g}">${lab}</option>`);
    }
    F.genDo = S.maxGen; gd.value = S.maxGen;
    go.addEventListener("change", () => { F.genOd = +go.value; if (F.genDo < F.genOd) { F.genDo = F.genOd; gd.value = F.genDo; } applyFilters(); });
    gd.addEventListener("change", () => { F.genDo = +gd.value; if (F.genOd > F.genDo) { F.genOd = F.genDo; go.value = F.genOd; } applyFilters(); });
    $("#f-povolani").addEventListener("change", (e) => { F.pov = e.target.value; applyFilters(); });
    $("#f-misto").addEventListener("change", (e) => { F.misto = e.target.value; applyFilters(); });
    for (const [sel, key] of [["#f-doklad", "doklad"], ["#f-pohlavi", "pohlavi"]]) {
      $(sel).addEventListener("click", (e) => {
        const b = e.target.closest("button"); if (!b) return;
        F[key] = b.dataset.v;
        $$("button", $(sel)).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        applyFilters();
      });
    }
    $("#f-rod").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      const v = b.dataset.v; F.rod.has(v) ? F.rod.delete(v) : F.rod.add(v); applyFilters();
    });
    $("#f-stoleti").addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      const v = b.dataset.v; F.stol.has(v) ? F.stol.delete(v) : F.stol.add(v); applyFilters();
    });
    $("#f-jen-predci").addEventListener("change", (e) => { F.jenPredci = e.target.checked; applyFilters(); });
    $("#f-nepripojene").addEventListener("change", (e) => { F.nepripojene = e.target.checked; applyFilters(); });
    $("#f-reset").addEventListener("click", () => {
      F.rod.clear(); F.stol.clear(); F.pov = ""; F.misto = ""; F.genOd = 0; F.genDo = S.maxGen; F.doklad = ""; F.pohlavi = "";
      go.value = 0; gd.value = S.maxGen;
      for (const sel of ["#f-doklad", "#f-pohlavi"]) $$("button", $(sel)).forEach((x, i) => x.setAttribute("aria-pressed", String(i === 0)));
      applyFilters();
    });
    const openF = (o) => {
      $("#filters").classList.toggle("open", o); $("#filter-btn").setAttribute("aria-expanded", String(o));
      $("#scrim").hidden = !o;
    };
    $("#filter-btn").addEventListener("click", () => openF(!$("#filters").classList.contains("open")));
    $("#f-close").addEventListener("click", () => openF(false));
    $("#f-apply").addEventListener("click", () => openF(false));
    $("#scrim").addEventListener("click", () => { openF(false); closeDrawer(); });
    S.closeFilters = () => openF(false);
  }

  function renderFilterOptions() {
    // rod
    const rodC = countBy("rod", (p) => [p.branch]);
    const branches = Object.entries(S.data.branches || {});
    $("#f-rod").innerHTML = branches.filter(([id]) => rodC.get(id) || F.rod.has(id)).sort((a, b) => (rodC.get(b[0]) || 0) - (rodC.get(a[0]) || 0)).map(([id, b]) =>
      `<button type="button" class="st-chip" data-v="${esc(id)}" aria-pressed="${F.rod.has(id)}"><i style="background:${esc(b.color)}"></i>${esc(b.label)} <small>${rodC.get(id) || 0}</small></button>`).join("");
    // povolání
    const povC = countBy("pov", (p) => p._occCats);
    const cats = (S.catalog.categories || []).concat([{ id: "jine", label: "Jiné / nezařazené znění" }]);
    const seen = new Set();
    $("#f-povolani").innerHTML = `<option value="">Všechna povolání</option>` + cats.filter((c) => {
      if (seen.has(c.id)) return false; seen.add(c.id); return povC.get(c.id) || F.pov === c.id;
    }).sort((a, b) => (povC.get(b.id) || 0) - (povC.get(a.id) || 0)).map((c) =>
      `<option value="${esc(c.id)}"${F.pov === c.id ? " selected" : ""}>${esc(c.label)} (${povC.get(c.id) || 0})</option>`).join("");
    // místo
    const mC = countBy("misto", (p) => [...p._places]);
    const places = [...mC.keys()].concat(F.misto && !mC.has(F.misto) ? [F.misto] : []);
    places.sort((a, b) => (S.placeName.get(a) || a).localeCompare(S.placeName.get(b) || b, "cs"));
    $("#f-misto").innerHTML = `<option value="">Všechna místa</option>` + places.map((id) =>
      `<option value="${esc(id)}"${F.misto === id ? " selected" : ""}>${esc(S.placeName.get(id) || id)} (${mC.get(id) || 0})</option>`).join("");
    // století
    const sC = countBy("stol", (p) => [p._cent == null ? "?" : String(p._cent)]);
    const keys = [...new Set([...sC.keys(), ...F.stol])].sort((a, b) => (a === "?" ? 99 : +a) - (b === "?" ? 99 : +b));
    const roman = { 16: "16. stol.", 17: "17. stol.", 18: "18. stol.", 19: "19. stol.", 20: "20. stol.", 21: "21. stol." };
    $("#f-stoleti").innerHTML = keys.map((k) =>
      `<button type="button" class="st-chip" data-v="${esc(k)}" aria-pressed="${F.stol.has(k)}">${k === "?" ? "rok neznámý" : esc(roman[k] || k + ". stol.")} <small>${sC.get(k) || 0}</small></button>`).join("");
  }

  function applyFilters() {
    renderFilterOptions();
    const base = baseList();
    const n = base.filter((p) => matches(p)).length;
    const act = filterActive();
    $("#f-match").textContent = act ? `Shoda: ${n} z ${base.length} osob` : `${base.length} osob v rodokmenu`;
    $("#f-apply-n").textContent = `(${n})`;
    const cnt = (F.rod.size ? 1 : 0) + (F.pov ? 1 : 0) + (F.misto ? 1 : 0) + ((F.genOd > 0 || F.genDo < S.maxGen) ? 1 : 0) + (F.stol.size ? 1 : 0) + (F.doklad ? 1 : 0) + (F.pohlavi ? 1 : 0);
    const badge = $("#filter-count"); badge.hidden = !cnt; badge.textContent = cnt;
    paintDim();
    if (S.view === "seznam") renderList();
  }
  function paintDim() {
    const act = filterActive();
    $$("[data-id]", $("#world")).forEach((el) => {
      const p = S.P.get(el.dataset.id);
      el.classList.toggle("dim", !!(act && p && !matches(p)));
    });
    $$(".lnk", $("#world")).forEach((el) => {
      const a = S.P.get(el.dataset.a), b = S.P.get(el.dataset.b);
      el.classList.toggle("dim", !!(act && !(a && matches(a) && b && matches(b))));
    });
  }

  /* ---------- SVG pomocné ---------- */
  function el(name, attrs, parent) {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function fit(str, maxPx, fs) {
    const s = String(str || "");
    const max = Math.max(1, Math.floor(maxPx / (fs * 0.53)));
    return s.length <= max ? s : s.slice(0, Math.max(1, max - 1)).trimEnd() + "…";
  }
  function title(g, p) {
    const t = el("title", {}, g);
    t.textContent = `${cleanName(p.name)}${lifeShort(p) ? " (" + lifeShort(p) + ")" : ""}${p.occupation ? " – " + txt(p, p.occupation).slice(0, 80) : ""}`;
  }

  /* ---------- vějíř ---------- */
  const TANG = [0, 92, 86, 80, 76];
  const RAD = [126, 116, 106, 98, 90, 84, 80];
  function ringWidth(g) { return g <= 4 ? TANG[g] : RAD[Math.min(g - 5, RAD.length - 1)]; }
  function polar(r, a) { const t = a * Math.PI / 180; return [r * Math.sin(t), -r * Math.cos(t)]; }
  function arcPath(r0, r1, a0, a1) {
    const large = a1 - a0 > 180 ? 1 : 0;
    const [x0, y0] = polar(r1, a0), [x1, y1] = polar(r1, a1), [x2, y2] = polar(r0, a1), [x3, y3] = polar(r0, a0);
    return `M${x0},${y0} A${r1},${r1} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r0},${r0} 0 ${large} 0 ${x3},${y3} Z`;
  }
  function renderFan() {
    const world = $("#world"); world.innerHTML = "";
    const root = S.root || S.data.meta.focus;
    const R0 = 74;
    const radii = [R0]; for (let g = 1; g <= S.depth; g++) radii.push(radii[g - 1] + ringWidth(g));
    // sloty
    const slots = new Map([[1, root]]);
    for (let n = 1; n < Math.pow(2, S.depth); n++) {
      const id = slots.get(n); if (!id) continue;
      const pr = S.parents.get(id); if (!pr) continue;
      if (pr.f) slots.set(2 * n, pr.f);
      if (pr.m) slots.set(2 * n + 1, pr.m);
    }
    const gAll = el("g", { class: "fan" }, world);
    // jemné kruhy generací
    for (let g = 1; g <= S.depth; g++) el("circle", { r: radii[g], fill: "none", stroke: "#e6d7ba", "stroke-width": 1 }, gAll);
    for (let g = 1; g <= S.depth; g++) {
      const cnt = Math.pow(2, g), span = 360 / cnt;
      for (let i = 0; i < cnt; i++) {
        const n = cnt + i;
        const id = slots.get(n);
        const childHere = slots.get(n >> 1);
        if (!id && !childHere) continue;
        const a0 = -180 + i * span, a1 = a0 + span;
        const r0 = radii[g - 1], r1 = radii[g];
        const p = id && S.P.get(id);
        const grp = el("g", { class: "seg" + (p ? "" : " empty") + (p && !p._doc ? " mem" : "") }, gAll);
        if (p) { grp.dataset.id = id; title(grp, p); }
        const col = p ? colorOf(p) : "#ccc";
        el("path", { class: "bg", d: arcPath(r0, r1, a0, a1), fill: p ? mix(col, 0.58) : "none" }, grp);
        if (p) {
          el("path", { d: arcPath(r1 - 6, r1 - 1, a0 + Math.min(0.6, span * 0.06), a1 - Math.min(0.6, span * 0.06)), fill: col, "pointer-events": "none" }, grp);
          if (!p._doc) el("path", { class: "edge", d: arcPath(r0 + 2, r1 - 8, a0 + span * 0.04, a1 - span * 0.04) }, grp);
          fanText(grp, p, g, r0, r1 - 6, a0, a1);
        } else if (g <= 6) {
          const [x, y] = polar((r0 + r1) / 2, (a0 + a1) / 2);
          const t = el("text", { x, y: y + 5, "text-anchor": "middle", "font-size": Math.max(9, 16 - g * 1.5) }, grp);
          t.textContent = "?";
        }
      }
    }
    // střed
    const rp = S.P.get(root);
    const c = el("g", { class: "fan-center", "data-id": root }, gAll);
    title(c, rp);
    el("circle", { r: R0 - 2, fill: colorOf(rp), stroke: "#fffaf1", "stroke-width": 3 }, c);
    el("circle", { r: R0 - 8, fill: "none", stroke: "rgba(255,255,255,.35)", "stroke-width": 1 }, c);
    const [gn, sn] = splitName(rp.name);
    const t1 = el("text", { y: -8, "text-anchor": "middle", fill: "#fff", "font-family": "EB Garamond, Georgia, serif", "font-size": 19, "font-weight": 600, "pointer-events": "none" }, c);
    t1.textContent = fit(gn, 120, 19);
    const t2 = el("text", { y: 14, "text-anchor": "middle", fill: "#fff", "font-family": "EB Garamond, Georgia, serif", "font-size": 19, "font-weight": 600, "pointer-events": "none" }, c);
    t2.textContent = fit(sn, 120, 19);
    const t3 = el("text", { y: 33, "text-anchor": "middle", fill: "rgba(255,255,255,.85)", "font-size": 12, "pointer-events": "none" }, c);
    t3.textContent = lifeShort(rp);
    // popisky generací (dole, v ose)
    for (let g = 1; g <= Math.min(S.depth, 6); g++) {
      // nic – štítky by zakrývaly osoby; generace je v detailu a ve filtru
    }
    S.fanR = radii[S.depth];
    $("#root-info").innerHTML = root === S.data.meta.focus ? "Střed: Štěpán. Klik na osobu = detail."
      : `Střed: ${esc(cleanName(rp.name))} · <button type="button" id="root-back">zpět na Štěpána</button>`;
    const rb = $("#root-back"); if (rb) rb.addEventListener("click", () => setRoot(null));
    paintDim(); paintSel();
  }
  function fanText(grp, p, g, r0, r1, a0, a1) {
    const [gn, sn] = splitName(p.name);
    const yrs = lifeShort(p);
    const am = (a0 + a1) / 2, span = a1 - a0;
    const rm = (r0 + r1) / 2;
    if (g <= 4) {
      const fsN = [0, 19, 17, 15, 13][g], fsY = [0, 13.5, 13, 12, 11][g];
      const arc = rm * span * Math.PI / 180 - 10;
      const rot = Math.abs(am) > 90 ? am + 180 : am;
      const [x, y] = polar(rm, am);
      const gt = el("g", { transform: `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${rot.toFixed(2)})` }, grp);
      const lines = [[gn, "nm", fsN], [sn, "nm", fsN], [yrs, "yr", fsY]].filter((l) => l[0]);
      const lh = fsN * 1.12;
      lines.forEach((l, i) => {
        const t = el("text", { class: l[1], y: ((i - (lines.length - 1) / 2) * lh + l[2] * 0.35).toFixed(1), "text-anchor": "middle", "font-size": l[2] }, gt);
        t.textContent = fit(l[0], arc, l[2]);
      });
    } else {
      const fsN = [12.5, 11.5, 10.5, 9.5, 8.5, 7.5][Math.min(g - 5, 5)];
      const len = r1 - r0 - 10;
      const thick = r0 * span * Math.PI / 180;
      const lh = fsN * 1.15;
      let lines = [[gn, "nm", fsN], [sn, "nm", fsN], [yrs, "yr", fsN * 0.9]].filter((l) => l[0]);
      const maxL = Math.max(1, Math.floor((thick - 2) / lh));
      if (lines.length > maxL) lines = maxL >= 2 ? [[cleanName(p.name), "nm", fsN], [yrs, "yr", fsN * 0.9]].filter((l) => l[0]) : [[cleanName(p.name), "nm", fsN]];
      if (lines.length > maxL) lines = lines.slice(0, maxL);
      const right = am >= 0;
      const rot = right ? am - 90 : am + 90;
      const [x, y] = polar(rm, am);
      const gt = el("g", { transform: `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${rot.toFixed(2)})` }, grp);
      lines.forEach((l, i) => {
        const t = el("text", { class: l[1], y: ((i - (lines.length - 1) / 2) * lh + l[2] * 0.35).toFixed(1), "text-anchor": "middle", "font-size": l[2].toFixed(1) }, gt);
        t.textContent = fit(l[0], len, l[2]);
      });
    }
  }
  function setRoot(id) {
    S.root = id && id !== S.data.meta.focus ? id : null;
    if (S.view !== "vejir") setView("vejir"); else { renderFan(); fitView(); }
  }

  /* ---------- strom (rodokmen zleva doprava) ---------- */
  const NW = 232, NH = 66, CG = 64, RG = 12;
  function ancCount(id, seen = new Set()) {
    const pr = S.parents.get(id); if (!pr) return 0;
    let n = 0;
    for (const x of [pr.f, pr.m]) if (x && !seen.has(x)) { seen.add(x); n += 1 + ancCount(x, seen); }
    return n;
  }
  function expandPath(id) { let cur = S.down.get(id); while (cur) { S.expanded.add(cur); cur = S.down.get(cur); } }
  function renderTree() {
    const world = $("#world"); world.innerHTML = "";
    const focus = S.data.meta.focus;
    if (!S.expanded) { S.expanded = new Set(); for (const [id, g] of S.gen) if (g < 3) S.expanded.add(id); }
    const pos = new Map(); let leaf = 0; const used = new Set();
    function place(id, g) {
      used.add(id);
      const pr = S.parents.get(id);
      const all = pr ? [pr.f, pr.m].filter((x) => x && !used.has(x)) : [];
      const ps = S.expanded.has(id) ? all : [];
      let y;
      if (!ps.length) { y = leaf * (NH + RG); leaf++; }
      else { const ys = ps.map((x) => place(x, g + 1)); y = (ys[0] + ys[ys.length - 1]) / 2; }
      pos.set(id, { x: g * (NW + CG), y, g, hidden: all.length && !ps.length, open: ps.length > 0 });
      return y;
    }
    place(focus, 0);
    const maxG = Math.max(...[...pos.values()].map((v) => v.g));
    const h = leaf * (NH + RG);
    const cols = el("g", { class: "gen-col" }, world);
    for (let g = 0; g <= maxG; g++) {
      const x = g * (NW + CG);
      if (g % 2) el("rect", { x: x - CG / 2, y: -64, width: NW + CG, height: h + 90, rx: 18 }, cols);
      const t = el("text", { x: x + NW / 2, y: -34, "text-anchor": "middle" }, cols);
      t.textContent = g === 0 ? "1. gen. · Štěpán" : `${g + 1}. gen. · ${genWord(g)}`;
    }
    const links = el("g", {}, world);
    for (const [id, v] of pos) {
      const pr = S.parents.get(id); if (!pr || !v.open) continue;
      for (const pid of [pr.f, pr.m]) {
        const w = pid && pos.get(pid); if (!w || w.g !== v.g + 1) continue;
        const x0 = v.x + NW, y0 = v.y + NH / 2, x1 = w.x, y1 = w.y + NH / 2, xm = x0 + CG / 2;
        const r = Math.min(8, Math.abs(y1 - y0) / 2), sg = Math.sign(y1 - y0);
        const pth = el("path", { class: "lnk", d: `M${x0},${y0} H${xm - r} Q${xm},${y0} ${xm},${y0 + sg * r} V${y1 - sg * r} Q${xm},${y1} ${xm + r},${y1} H${x1}` }, links);
        pth.dataset.a = id; pth.dataset.b = pid;
      }
    }
    const nodes = el("g", {}, world);
    for (const [id, v] of pos) {
      const p = S.P.get(id);
      const g = el("g", { class: "nd" + (p._doc ? "" : " mem"), transform: `translate(${v.x},${v.y})`, "data-id": id }, nodes);
      title(g, p);
      el("rect", { class: "c", width: NW, height: NH, rx: 10 }, g);
      el("rect", { width: 7, height: NH, rx: 3.5, fill: colorOf(p) }, g);
      const nm = el("text", { class: "nm", x: 16, y: 22 }, g); nm.textContent = fit(cleanName(p.name), NW - 30, 16);
      const ds = [lifeShort(p), S.gen.get(id) ? relWord(S.gen.get(id), p._sex) : ""].filter(Boolean).join(" · ");
      const dt = el("text", { class: "dt", x: 16, y: 40 }, g); dt.textContent = fit(ds, NW - 30, 12);
      const occ = p.occupation ? txt(p, p.occupation).split(/[;,(]/)[0] : "";
      const oc = el("text", { class: "oc", x: 16, y: 57 }, g); oc.textContent = fit(occ, NW - 30, 11.5);
      if (v.hidden || v.open && v.g >= 1) {
        const n = v.hidden ? ancCount(id) : 0;
        const tg = el("g", { class: "tg", "data-toggle": id, transform: `translate(${NW + 2},${NH / 2})` }, g);
        const wdt = v.hidden ? Math.max(30, 16 + String(n).length * 8) : 22;
        el("rect", { x: 0, y: -11, width: wdt, height: 22, rx: 11 }, tg);
        const t = el("text", { x: wdt / 2, y: 4.5, "text-anchor": "middle" }, tg);
        t.textContent = v.hidden ? `+${n}` : "−";
        const tt = el("title", {}, tg); tt.textContent = v.hidden ? `Rozbalit ${n} dalších předků` : "Sbalit předky";
      }
    }
    S.treePos = pos;
    paintDim(); paintSel();
    $("#root-info").innerHTML = "";
  }
  function toggleNode(id) {
    if (S.expanded.has(id)) S.expanded.delete(id); else S.expanded.add(id);
    const before = S.treePos.get(id);
    renderTree();
    const after = S.treePos.get(id);
    if (before && after) { S.T.x -= (after.x - before.x) * S.T.k; S.T.y -= (after.y - before.y) * S.T.k; applyT(); }
  }
  function expandAll(on) {
    S.expanded = new Set();
    for (const [id, g] of S.gen) if (on || g < 3) S.expanded.add(id);
    renderTree(); homeView();
  }

  /* ---------- seznam ---------- */
  function renderList() {
    const box = $("#list");
    const ppl = baseList().filter((p) => matches(p));
    if (!ppl.length) { box.innerHTML = `<p class="st-empty">Žádná osoba neodpovídá filtrům. <button type="button" class="st-link" id="l-reset">Zrušit filtry</button></p>`; $("#l-reset").onclick = () => $("#f-reset").click(); return; }
    const groups = new Map();
    for (const p of ppl) {
      const g = S.gen.has(p.id) ? S.gen.get(p.id) : (S.unatt.has(p.id) ? "u" : "o");
      if (!groups.has(g)) groups.set(g, []); groups.get(g).push(p);
    }
    const order = [...groups.keys()].sort((a, b) => (typeof a === "number" ? a : a === "o" ? 900 : 950) - (typeof b === "number" ? b : b === "o" ? 900 : 950));
    let html = "";
    for (const g of order) {
      const arr = groups.get(g).sort((a, b) => (S.sosa.get(a.id) || 1e9) - (S.sosa.get(b.id) || 1e9) || a.name.localeCompare(b.name, "cs"));
      const head = typeof g === "number" ? (g === 0 ? "1. generace <small>Štěpán</small>" : `${g + 1}. generace <small>${genWord(g)} · ${arr.length} os.</small>`) : g === "u" ? `Nepřipojené větve <small>vazba na Štěpána nedoložena · ${arr.length}</small>` : `Další příbuzní <small>${arr.length}</small>`;
      html += `<h2>${head}</h2><div class="st-grid">${arr.map(cardHtml).join("")}</div>`;
    }
    box.innerHTML = html;
  }
  function cardHtml(p) {
    const g = S.gen.get(p.id);
    const places = [...p._places].slice(0, 3).map((x) => S.placeName.get(x)).filter(Boolean).join(", ");
    return `<button type="button" class="pc" data-open="${esc(p.id)}" style="--bc:${esc(colorOf(p))}">
      <b>${esc(cleanName(p.name))}</b>
      <span class="dt">${esc([lifeShort(p), g ? relWord(g, p._sex) + " · " + sideOf(p.id) : ""].filter(Boolean).join(" · "))}</span>
      ${p.occupation ? `<span class="oc">${esc(txt(p, p.occupation).slice(0, 90))}</span>` : ""}
      <span class="tags"><span class="tag">${esc(branchOf(p).label)}</span>${places ? `<span class="tag">${esc(places)}</span>` : ""}<span class="tag ${p._doc ? "doc" : "mem"}">${p._doc ? "doloženo zápisem" : "rodinná paměť"}</span></span>
    </button>`;
  }

  /* ---------- posun a zoom ---------- */
  function applyT() { $("#world").setAttribute("transform", `translate(${S.T.x.toFixed(1)},${S.T.y.toFixed(1)}) scale(${S.T.k.toFixed(4)})`); }
  function zoomAt(f, cx, cy) {
    const k = Math.min(6, Math.max(0.08, S.T.k * f));
    const ff = k / S.T.k;
    S.T.x = cx - (cx - S.T.x) * ff; S.T.y = cy - (cy - S.T.y) * ff; S.T.k = k; applyT();
  }
  function stageSize() { const r = $("#canvas").getBoundingClientRect(); return { w: r.width, h: r.height }; }
  function fitView() {
    const { w, h } = stageSize();
    const world = $("#world");
    world.removeAttribute("transform");
    const bb = world.getBBox();
    if (!bb.width) return;
    const pad = isMobile() ? 12 : 30;
    const bottomUi = S.view === "vejir" ? (isMobile() ? 64 : 20) : 0;
    const k = Math.min((w - pad * 2) / bb.width, (h - pad * 2 - bottomUi) / bb.height);
    S.T.k = k; S.T.x = (w - bb.width * k) / 2 - bb.x * k; S.T.y = (h - bottomUi - bb.height * k) / 2 - bb.y * k + (S.view === "vejir" ? 0 : pad / 2);
    applyT();
  }
  function homeView() {
    if (S.view === "strom") {
      const { w, h } = stageSize();
      const vs = [...(S.treePos || new Map()).values()].filter((v) => v.g <= 3);
      const y0 = Math.min(...vs.map((v) => v.y)) - 50, y1 = Math.max(...vs.map((v) => v.y)) + NH + 10;
      const x1 = Math.max(...vs.map((v) => v.x)) + NW + 40;
      S.T.k = Math.max(isMobile() ? 0.62 : 0.6, Math.min(1, (h - 20) / (y1 - y0), (w - 20) / (x1 + 10)));
      S.T.x = 14;
      S.T.y = (h - (y1 - y0) * S.T.k) / 2 - y0 * S.T.k;
      if ((y1 - y0) * S.T.k > h) { const v = S.treePos.get(S.data.meta.focus); S.T.y = h / 2 - (v.y + NH / 2) * S.T.k; }
      applyT();
    } else { if (S.root) { S.root = null; renderFan(); } fitView(); }
  }
  function centerOn(id, opts = {}) {
    let node = $(`[data-id="${CSS.escape(id)}"]`, $("#world"));
    if (!node && S.view === "strom" && S.gen.has(id)) { expandPath(id); renderTree(); node = $(`[data-id="${CSS.escape(id)}"]`, $("#world")); }
    if (!node) return false;
    const { w, h } = stageSize();
    const bb = node.getBBox();
    const m = node.getCTM && node.getCTM(); // vůči svg
    const svgM = $("#svg").getScreenCTM();
    let cx, cy;
    if (m && svgM) {
      const pt = $("#svg").createSVGPoint(); pt.x = bb.x + bb.width / 2; pt.y = bb.y + bb.height / 2;
      const sp = pt.matrixTransform(node.getScreenCTM()); const r = $("#canvas").getBoundingClientRect();
      cx = sp.x - r.left; cy = sp.y - r.top;
    } else return false;
    const drawerOpen = $("#drawer").classList.contains("open");
    const tx = drawerOpen && !isMobile() ? (w - 420) / 2 : w / 2;
    let ty = h / 2;
    if (drawerOpen && isMobile()) {
      const cr = $("#canvas").getBoundingClientRect();
      const dTop = window.innerHeight * 0.38; // výška listu: max 62 % (viz CSS)
      ty = Math.max(40, (dTop - cr.top) / 2 + 10);
    }
    if (S.T.k < 0.7 && !opts.keepZoom) { zoomAt(0.9 / S.T.k, cx, cy); return centerOn(id, { keepZoom: true }); }
    S.T.x += tx - cx; S.T.y += ty - cy; applyT();
    return true;
  }
  function initPanZoom() {
    const cv = $("#canvas");
    const pts = new Map(); let start = null, moved = 0, downTarget = null, pinch = null;
    cv.addEventListener("pointerdown", (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      cv.setPointerCapture(e.pointerId);
      if (pts.size === 1) { start = { x: e.clientX, y: e.clientY, tx: S.T.x, ty: S.T.y }; moved = 0; downTarget = e.target; }
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: S.T.k, x: S.T.x, y: S.T.y, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
        moved = 99;
      }
    });
    cv.addEventListener("pointermove", (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const r = cv.getBoundingClientRect();
      if (pts.size >= 2 && pinch) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const k = Math.min(6, Math.max(0.08, pinch.k * d / pinch.d));
        const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
        const ox = pinch.mx - r.left, oy = pinch.my - r.top;
        S.T.k = k; S.T.x = mx - (ox - pinch.x) * (k / pinch.k); S.T.y = my - (oy - pinch.y) * (k / pinch.k); applyT();
      } else if (start) {
        const dx = e.clientX - start.x, dy = e.clientY - start.y;
        moved = Math.max(moved, Math.hypot(dx, dy));
        if (moved > 4) { cv.classList.add("dragging"); S.T.x = start.tx + dx; S.T.y = start.ty + dy; applyT(); }
      }
    });
    const up = (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 0) {
        cv.classList.remove("dragging");
        if (moved <= 6 && downTarget && e.type === "pointerup") {
          const tgl = downTarget.closest && downTarget.closest("[data-toggle]");
          if (tgl) { toggleNode(tgl.dataset.toggle); start = null; return; }
          const n = downTarget.closest && downTarget.closest("[data-id]");
          if (n) openPerson(n.dataset.id, { noCenter: true });
        }
        start = null;
      } else if (pts.size === 1) { const [a] = [...pts.values()]; start = { x: a.x, y: a.y, tx: S.T.x, ty: S.T.y }; }
    };
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
    cv.addEventListener("wheel", (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAt(Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.0018)), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    cv.addEventListener("dblclick", (e) => { const r = cv.getBoundingClientRect(); zoomAt(1.6, e.clientX - r.left, e.clientY - r.top); });
    const mid = () => { const { w, h } = stageSize(); return [w / 2, h / 2]; };
    $("#z-in").addEventListener("click", () => zoomAt(1.35, ...mid()));
    $("#z-out").addEventListener("click", () => zoomAt(1 / 1.35, ...mid()));
    $("#z-fit").addEventListener("click", fitView);
    $("#z-home").addEventListener("click", homeView);
  }

  /* ---------- zobrazení ---------- */
  function setView(v, opts = {}) {
    S.view = v;
    $$(".st-views button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.view === v)));
    const list = v === "seznam";
    $("#list").hidden = !list; $("#canvas").hidden = list; $("#zoom").hidden = list;
    $("#depth-wrap").hidden = list; $("#legend").hidden = list;
    $("#depth-ctl").hidden = v !== "vejir"; $("#tree-ctl").hidden = v !== "strom";
    if (v === "vejir") { renderFan(); fitView(); }
    else if (v === "strom") { renderTree(); homeView(); }
    else renderList();
    if (S.sel && !opts.noCenter && !list) centerOn(S.sel);
    try { localStorage.setItem("rodokmen-view", v); } catch (e) { /* nic */ }
  }
  function paintSel() {
    $$(".sel", $("#world")).forEach((x) => x.classList.remove("sel"));
    if (S.sel) $$(`[data-id="${CSS.escape(S.sel)}"]`, $("#world")).forEach((x) => x.classList.add("sel"));
  }

  /* ---------- prameny ---------- */
  const FAMILY_DOC = /(rodný|křestní|rodokmen|podklad uživatele|sdělení|rodinn)/i;
  function snimkyOf(s) {
    const z = S.zdroje || {};
    const out = [];
    if (s.snimek != null) out.push(...(Array.isArray(s.snimek) ? s.snimek : [s.snimek]));
    const det = String(s.detail || "");
    let m = det.match(/snímky\s+(\d+)\s*[–-]\s*(\d+)/);
    if (m) for (let n = +m[1]; n <= +m[2] && n - m[1] < 12; n++) out.push(n);
    m = det.match(/snímky\s+([\d ,a]+)/);
    if (m) out.push(...(m[1].match(/\d+/g) || []).map(Number));
    for (const mm of det.matchAll(/snímek\s+(\d+)/g)) out.push(+mm[1]);
    if (!out.length && s.signatura) {
      for (const [k, n] of Object.entries(z.aliasy || {})) {
        const i = k.indexOf("|"); const sig = k.slice(0, i), t = k.slice(i + 1);
        if (sig === s.signatura && t && det.includes(t)) out.push(+n);
      }
    }
    return [...new Set(out.map(Number))];
  }
  function sourceHtml(p, s) {
    const isFamily = !s.signatura && FAMILY_DOC.test(s.label || "");
    const det = [s.signatura, s.detail].filter(Boolean).join(" — ");
    const t = `${esc(txt(p, s.label))}${det ? ": " + esc(txt(p, det)) : ""}`;
    if (isFamily) return `<li class="src fam">${t}<span class="src-note">Rodinný dokument nebo sdělení – obrázek se na webu nezveřejňuje.</span></li>`;
    const shots = [];
    if (s.signatura) for (const n of snimkyOf(s)) {
      const e = ((S.zdroje || {}).snimky || {})[`${s.signatura}|${n}`];
      if (e) shots.push({ n, key: `${s.signatura}|${n}`, url: e.url, img: e.nahled, big: e.velky, crop: e.vyrez });
    }
    const arch = (u) => String(u || "").includes("tsdial") ? "ЦДІАЛ" : "ARON";
    const links = shots.filter((x) => x.url).map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${arch(x.url)} snímek ${x.n} ↗</a>`);
    const book = s.signatura && ((S.zdroje || {}).knihy || {})[s.signatura];
    let url = s.url || s.apu || (book && book.url);
    if (!links.length && url && /^https:\/\//.test(url)) links.push(`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${arch(url)} ${esc(s.signatura || "odkaz")} ↗</a>`);
    let thumbs = "";
    for (const x of shots.filter((x) => x.img)) {
      const a = S.anot[x.key];
      const cap = `${s.label || ""} · ${s.signatura} · snímek ${x.n}`;
      if (a) thumbs += `<button type="button" class="thumb ann" data-big="${esc(a.soubor)}" data-url="${esc(x.url || "")}" data-cap="${esc(cap + " – vyznačeno: " + (a.plyne || ""))}"><img loading="lazy" src="${esc(a.soubor)}" alt="Vyznačený zápis ${esc(cap)}"><span>vyznačený zápis</span></button>`;
      thumbs += `<button type="button" class="thumb" data-big="${esc(x.big || x.img)}" data-url="${esc(x.url || "")}" data-cap="${esc(cap)}"><img loading="lazy" src="${esc(x.img)}" alt="Snímek ${esc(cap)}"><span>${x.crop === "zápis" ? "výřez zápisu" : "celá strana"} · sn. ${x.n}</span></button>`;
    }
    return `<li class="src">${t}${links.length ? `<span class="src-links">${links.join("")}</span>` : ""}${thumbs ? `<div class="thumbs">${thumbs}</div>` : ""}</li>`;
  }

  /* ---------- detail ---------- */
  function famBtn(id, label) {
    const p = S.P.get(id); if (!p) return "";
    return `<button type="button" data-open="${esc(id)}" style="--bc:${esc(colorOf(p))}">${esc(cleanName(p.name))}<small>${esc([label, lifeShort(p)].filter(Boolean).join(" · "))}</small></button>`;
  }
  function openPerson(id, opts = {}) {
    const p = S.P.get(id); if (!p) return;
    S.sel = id; paintSel();
    const g = S.gen.get(id);
    const b = branchOf(p);
    const ev = (e, lbl) => {
      if (!e) return "";
      const place = e.place ? txt(p, e.place) : "";
      return `<dt>${lbl}</dt><dd>${esc(e.display || "")}${place ? `<br><small>${esc(place)}</small>` : ""}${e.note ? `<br><small>${esc(txt(p, e.note))}</small>` : ""}</dd>`;
    };
    const rel = g == null ? (S.unatt.has(id) ? "nepřipojená větev – vazba na Štěpána nedoložena" : "příbuzný mimo přímou linii") :
      g === 0 ? "1. generace – středobod rodokmenu" : `${relWord(g, p._sex)} · ${g + 1}. generace · ${sideOf(id)}`;
    // rodina
    const pr = S.parents.get(id);
    const parents = pr ? [famBtn(pr.f, "otec"), famBtn(pr.m, "matka")].join("") : "";
    const partners = [], kids = [];
    for (const u of S.partnerUnions.get(id) || []) {
      for (const x of u.partners || []) if (x !== id) partners.push(famBtn(x, "partner/ka"));
      for (const c of u.children || []) kids.push(famBtn(c, S.down.get(id) === c ? "dítě · přímá linie" : "dítě"));
    }
    // cesta
    let path = "";
    if (g) {
      const chain = []; let cur = id;
      while (cur) { chain.push(cur); cur = S.down.get(cur); }
      path = chain.map((x, i) => i === 0 ? `<b>${esc(cleanName(S.P.get(x).name))}</b>` : `<button type="button" data-open="${esc(x)}">${esc(cleanName(S.P.get(x).name))}</button>`).join(" → ");
    }
    const linkBadge = g ? (p._linkDoc ? `<span class="badge doc">✓ Vazba k dítěti doložena zápisem</span>` : `<span class="badge mem">◌ Vazba k dítěti z rodinné paměti</span>`) : "";
    const evs = (p._events || []).filter((e) => e.placeId).map((e) => `${R.EVENT_TYPES[e.type] ? R.EVENT_TYPES[e.type].label : e.type}: ${S.placeName.get(e.placeId) || e.placeLabel}${e.year ? " (" + e.year + ")" : ""}`);
    const placesRaw = p.living ? [] : (p.places || []);
    const chs = (S.chapters.get(id) || []);
    const occ = p._occ;
    $("#drawer-body").innerHTML = `
      <div class="dr-head" style="--bc:${esc(b.color)}">
        <div class="rod">Rod ${esc(b.label)}</div>
        <h2>${esc(cleanName(p.name))}</h2>
        ${p.maiden ? `<div class="rel">roz. ${esc(p.maiden)}</div>` : ""}
        <div class="rel">${esc(rel)}</div>
      </div>
      <div class="dr-badges">
        ${p._doc ? `<span class="badge doc">✓ Doloženo zápisem</span>` : `<span class="badge mem">◌ Rodinná paměť / podklad</span>`}
        ${linkBadge}
        ${p.living ? `<span class="badge neutral">žijící – bez adres</span>` : ""}
        ${(p.aliases || []).length ? `<span class="badge neutral">také: ${esc(p.aliases.join(", "))}</span>` : ""}
      </div>
      <div class="dr-sec"><h3>Život</h3><dl class="dr-facts">
        ${ev(p.birth, "Narození")}${ev(p.baptism, "Křest")}${ev(p.death, "Úmrtí")}
        ${p.occupation ? `<dt>Povolání</dt><dd>${esc(txt(p, p.occupation))}${occ && occ.categories.length && occ.kind !== "neuvedeno" ? `<br><small>${esc(occ.categories.map((c) => c.label).join(", "))}</small>` : ""}</dd>` : `<dt>Povolání</dt><dd><small>v datech neuvedeno</small></dd>`}
      </dl></div>
      ${evs.length || placesRaw.length ? `<div class="dr-sec"><h3>Místa</h3><ul class="dr-list">${[...new Set(evs)].map((x) => `<li>${esc(x)}</li>`).join("")}${placesRaw.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
      ${(p.interesting || []).length ? `<div class="dr-sec"><h3>Zajímavosti</h3>${p.interesting.map((x) => `<p class="dr-int">${esc(txt(p, x))}</p>`).join("")}</div>` : ""}
      ${(p.notes || []).length ? `<div class="dr-sec"><h3>Poznámky</h3><ul class="dr-list">${p.notes.map((x) => `<li>${esc(txt(p, x))}</li>`).join("")}</ul></div>` : ""}
      ${parents || partners.length || kids.length ? `<div class="dr-sec"><h3>Rodina</h3><div class="dr-fam">${parents}${partners.join("")}${kids.join("")}</div></div>` : ""}
      ${path ? `<div class="dr-sec"><h3>Cesta ke Štěpánovi</h3><div class="dr-path">${path}</div></div>` : ""}
      <div class="dr-sec"><h3>Prameny</h3><ul style="padding:0;margin:0">${(p.sources || []).map((s) => sourceHtml(p, s)).join("") || "<li class='src'>Bez pramene.</li>"}</ul></div>
      <div class="dr-actions">
        ${g != null ? `<button type="button" class="primary" data-act="root">Vějíř od této osoby</button><button type="button" data-act="tree">Ukázat ve stromu</button>` : ""}
        ${chs.map((c) => `<a href="./kniha.html#k-${esc(c.id)}">Kniha: ${esc(c.title)}</a>`).join("")}
        <a href="./mapa.html">Mapa míst</a>
      </div>`;
    $("#drawer").classList.add("open"); $("#drawer").setAttribute("aria-hidden", "false");
    $("#drawer").scrollTop = 0;
    if (isMobile()) $("#scrim").hidden = true;
    try { history.replaceState(null, "", "#" + encodeURIComponent(id)); } catch (e) { /* nic */ }
    if (!opts.noCenter && S.view !== "seznam") {
      if (!centerOn(id) && S.view === "vejir" && g != null) { setView("strom", { noCenter: true }); centerOn(id); }
    }
  }
  function closeDrawer() {
    $("#drawer").classList.remove("open"); $("#drawer").setAttribute("aria-hidden", "true");
    S.sel = null; paintSel();
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) { /* nic */ }
  }

  /* ---------- hledání ---------- */
  function initSearch() {
    const q = $("#q"), res = $("#results");
    let items = [], act = -1;
    const draw = () => {
      res.innerHTML = items.map((p, i) => `<button type="button" role="option" data-open="${esc(p.id)}" class="${i === act ? "active" : ""}"><span class="dot" style="background:${esc(colorOf(p))}"></span><span>${esc(cleanName(p.name))}<small>${esc([lifeShort(p), S.gen.has(p.id) ? relWord(S.gen.get(p.id), p._sex) : "", branchOf(p).label].filter(Boolean).join(" · "))}</small></span></button>`).join("") || `<p style="padding:10px 12px;margin:0;color:#6b5b43">Nic nenalezeno.</p>`;
      res.classList.toggle("open", !!q.value.trim());
    };
    q.addEventListener("input", () => {
      const terms = fold(q.value).split(/\s+/).filter(Boolean);
      items = terms.length ? [...S.P.values()].filter((p) => (!S.unatt.has(p.id) || F.nepripojene) && terms.every((t) => p._fold.includes(t)))
        .sort((a, b) => (S.gen.get(a.id) ?? 99) - (S.gen.get(b.id) ?? 99)).slice(0, 14) : [];
      act = items.length ? 0 : -1; draw();
    });
    q.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { act = Math.min(items.length - 1, act + 1); draw(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { act = Math.max(0, act - 1); draw(); e.preventDefault(); }
      else if (e.key === "Enter" && items[act]) { pick(items[act].id); }
      else if (e.key === "Escape") { q.value = ""; res.classList.remove("open"); }
    });
    const pick = (id) => { res.classList.remove("open"); q.blur(); openPerson(id); };
    res.addEventListener("click", (e) => { const b = e.target.closest("[data-open]"); if (b) { e.stopPropagation(); pick(b.dataset.open); } });
    document.addEventListener("click", (e) => { if (!e.target.closest(".st-search")) res.classList.remove("open"); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "/" && document.activeElement !== q && !/input|select|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); }
      if (e.key === "Escape") { if ($(".st-lightbox.open")) closeLb(); else if ($("#drawer.open")) closeDrawer(); else S.closeFilters(); }
    });
  }

  /* ---------- lightbox ---------- */
  function openLb(big, url, cap) {
    $("#lb-img").src = big; $("#lb-cap").textContent = cap; $("#lb-full").href = big;
    const a = $("#lb-aron"); if (url) { a.href = url; a.style.display = ""; } else a.style.display = "none";
    $("#lightbox").classList.add("open"); $("#lightbox").setAttribute("aria-hidden", "false");
  }
  function closeLb() { $("#lightbox").classList.remove("open"); $("#lightbox").setAttribute("aria-hidden", "true"); }

  /* ---------- start ---------- */
  async function main() {
    const get = (u) => fetch(u, { cache: "no-cache" }).then((r) => { if (!r.ok) throw new Error(u); return r.json(); });
    const opt = (u) => get(u).catch(() => null);
    [S.data, S.mista, S.zdroje, S.catalog, S.kniha, S.anot] = await Promise.all([
      get("./data/rodokmen.json"), get("./data/mista.json"), opt("./data/zdroje.json"),
      get("./data/povolani-kategorie.json"), opt("./data/kniha/kniha.json"), opt("./data/anotace.json")]);
    S.anot = (S.anot && S.anot.snimky) || {};
    build();
    const anc = [...S.gen.keys()].length;
    $("#meta-line").textContent = `${anc} osob v přímé linii · ${S.maxGen + 1} generací · aktualizace ${S.data.meta.updated.split("-").reverse().map(Number).join(". ")}`;
    $("#legend").innerHTML = `<span><i style="background:linear-gradient(90deg,#1f4e5c,#a6532a,#7a3045)"></i>barva = rod</span><span><i class="lg-doc"></i>doloženo zápisem</span><span><i class="lg-mem"></i>jen rodinná paměť</span>`;
    S.depth = isMobile() ? 5 : 7;
    $("#depth").value = S.depth; $("#depth-out").textContent = S.depth;
    $("#depth").addEventListener("input", (e) => { S.depth = +e.target.value; $("#depth-out").textContent = S.depth; renderFan(); fitView(); });
    initFilters(); initPanZoom(); initSearch();
    $$(".st-views button").forEach((b) => b.addEventListener("click", () => setView(b.dataset.view)));
    $("#t-all").addEventListener("click", () => expandAll(true));
    $("#t-less").addEventListener("click", () => expandAll(false));
    $("#drawer-close").addEventListener("click", closeDrawer);
    document.addEventListener("click", (e) => {
      const o = e.target.closest("[data-open]");
      if (o && !e.target.closest(".st-results")) { openPerson(o.dataset.open); return; }
      const a = e.target.closest("[data-act]");
      if (a && S.sel) { if (a.dataset.act === "root") setRoot(S.sel); else { setView("strom", { noCenter: true }); centerOn(S.sel); } return; }
      const t = e.target.closest(".thumb");
      if (t) openLb(t.dataset.big, t.dataset.url, t.dataset.cap);
    });
    $("#lb-close").addEventListener("click", closeLb);
    $("#lightbox").addEventListener("click", (e) => { if (e.target.id === "lightbox") closeLb(); });
    let v = "vejir";
    const hv = new URLSearchParams(location.search).get("v");
    try { v = hv || localStorage.getItem("rodokmen-view") || "vejir"; } catch (e) { /* nic */ }
    if (!["vejir", "strom", "seznam"].includes(v)) v = "vejir";
    applyFilters();
    setView(v, { noCenter: true });
    const h = decodeURIComponent(location.hash.slice(1));
    if (h && S.P.has(h)) openPerson(h);
    let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (S.view === "vejir") fitView(); }, 150); });
    window.addEventListener("hashchange", () => { const x = decodeURIComponent(location.hash.slice(1)); if (x && S.P.has(x) && x !== S.sel) openPerson(x); });
    scanChapters();
    window.__strom = { S, F, openPerson, setView };
  }
  main().catch((e) => { $("#meta-line").textContent = "Chyba načítání dat: " + e.message; console.error(e); });
})();
