
(function () {
  const DATA_URL = "./data/rodokmen.json";

  const $ = (sel, el = document) => el.querySelector(sel);
  const state = { data: null, layout: null, scale: 1, tx: 0, ty: 0, active: null };

  function yearOf(ev) {
    if (!ev) return "";
    if (ev.date) return ev.date.slice(0, 4);
    if (ev.display) {
      const m = String(ev.display).match(/(1[7-9]\d{2}|20\d{2})/);
      return m ? m[1] : "";
    }
    return "";
  }
  function datesLine(p) {
    const b = yearOf(p.birth) || "";
    const d = yearOf(p.death) || "";
    if (b && d) return `*${b}  –  †${d}`;
    if (b) return `*${b}`;
    if (d) return `†${d}`;
    return "";
  }
  function occShort(p) {
    if (!p.occupation) return "";
    const s = p.occupation.replace(/\s+/g, " ").trim();
    return s.length > 64 ? s.slice(0, 61) + "…" : s;
  }
  function certLabel(data, c) {
    return (data.meta.certainty_levels[c] || {}).short || c || "";
  }
  function branchColor(data, b) {
    return (data.branches[b] || {}).color || "#1f4e5c";
  }

  function renderCards(data, L) {
    const world = $(".world");
    world.querySelectorAll(".card").forEach((n) => n.remove());
    for (const p of data.people) {
      const box = L.pos[p.id];
      if (!box) continue;
      const el = document.createElement("button");
      el.type = "button";
      el.className = "card " + (p.certainty || "potvrzeno");
      el.dataset.id = p.id;
      el.style.left = box.x + "px";
      el.style.top = box.y + "px";
      el.style.setProperty("--branch", branchColor(data, p.branch));
      const maiden = p.maiden ? ` <span class="maiden">roz. ${esc(p.maiden)}</span>` : "";
      const badge = p.certainty && p.certainty !== "potvrzeno"
        ? `<span class="badge">${esc(certLabel(data, p.certainty))}</span>` : "";
      const occ = occShort(p);
      el.innerHTML = `${badge}<div class="nm">${esc(p.name)}${maiden}</div>
        <div class="dates">${esc(datesLine(p))}</div>
        ${occ ? `<div class="occ">${esc(occ)}</div>` : ""}`;
      el.addEventListener("click", (e) => { e.stopPropagation(); openPerson(p.id); });
      world.appendChild(el);
    }
  }

  function renderLinks(L) {
    const svg = $(".links");
    svg.setAttribute("width", L.width);
    svg.setAttribute("height", L.height);
    svg.setAttribute("viewBox", `0 0 ${L.width} ${L.height}`);
    svg.innerHTML = L.links.map((l) => {
      const kind = l.type === "ident" ? "link-ident" : l.type === "marry" ? "marry" : "link-" + (l.cert || "potvrzeno");
      const cls = l.type === "marry" ? "marry" : kind;
      return `<path class="${cls}" d="${esc(l.d)}" />`;
    }).join("");
  }

  function applyTransform() {
    $(".world").style.transform = `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})`;
  }
  function fitAll() {
    const L = state.layout;
    const vp = $(".viewport");
    const pad = 40;
    const sx = (vp.clientWidth - pad * 2) / L.width;
    const sy = (vp.clientHeight - pad * 2) / L.height;
    state.scale = Math.min(sx, sy, 1.15);
    state.tx = (vp.clientWidth - L.width * state.scale) / 2;
    state.ty = pad;
    applyTransform();
  }
  function focusId(id, scale) {
    const box = state.layout.pos[id];
    if (!box) return;
    const vp = $(".viewport");
    if (scale) state.scale = scale;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    state.tx = vp.clientWidth / 2 - cx * state.scale;
    state.ty = vp.clientHeight / 2 - cy * state.scale;
    applyTransform();
    document.querySelectorAll(".card.active").forEach((n) => n.classList.remove("active"));
    const el = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
    if (el) el.classList.add("active");
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function openPerson(id) {
    const p = state.data.people.find((x) => x.id === id);
    if (!p) return;
    state.active = id;
    focusId(id);
    const panel = $("#panel");
    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
    const b = state.data.branches[p.branch] || {};
    const cert = state.data.meta.certainty_levels[p.certainty] || {};
    const ev = (e, label) => {
      if (!e) return "";
      const bits = [e.display, e.place].filter(Boolean).join(" · ");
      const note = e.note ? `<div class="meta-note">${esc(e.note)}</div>` : "";
      return `<dt>${label}</dt><dd>${esc(bits)}${note}</dd>`;
    };
    const places = (p.living ? [] : (p.places || [])).map((x) => esc(x)).join("<br>");
    const unions = state.data.unions.filter((u) => (u.partners || []).includes(id) || (u.children || []).includes(id));
    const rels = [];
    for (const u of unions) {
      if ((u.partners || []).includes(id)) {
        const others = (u.partners || []).filter((x) => x !== id).map(nameOf);
        const kids = (u.children || []).map(nameOf);
        const m = u.married ? (u.married.display + (u.married.place ? ", " + u.married.place : "")) : "";
        rels.push(`<li><strong>Svazek</strong>${others.length ? " s " + others.join(", ") : ""} (${esc(u.certainty || "")})${m ? " — " + esc(m) : ""}${kids.length ? "<br>děti: " + kids.join(", ") : ""}</li>`);
      } else {
        const pars = (u.partners || []).map(nameOf);
        rels.push(`<li>Dítě svazku: ${pars.join(" × ")} (${esc(u.certainty || "")})</li>`);
      }
    }
    for (const it of state.data.identifications || []) {
      if (it.a === id || it.b === id) {
        const other = it.a === id ? it.b : it.a;
        rels.push(`<li><strong>Pravděpodobné ztotožnění</strong> s ${nameOf(other)}. ${(it.notes || []).map(esc).join(" ")}</li>`);
      }
    }
    for (const l of state.data.candidate_links || []) {
      if (l.child === id || (l.parents || []).includes(id)) {
        rels.push(`<li class="cand"><strong>Kandidátská vazba (nedoloženo):</strong> ${(l.notes || []).map(esc).join(" ")}</li>`);
      }
    }
    const notes = (p.notes || []).map((n) => `<li>${esc(n)}</li>`).join("");
    const interesting = (p.interesting || []).map((n) => `<li>${esc(n)}</li>`).join("");
    const sources = (p.sources || []).map((s) => {
      const det = [s.signatura, s.detail].filter(Boolean).join(" — ");
      const apu = s.apu ? ` <a href="${esc(s.apu)}" target="_blank" rel="noopener noreferrer">ARON</a>` : "";
      return `<li>${esc(s.label)}${det ? ": " + esc(det) : ""}${apu}</li>`;
    }).join("");
    const alert = p.certainty === "kandidat"
      ? `<div class="alert">${esc(cert.description || "Tato položka není v zápisech tvrdé doložena.")}</div>`
      : p.certainty === "pravdepodobne"
        ? `<div class="alert warn">${esc(cert.description || "")}</div>` : "";
    $("#panel-body").innerHTML = `
      <h2>${esc(p.name)}${p.maiden ? ` <span class="maiden">roz. ${esc(p.maiden)}</span>` : ""}</h2>
      <p class="sub">
        <span class="pill" style="background:${branchColor(state.data, p.branch)}">${esc(b.label || p.branch || "")}</span>
        &nbsp;${esc(cert.label || p.certainty || "")}
      </p>
      ${alert}
      <dl class="kv">
        ${ev(p.birth, "Narození")}
        ${ev(p.baptism, "Křest")}
        ${ev(p.death, "Úmrtí")}
        ${p.occupation ? `<dt>Povolání</dt><dd>${esc(p.occupation)}</dd>` : ""}
        ${places ? `<dt>Místa</dt><dd>${places}</dd>` : ""}
        <dt>Větev</dt><dd>${esc(b.label || p.branch || "—")}</dd>
        <dt>Jistota</dt><dd>${esc(cert.label || p.certainty || "—")}</dd>
        <dt>Id</dt><dd><code>${esc(p.id)}</code></dd>
      </dl>
      ${rels.length ? `<h3>Vazby</h3><ul class="notes">${rels.join("")}</ul>` : ""}
      ${interesting ? `<h3>Zajímavosti</h3><ul class="notes">${interesting}</ul>` : ""}
      ${notes ? `<h3>Poznámky</h3><ul class="notes">${notes}</ul>` : ""}
      ${sources ? `<h3>Zdroje</h3><ul class="sources">${sources}</ul>` : ""}
      <p class="footer-note">Údaje výhradně z ledgeru ROD-1.md a ROD-1-doplneni.md. Nic není doplněno z domněnky. U žijících osob se neuveřejňují adresy ani čísla domů.</p>
    `;
  }
  function nameOf(id) {
    const p = state.data.people.find((x) => x.id === id);
    if (!p) return esc(id);
    return `<button type="button" class="linkish" data-jump="${esc(id)}">${esc(p.name)}</button>`;
  }

  function closePanel() {
    $("#panel").classList.remove("open");
    $("#panel").setAttribute("aria-hidden", "true");
    document.querySelectorAll(".card.active").forEach((n) => n.classList.remove("active"));
  }

  function bindPanZoom() {
    const vp = $("#viewport");
    let dragging = false, lx = 0, ly = 0;
    vp.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".card, .panel, .topbar, .legend, .questions, .search-results")) return;
      dragging = true; lx = e.clientX; ly = e.clientY;
      vp.classList.add("dragging");
      vp.setPointerCapture(e.pointerId);
    });
    vp.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      state.tx += e.clientX - lx; state.ty += e.clientY - ly;
      lx = e.clientX; ly = e.clientY; applyTransform();
    });
    const end = () => { dragging = false; vp.classList.remove("dragging"); };
    vp.addEventListener("pointerup", end);
    vp.addEventListener("pointercancel", end);
    vp.addEventListener("wheel", (e) => {
      e.preventDefault();
      const rect = vp.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      const old = state.scale;
      const next = Math.min(2.8, Math.max(0.12, old * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      const wx = (px - state.tx) / old, wy = (py - state.ty) / old;
      state.scale = next;
      state.tx = px - wx * next;
      state.ty = py - wy * next;
      applyTransform();
    }, { passive: false });
    // pinch
    const pointers = new Map();
    let pinch = null;
    vp.addEventListener("pointerdown", (e) => { pointers.set(e.pointerId, e); });
    vp.addEventListener("pointerup", (e) => { pointers.delete(e.pointerId); pinch = null; });
    vp.addEventListener("pointermove", (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, e);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const cx = (a.clientX + b.clientX) / 2, cy = (a.clientY + b.clientY) / 2;
        if (!pinch) pinch = { dist, scale: state.scale, cx, cy };
        else {
          const rect = vp.getBoundingClientRect();
          const px = cx - rect.left, py = cy - rect.top;
          const old = state.scale;
          const next = Math.min(2.8, Math.max(0.12, pinch.scale * (dist / pinch.dist)));
          const wx = (px - state.tx) / old, wy = (py - state.ty) / old;
          state.scale = next;
          state.tx = px - wx * next;
          state.ty = py - wy * next;
          applyTransform();
        }
      }
    });
  }

  function bindSearch(data) {
    const input = $("#q");
    const box = $("#results");
    let items = [];
    function run() {
      const q = input.value.trim().toLowerCase();
      if (!q) { box.classList.remove("open"); box.innerHTML = ""; return; }
      items = data.people.filter((p) => {
        const blob = [p.name, p.maiden, p.id, p.occupation, datesLine(p), ...(p.notes || [])].join(" ").toLowerCase();
        return blob.includes(q);
      }).slice(0, 20);
      box.innerHTML = items.map((p, i) =>
        `<button type="button" data-i="${i}" class="${i === 0 ? "active" : ""}"><strong>${esc(p.name)}</strong><span class="meta">${esc(datesLine(p))} · ${esc((data.branches[p.branch] || {}).label || "")}</span></button>`
      ).join("") || `<button type="button" disabled>Nic nenalezeno</button>`;
      box.classList.add("open");
    }
    input.addEventListener("input", run);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { box.classList.remove("open"); input.blur(); return; }
      if (e.key === "Enter") {
        const first = items[0];
        if (first) { openPerson(first.id); box.classList.remove("open"); }
      }
    });
    box.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-i]");
      if (!btn) return;
      const p = items[+btn.dataset.i];
      if (p) { openPerson(p.id); box.classList.remove("open"); }
    });
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".search")) box.classList.remove("open");
    });
  }

  function fillQuestions(data) {
    const host = $("#questions-body");
    const items = data.open_questions || [];
    if (!host) return;
    if (!items.length) {
      host.innerHTML = "<p class=\"questions-lead\">Žádný otevřený dotaz.</p>";
      return;
    }
    host.innerHTML = items.map((q) => {
      const rel = (q.related_ids || []).map((id) => {
        const person = data.people.find((x) => x.id === id);
        const label = person ? person.name : id;
        return `<button type="button" class="linkish" data-jump="${esc(id)}">${esc(label)}</button>`;
      }).join(", ");
      const src = (q.sources || []).map((s) => {
        const bits = [s.label, s.signatura, s.detail].filter(Boolean);
        return esc(bits.join(" — "));
      }).filter(Boolean).join("; ");
      return `<article class="q-item">
        <h3>${esc(q.title || q.id || "Dotaz")}</h3>
        ${q.summary ? `<p class="q-sum">${esc(q.summary)}</p>` : ""}
        ${q.details ? `<p class="q-det">${esc(q.details)}</p>` : ""}
        ${rel ? `<p class="q-rel">V mapě: ${rel}</p>` : ""}
        ${src ? `<p class="q-src">${src}</p>` : ""}
      </article>`;
    }).join("");
  }

  function setQuestionsOpen(on) {
    const box = $("#questions");
    const btn = $("#questions-btn");
    if (!box) return;
    box.classList.toggle("open", on);
    box.setAttribute("aria-hidden", on ? "false" : "true");
    btn?.setAttribute("aria-pressed", on ? "true" : "false");
    if (on) {
      $("#legend")?.classList.remove("mobile-open");
      $("#legend-btn")?.setAttribute("aria-pressed", "false");
    }
  }

  function fillLegend(data) {
    const host = $("#branch-chips");
    host.innerHTML = Object.entries(data.branches).map(([k, v]) =>
      `<span class="bchip" style="background:${v.color}">${esc(v.label)}</span>`
    ).join("");
  }

  async function main() {
    let data;
    try {
      const res = await fetch(DATA_URL);
      if (!res.ok) throw new Error("HTTP " + res.status);
      data = await res.json();
    } catch (err) {
      document.body.insertAdjacentHTML("afterbegin",
        `<div class="alert" style="margin:80px 20px">Nepodařilo se načíst <code>data/rodokmen.json</code>. Otevřete stránku přes místní server (viz JAK-DOPLNIT.md), ne jako soubor file://. ${esc(err.message)}</div>`);
      return;
    }
    state.data = data;
    const L = RodokmenLayout.layout(data);
    state.layout = L;
    const world = $(".world");
    world.style.width = L.width + "px";
    world.style.height = L.height + "px";
    renderLinks(L);
    renderCards(data, L);
    fillLegend(data);
    fillQuestions(data);
    bindPanZoom();
    bindSearch(data);
    $("#fit").addEventListener("click", fitAll);
    $("#focus").addEventListener("click", () => { focusId(data.meta.focus, 1.05); openPerson(data.meta.focus); });
    $("#legend-btn")?.addEventListener("click", () => {
      const lg = $("#legend");
      const on = lg.classList.toggle("mobile-open");
      $("#legend-btn").setAttribute("aria-pressed", on ? "true" : "false");
      if (on) setQuestionsOpen(false);
    });
    $("#questions-btn")?.addEventListener("click", () => {
      const box = $("#questions");
      setQuestionsOpen(!box.classList.contains("open"));
    });
    $("#questions-close")?.addEventListener("click", () => setQuestionsOpen(false));
    $("#questions")?.addEventListener("click", (e) => {
      const jump = e.target.closest("[data-jump]");
      if (jump) openPerson(jump.getAttribute("data-jump"));
    });
    $("#panel-close").addEventListener("click", closePanel);
    $("#panel").addEventListener("click", (e) => {
      const jump = e.target.closest("[data-jump]");
      if (jump) openPerson(jump.getAttribute("data-jump"));
    });
    $("#viewport").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) closePanel();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { closePanel(); setQuestionsOpen(false); }
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault(); $("#q").focus();
      }
    });
    const qn = (data.open_questions || []).length;
    const counts = `${data.people.length} osob · ${L.generations} generací · ${Object.keys(data.branches).length} větví` + (qn ? ` · ${qn} otevřených dotazů` : "");
    $("#meta-line").textContent = counts + " · aktualizace " + (data.meta.updated || "");
    fitAll();
    // mírně přiblížit na Štěpána po fit, ale nechat vidět i rodiče
    setTimeout(() => focusId(data.meta.focus, Math.min(1.05, Math.max(state.scale, 0.7))), 50);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", main);
  else main();
})();
