(function () {
  "use strict";
  const R = window.RodokmenMista;
  const $ = (sel, el = document) => el.querySelector(sel);

  const state = {
    data: null,
    events: [],
    unplaced: [],
    gaz: null,
    types: new Set(Object.keys(R.EVENT_TYPES)),
    branches: new Set(),
    yearMin: 1600,
    yearMax: 2026,
    from: 1600,
    to: 2026,
    undated: true,
    unattached: true,
    map: null,
    markers: [],
    layer: null
  };

  function filteredEvents() {
    return state.events.filter((e) => {
      if (!state.types.has(e.type)) return false;
      if (e.branch && state.branches.size && !state.branches.has(e.branch)) return false;
      if (e.unattached && !state.unattached) return false;
      if (e.year == null) return state.undated;
      return e.year >= state.from && e.year <= state.to;
    });
  }

  function groupByPlace(events) {
    const m = new Map();
    for (const e of events) {
      if (!m.has(e.placeId)) {
        m.set(e.placeId, {
          id: e.placeId,
          name: e.placeName,
          lat: e.lat,
          lon: e.lon,
          country: e.country,
          events: []
        });
      }
      m.get(e.placeId).events.push(e);
    }
    return [...m.values()].sort((a, b) => b.events.length - a.events.length);
  }

  function markerIcon(group) {
    const types = new Set(group.events.map((e) => e.type));
    const colors = [...types].map((t) => R.EVENT_TYPES[t].color);
    const n = group.events.length;
    const main = colors[0] || "#1f4e5c";
    const size = n >= 20 ? 36 : n >= 8 ? 30 : 24;
    const swatches = colors.slice(0, 4).map((c, i) =>
      `<span style="background:${c};width:${Math.max(4, (size - 8) / colors.length)}px;height:4px;display:inline-block"></span>`
    ).join("");
    const html = `<div class="m-pin" style="--c:${main};width:${size}px;height:${size}px">
      <span class="m-n">${n}</span>
      <span class="m-dots">${swatches}</span>
    </div>`;
    return L.divIcon({
      className: "m-icon",
      html,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      popupAnchor: [0, -size / 2]
    });
  }

  function eventLine(e) {
    const typ = R.EVENT_TYPES[e.type] || { label: e.type, color: "#333" };
    const when = e.dateDisplay || (e.year ? String(e.year) : "rok není");
    const place = e.placeLabel || e.placeName;
    const maiden = e.maiden ? ` <span class="maiden">roz. ${R.esc(e.maiden)}</span>` : "";
    return `<li class="ev-item">
      <span class="ev-dot" style="background:${typ.color}"></span>
      <div>
        <a href="${R.personLink(e.personId)}">${R.esc(e.personName)}</a>${maiden}
        <div class="ev-meta">${R.esc(typ.label)} · ${R.esc(when)} · ${R.esc(place)}</div>
      </div>
    </li>`;
  }

  function openPlace(group) {
    const panel = $("#panel");
    const byType = {};
    for (const e of group.events) {
      (byType[e.type] ||= []).push(e);
    }
    const people = new Set(group.events.map((e) => e.personId));
    let html = `<h2>${R.esc(group.name)}</h2>
      <p class="sub">${group.events.length} ${group.events.length === 1 ? "údaj" : "údajů"} · ${people.size} ${people.size === 1 ? "osoba" : "osob"}</p>`;
    const placeObj = state.gaz.byId.get(group.id);
    if (placeObj) {
      html += `<p class="sub">${R.esc([placeObj.type, placeObj.admin].filter(Boolean).join(" · "))}</p>`;
      if (placeObj.note) html += `<p class="legend-note">${R.esc(placeObj.note)}</p>`;
    }
    for (const typ of Object.keys(R.EVENT_TYPES)) {
      const list = byType[typ];
      if (!list) continue;
      list.sort((a, b) => (a.year || 9999) - (b.year || 9999) || a.personName.localeCompare(b.personName, "cs"));
      const lab = R.EVENT_TYPES[typ];
      html += `<h3><span class="ev-dot" style="background:${lab.color};display:inline-block;vertical-align:middle;margin-right:6px"></span>${R.esc(lab.label)}</h3>
        <ul class="ev-list">${list.map(eventLine).join("")}</ul>`;
    }
    $("#panel-body").innerHTML = html;
    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
  }

  function closePanel() {
    $("#panel").classList.remove("open");
    $("#panel").setAttribute("aria-hidden", "true");
  }

  function coreBounds(groups) {
    const cz = groups.filter((g) => g.country === "CZ" || g.country === "PL");
    const use = cz.length ? cz : groups;
    if (!use.length) return null;
    return L.latLngBounds(use.map((g) => [g.lat, g.lon]));
  }

  function renderMarkers() {
    if (state.layer) state.layer.clearLayers();
    else {
      state.layer = L.layerGroup().addTo(state.map);
    }
    state.markers = [];
    const groups = groupByPlace(filteredEvents());
    for (const g of groups) {
      const m = L.marker([g.lat, g.lon], { icon: markerIcon(g), title: `${g.name} (${g.events.length})` });
      m.on("click", () => openPlace(g));
      m.addTo(state.layer);
      state.markers.push({ marker: m, group: g });
    }
    const evs = filteredEvents();
    const places = groups.length;
    $("#meta-line").textContent = `${places} míst · ${evs.length} údajů (z ${state.events.length} v datech)`;
  }

  function fitCore() {
    const groups = groupByPlace(filteredEvents());
    const b = coreBounds(groups);
    if (b && b.isValid()) state.map.fitBounds(b.pad(0.18));
  }

  function bindFilters() {
    const typBox = $("#type-filters");
    typBox.innerHTML = Object.entries(R.EVENT_TYPES).map(([id, t]) =>
      `<label class="chk typ-chk"><input type="checkbox" data-type="${id}" checked>
        <span class="ev-dot" style="background:${t.color}"></span>${R.esc(t.label)}</label>`
    ).join("");
    typBox.addEventListener("change", () => {
      state.types = new Set([...typBox.querySelectorAll("input:checked")].map((i) => i.dataset.type));
      renderMarkers();
    });

    const branches = state.data.branches || {};
    state.branches = new Set(Object.keys(branches));
    const brBox = $("#branch-filters");
    brBox.innerHTML = Object.entries(branches).map(([id, b]) =>
      `<button type="button" class="bchip" data-branch="${id}" aria-pressed="true" style="background:${b.color || "#1f4e5c"}">${R.esc(b.label || id)}</button>`
    ).join("");
    brBox.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-branch]");
      if (!btn) return;
      const id = btn.getAttribute("data-branch");
      const on = btn.getAttribute("aria-pressed") !== "true";
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.style.opacity = on ? "1" : ".35";
      if (on) state.branches.add(id); else state.branches.delete(id);
      renderMarkers();
    });

    const years = state.events.map((e) => e.year).filter((y) => y != null);
    const ymin = years.length ? Math.min(...years) : 1700;
    const ymax = years.length ? Math.max(...years) : 2026;
    state.yearMin = ymin; state.yearMax = ymax;
    state.from = ymin; state.to = ymax;
    for (const id of ["year-from", "year-to", "year-from-r", "year-to-r"]) {
      const el = $("#" + id);
      el.min = ymin; el.max = ymax;
    }
    $("#year-from").value = ymin;
    $("#year-to").value = ymax;
    $("#year-from-r").value = ymin;
    $("#year-to-r").value = ymax;

    function applyYears(from, to) {
      from = Math.max(ymin, Math.min(ymax, +from || ymin));
      to = Math.max(ymin, Math.min(ymax, +to || ymax));
      if (from > to) [from, to] = [to, from];
      state.from = from; state.to = to;
      $("#year-from").value = from;
      $("#year-to").value = to;
      $("#year-from-r").value = from;
      $("#year-to-r").value = to;
      renderMarkers();
    }
    $("#year-from").addEventListener("change", () => applyYears($("#year-from").value, $("#year-to").value));
    $("#year-to").addEventListener("change", () => applyYears($("#year-from").value, $("#year-to").value));
    $("#year-from-r").addEventListener("input", () => applyYears($("#year-from-r").value, $("#year-to-r").value));
    $("#year-to-r").addEventListener("input", () => applyYears($("#year-from-r").value, $("#year-to-r").value));
    $("#undated").addEventListener("change", () => { state.undated = $("#undated").checked; renderMarkers(); });
    $("#unattached").addEventListener("change", () => { state.unattached = $("#unattached").checked; renderMarkers(); });
  }

  function renderUnplaced() {
    const box = $("#unplaced-box");
    if (!state.unplaced.length) { box.innerHTML = ""; return; }
    const uniq = [];
    const seen = new Set();
    for (const u of state.unplaced) {
      const k = u.original;
      if (seen.has(k)) continue;
      seen.add(k);
      uniq.push(u);
    }
    box.innerHTML = `<h2>Bez bodu na mapě</h2>
      <p class="legend-note">${uniq.length} ${uniq.length === 1 ? "místo" : "míst"} se souřadnicemi nezaměřuje — nejisté čtení, nezamčená obec, nebo jen země / kraj.</p>
      <ul class="unplaced-list">${uniq.map((u) =>
        `<li><strong>${R.esc(u.original)}</strong><span class="ev-meta">${R.esc(u.reason)}${u.personName ? " · " + R.esc(u.personName) : ""}</span></li>`
      ).join("")}</ul>`;
  }

  function bindSearch() {
    const q = $("#q");
    const box = $("#results");
    function run() {
      const s = q.value.trim().toLowerCase();
      if (s.length < 1) { box.classList.remove("open"); box.innerHTML = ""; return; }
      const groups = groupByPlace(filteredEvents());
      const hits = [];
      for (const g of groups) {
        if (g.name.toLowerCase().includes(s)) hits.push({ kind: "place", g, label: g.name, meta: g.events.length + " údajů" });
        for (const e of g.events) {
          if ((e.personName || "").toLowerCase().includes(s)) {
            hits.push({ kind: "person", g, e, label: e.personName, meta: (R.EVENT_TYPES[e.type] || {}).label + " · " + g.name });
          }
        }
      }
      const seen = new Set();
      const uniq = [];
      for (const h of hits) {
        const k = h.kind + (h.e ? h.e.personId + h.e.type : h.g.id);
        if (seen.has(k)) continue;
        seen.add(k);
        uniq.push(h);
        if (uniq.length >= 20) break;
      }
      if (!uniq.length) { box.classList.remove("open"); box.innerHTML = ""; return; }
      box.innerHTML = uniq.map((h, i) =>
        `<button type="button" data-i="${i}" class="${i === 0 ? "active" : ""}">${R.esc(h.label)}<span class="meta">${R.esc(h.meta)}</span></button>`
      ).join("");
      box.classList.add("open");
      box._hits = uniq;
    }
    q.addEventListener("input", run);
    q.addEventListener("focus", run);
    box.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const h = (box._hits || [])[+btn.dataset.i];
      if (!h) return;
      state.map.setView([h.g.lat, h.g.lon], 13);
      openPlace(h.g);
      box.classList.remove("open");
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".search")) box.classList.remove("open");
    });
  }

  async function main() {
    const [data, mista] = await Promise.all([
      fetch("./data/rodokmen.json").then((r) => r.json()),
      fetch("./data/mista.json").then((r) => r.json())
    ]);
    state.data = data;
    const extracted = R.extractEvents(data, mista);
    state.events = extracted.events;
    state.unplaced = extracted.unplaced;
    state.gaz = extracted.gazetteer;

    state.map = L.map("map", { scrollWheelZoom: true, zoomControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(state.map);
    // výchozí pohled, než se spočítají body
    state.map.setView([50.52, 16.25], 9);

    bindFilters();
    renderUnplaced();
    renderMarkers();
    fitCore();
    bindSearch();

    $("#fit").addEventListener("click", fitCore);
    $("#filters-btn").addEventListener("click", () => {
      const el = $("#filters");
      const on = !el.classList.contains("open");
      el.classList.toggle("open", on);
      // na široké obrazovce je panel vždy vidět; tlačítko schovává
      el.classList.toggle("collapsed", !on);
      $("#filters-btn").setAttribute("aria-pressed", on || window.matchMedia("(min-width: 901px)").matches && !el.classList.contains("collapsed") ? "true" : "false");
    });
    $("#panel-close").addEventListener("click", closePanel);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closePanel();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", main);
  else main();
})();
