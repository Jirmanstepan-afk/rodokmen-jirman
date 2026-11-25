(function () {
  "use strict";
  const R = window.RodokmenMista;
  const $ = (sel, el = document) => el.querySelector(sel);

  const JOB_ORDER = [
    "sedlak", "chalupnik", "podruh", "vymenkar", "tkadlec", "krejci", "obuvnik",
    "tesar", "truhlar", "mlynar", "zahradnik", "nadenik", "delenik", "zeleznicar",
    "sluzebna", "rychtar", "mestan", "vojak", "jine"
  ];
  const OTHER = ["status", "rodina", "neuvedeno"];
  const COLORS = {
    sedlak: "#2f6b4a", chalupnik: "#5a7a3a", podruh: "#6b4e32", vymenkar: "#8a7d68",
    tkadlec: "#3d5a80", krejci: "#4d6a8a", obuvnik: "#4a6670", tesar: "#7a4a62",
    truhlar: "#6b4c7a", mlynar: "#2d6a6a", zahradnik: "#3a6e5c", nadenik: "#9a6b16",
    delenik: "#a6532a", zeleznicar: "#1f4e5c", sluzebna: "#8b4d6b", rychtar: "#b08d2e",
    mestan: "#7a3045", vojak: "#5c4a6b", jine: "#7a7163"
  };

  let allRows = [];
  let catalog = null;
  let data = null;
  const catById = {};

  function currentRows() {
    const br = $("#branch-sel").value;
    const ce = $("#century-sel").value;
    const una = $("#unattached").checked;
    return allRows.filter((r) => {
      if (!una && r.unattached) return false;
      if (br && r.branch !== br) return false;
      if (ce === "none" && r.century != null) return false;
      if (ce && ce !== "none" && String(r.century) !== ce) return false;
      return true;
    });
  }

  function renderChart(rows) {
    const counts = {};
    for (const id of JOB_ORDER) counts[id] = 0;
    for (const r of rows) {
      for (const c of r.jobs) counts[c.id] = (counts[c.id] || 0) + 1;
    }
    const items = JOB_ORDER.map((id) => ({ id, n: counts[id] || 0, cat: catById[id] })).filter((x) => x.n && x.cat);
    const max = Math.max(1, ...items.map((x) => x.n));
    if (!items.length) {
      $("#chart").innerHTML = "<p class=\"legend-note\">V tomto filtru není žádné zařazené povolání.</p>";
      return;
    }
    $("#chart").innerHTML = items.map((it) => {
      const pct = Math.max(3, (it.n / max) * 100);
      const color = COLORS[it.id] || "#1f4e5c";
      return `<div class="bar-row">
        <span class="bar-lab">${R.esc(it.cat.label)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${pct}%;background:${color}"></span></span>
        <span class="bar-n">${it.n}</span>
      </div>`;
    }).join("");
  }

  function personLine(r) {
    const years = r.birthYear ? `*${r.birthYear}` : "";
    const br = (data.branches[r.branch] || {}).label || r.branch || "";
    return `<li>
      <a href="${R.personLink(r.person.id)}">${R.esc(r.person.name)}</a>
      <span class="ev-meta">${[years, br, r.unattached ? "nepřipojená větev" : ""].filter(Boolean).join(" · ")}</span>
      ${r.raw ? `<div class="occ-orig">„${R.esc(r.raw)}“</div>` : ""}
    </li>`;
  }

  function renderSections(rows) {
    const box = $("#occ-sections");
    const groups = {};
    for (const r of rows) {
      const ids = r.categories.map((c) => c.id);
      if (!ids.length) ids.push("neuvedeno");
      for (const id of ids) (groups[id] ||= []).push(r);
    }
    const parts = [];
    function section(id) {
      const cat = catById[id] || { id, label: id, explain: "" };
      const list = groups[id] || [];
      list.sort((a, b) => (a.birthYear || 9999) - (b.birthYear || 9999) || a.person.name.localeCompare(b.person.name, "cs"));
      parts.push(`<article class="occ-sec" id="cat-${id}">
        <h2>${R.esc(cat.label)} <span class="occ-count">${list.length}</span></h2>
        ${cat.explain ? `<p class="occ-explain">${R.esc(cat.explain)}</p>` : ""}
        ${list.length ? `<ul class="occ-people">${list.map(personLine).join("")}</ul>` : "<p class=\"legend-note\">V tomto filtru nikdo.</p>"}
      </article>`);
    }
    for (const id of JOB_ORDER) {
      if (groups[id] && groups[id].length) section(id);
    }
    for (const id of OTHER) section(id);
    box.innerHTML = parts.join("");
  }

  function render() {
    const rows = currentRows();
    const jobsPeople = rows.filter((r) => r.jobs.length).length;
    const none = rows.filter((r) => r.kind === "neuvedeno").length;
    $("#meta-line").textContent = `${rows.length} osob v přehledu · ${jobsPeople} s uvedeným povoláním · ${none} neuvedeno`;
    renderChart(rows);
    renderSections(rows);
  }

  async function main() {
    const [d, cat] = await Promise.all([
      fetch("./data/rodokmen.json").then((r) => r.json()),
      fetch("./data/povolani-kategorie.json").then((r) => r.json())
    ]);
    data = d;
    catalog = cat;
    for (const c of cat.categories || []) catById[c.id] = c;
    catById.jine = catById.jine || { id: "jine", label: "Jiné / nezařazené znění", explain: "Znění z dat se nepodařilo zařadit do připravených kategorií." };
    allRows = R.extractOccupations(d, cat);

    const brSel = $("#branch-sel");
    brSel.innerHTML = `<option value="">Všechny větve</option>` + Object.entries(d.branches || {}).map(([id, b]) =>
      `<option value="${id}">${R.esc(b.label || id)}</option>`
    ).join("");
    const centuries = [...new Set(allRows.map((r) => r.century).filter((x) => x != null))].sort();
    const ceSel = $("#century-sel");
    ceSel.innerHTML = `<option value="">Všechna století</option>` +
      centuries.map((c) => `<option value="${c}">${c}–${c + 99}</option>`).join("") +
      `<option value="none">Rok narození není</option>`;

    brSel.addEventListener("change", render);
    ceSel.addEventListener("change", render);
    $("#unattached").addEventListener("change", render);
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", main);
  else main();
})();
