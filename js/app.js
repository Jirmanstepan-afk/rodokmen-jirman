
(function () {
  const DATA_URL = "./data/rodokmen.json";
  const ZDROJE_URL = "./data/zdroje.json";

  const $ = (sel, el = document) => el.querySelector(sel);
  const state = { data: null, zdroje: null, layout: null, scale: 1, tx: 0, ty: 0, active: null };


  function unattachedPeople(data) {
    const out = [];
    for (const b of data.unattached_branches || []) out.push(...(b.people || []));
    return out;
  }
  function unattachedUnions(data) {
    const out = [];
    for (const b of data.unattached_branches || []) out.push(...(b.unions || []));
    return out;
  }
  function allPeople(data) {
    return [...(data.people || []), ...unattachedPeople(data)];
  }
  function allUnions(data) {
    return [...(data.unions || []), ...unattachedUnions(data)];
  }
  function findPerson(data, id) {
    return allPeople(data).find((x) => x.id === id);
  }
  function isUnattached(data, id) {
    return unattachedPeople(data).some((x) => x.id === id);
  }
  function unattachedBranchOf(data, id) {
    return (data.unattached_branches || []).find((b) => (b.people || []).some((x) => x.id === id));
  }

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
    const focus = data.meta.focus;
    for (const p of data.people) {
      const box = L.pos[p.id];
      if (!box) continue;
      const el = document.createElement("button");
      el.type = "button";
      const lineage = p.id === focus || L.ancestors.has(p.id);
      el.className = "card " + (p.certainty || "potvrzeno") + (lineage ? " lineage" : "") + (p.id === focus ? " focus" : "") + (p.living ? " living" : "");
      el.dataset.id = p.id;
      el.style.left = box.x + "px";
      el.style.top = box.y + "px";
      el.style.width = box.w + "px";
      el.style.height = box.h + "px";
      el.style.setProperty("--branch", branchColor(data, p.branch));
      const maiden = p.maiden ? ` <span class="maiden">roz. ${esc(p.maiden)}</span>` : "";
      const badge = p.certainty && p.certainty !== "potvrzeno"
        ? `<span class="badge">${esc(certLabel(data, p.certainty))}</span>` : "";
      const occ = occShort(p);
      const nsrc = sourceCount(p);
      el.innerHTML = `${badge}<div class="nm">${esc(p.name)}${maiden}</div>
        <div class="dates">${esc(datesLine(p))}</div>
        ${occ ? `<div class="occ">${esc(occ)}</div>` : ""}
        ${nsrc.img ? `<span class="has-img" title="${nsrc.img} snímků zápisu">&#9638; ${nsrc.img}</span>` : ""}`;
      el.title = `${p.name}${datesLine(p) ? " · " + datesLine(p) : ""}`;
      el.addEventListener("click", (e) => { e.stopPropagation(); openPerson(p.id); });
      el.addEventListener("mouseenter", () => { if (!state.active) highlightPath(p.id, true); });
      el.addEventListener("mouseleave", () => { if (!state.active) clearHighlight(); });
      world.appendChild(el);
    }
  }

  const GEN_NAMES = ["Štěpán", "rodiče", "prarodiče", "praprarodiče"];
  function genLabel(row) {
    if (row < 0) return row === -1 ? "děti" : `potomci ${-row}. kol.`;
    if (row < GEN_NAMES.length) return GEN_NAMES[row];
    return `${row - 1}× pra- prarodiče`.replace(/^1× pra- /, "pra");
  }
  function genLabelFull(row) {
    if (row <= 3) return genLabel(row);
    return "pra".repeat(row - 1) + "rodiče";
  }

  function renderLinks(L) {
    const svg = $(".links");
    svg.setAttribute("width", L.width);
    svg.setAttribute("height", L.height);
    svg.setAttribute("viewBox", `0 0 ${L.width} ${L.height}`);
    const bands = L.rows.map((r, i) => {
      const y = r.y - 22, h = L.CARD_H + 44;
      const label = r.row >= 0 ? `${r.row}. generace` : "potomci";
      return `<g class="gen-band${i % 2 ? " odd" : ""}">
        <rect x="0" y="${y}" width="${L.width}" height="${h}" rx="0" />
        <text class="gen-num" x="22" y="${r.y + L.CARD_H / 2 - 4}">${esc(label)}</text>
        <text class="gen-name" x="22" y="${r.y + L.CARD_H / 2 + 14}">${esc(genLabelFull(r.row))}</text>
      </g>`;
    }).join("");
    const paths = L.links.map((l, i) => {
      const cls = ["lk", l.kind, "c-" + (l.cert || "potvrzeno"), l.lineage ? "lineage" : ""].join(" ");
      return `<path class="${cls}" data-i="${i}" data-people="${esc((l.people || []).join(" "))}" data-union="${esc(l.union || "")}" d="${esc(l.d)}" />`;
    });
    // přímá linie nakonec (navrch)
    const order = L.links.map((l, i) => [l.lineage ? 1 : 0, i]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    const marks = L.markers.map((m) => {
      const t = m.married && m.married.display ? `Sňatek: ${m.married.display}${m.married.place ? ", " + m.married.place : ""}` : "Svazek";
      return `<g class="union-mark${m.lineage ? " lineage" : ""} c-${esc(m.cert)}" data-union="${esc(m.union)}" data-people="${esc(m.people.join(" "))}" transform="translate(${m.x} ${m.y})">
        <title>${esc(t)}</title>
        <circle r="10" />
        <path d="M0 4.2 C -5.2 0.6 -5.6 -3.8 -2.6 -4.4 C -1.3 -4.7 -0.3 -3.9 0 -3 C 0.3 -3.9 1.3 -4.7 2.6 -4.4 C 5.6 -3.8 5.2 0.6 0 4.2 Z" />
      </g>`;
    }).join("");
    svg.innerHTML = `<g class="bands">${bands}</g><g class="paths">${order.map((i) => paths[i]).join("")}</g><g class="marks">${marks}</g>`;
  }

  function highlightPath(id, soft) {
    const L = state.layout;
    const focus = state.data.meta.focus;
    const res = RodokmenLayout.pathTo(state.data, id, focus);
    const world = $(".world");
    world.classList.add(soft ? "hl-soft" : "hl");
    world.classList.remove(soft ? "hl" : "hl-soft");
    document.querySelectorAll(".on-path").forEach((n) => n.classList.remove("on-path"));
    if (!res) return;
    const ppl = new Set(res.people);
    const uni = new Set(res.unions);
    for (const pid of ppl) {
      const el = document.querySelector(`.card[data-id="${CSS.escape(pid)}"]`);
      if (el) el.classList.add("on-path");
    }
    document.querySelectorAll(".links .lk").forEach((p) => {
      const u = p.getAttribute("data-union");
      if (!uni.has(u)) return;
      const ps = (p.getAttribute("data-people") || "").split(" ");
      if (p.classList.contains("couple")) {
        if (ps.filter((x) => ppl.has(x)).length >= 2) p.classList.add("on-path");
      } else {
        // dítě musí být na cestě a aspoň jeden rodič
        const child = ps[ps.length - 1];
        if (ppl.has(child) && ps.slice(0, -1).some((x) => ppl.has(x))) p.classList.add("on-path");
      }
    });
    document.querySelectorAll(".links .union-mark").forEach((m) => {
      if (uni.has(m.getAttribute("data-union"))) m.classList.add("on-path");
    });
    const bar = $("#pathbar");
    if (bar && !soft) {
      const names = res.people.map((x) => (findPerson(state.data, x) || {}).name || x);
      bar.innerHTML = `<span class="pb-lbl">Cesta ke Štěpánovi (${res.people.length - 1} ${res.people.length - 1 === 1 ? "krok" : res.people.length - 1 < 5 ? "kroky" : "kroků"}):</span> ` +
        res.people.map((x, i) => `<button type="button" class="linkish" data-jump="${esc(x)}">${esc(names[i])}</button>`).join(' <span class="arr">→</span> ');
      bar.classList.toggle("open", res.people.length > 1);
    }
  }
  function clearHighlight() {
    const world = $(".world");
    world.classList.remove("hl", "hl-soft");
    document.querySelectorAll(".on-path").forEach((n) => n.classList.remove("on-path"));
    const bar = $("#pathbar");
    if (bar) bar.classList.remove("open");
  }

  /* ---------- zdroje: odkazy a fotky ---------- */
  const FAMILY_DOC = /(rodný|křestní|rodokmen|podklad uživatele|sdělení|rodinn)/i;
  function snimkyOf(s) {
    const z = state.zdroje || {};
    const out = [];
    if (s.snimek != null) out.push(...(Array.isArray(s.snimek) ? s.snimek : [s.snimek]));
    const det = String(s.detail || "");
    let m = det.match(/snímky\s+(\d+)\s*[–-]\s*(\d+)/);
    if (m) for (let n = +m[1]; n <= +m[2]; n++) out.push(n);
    m = det.match(/snímky\s+([\d ,a]+)/);
    if (m) out.push(...(m[1].match(/\d+/g) || []).map(Number));
    for (const mm of det.matchAll(/snímek\s+(\d+)/g)) out.push(+mm[1]);
    if (!out.length && s.signatura) {
      for (const [k, n] of Object.entries(z.aliasy || {})) {
        const [sig, txt] = [k.slice(0, k.indexOf("|")), k.slice(k.indexOf("|") + 1)];
        if (sig === s.signatura && txt && det.includes(txt)) out.push(+n);
      }
    }
    return [...new Set(out.map(Number))];
  }
  function resolveSource(s) {
    const z = state.zdroje || { knihy: {}, snimky: {} };
    const isFamily = !s.signatura && FAMILY_DOC.test(s.label || "");
    const shots = [];
    if (s.signatura) {
      for (const n of snimkyOf(s)) {
        const e = (z.snimky || {})[`${s.signatura}|${n}`];
        shots.push({ n, url: e && e.url, img: e && e.nahled, big: e && e.velky, crop: e && e.vyrez });
      }
    }
    const book = s.signatura && (z.knihy || {})[s.signatura];
    let url = s.url || (shots.find((x) => x.url) || {}).url || (book && book.url) || s.apu || null;
    if (url && !/^https:\/\//.test(url)) url = null;
    if (s.image && !isFamily) shots.unshift({ n: null, url, img: s.image, big: s.image_full || s.image, crop: "zápis" });
    return { isFamily, shots, url, book };
  }
  function sourceCount(p) {
    let img = 0;
    for (const s of p.sources || []) img += resolveSource(s).shots.filter((x) => x.img).length;
    return { img };
  }
  function sourceItem(s, opts = {}) {
    const r = resolveSource(s);
    const det = [s.signatura, s.detail].filter(Boolean).join(" — ");
    const title = `${esc(s.label)}${det ? ": " + esc(det) : ""}`;
    if (r.isFamily) {
      return `<li class="src fam"><span class="src-t">${title}</span>
        <span class="src-note">Rodinný dokument — na veřejné mapě se nezveřejňuje (obsahuje žijící osoby).</span></li>`;
    }
    const links = r.shots.filter((x) => x.url).map((x) =>
      `<a class="src-link" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">ARON snímek ${x.n} ↗</a>`);
    if (!links.length && r.url) links.push(`<a class="src-link" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">ARON kniha ${esc(s.signatura || "")} ↗</a>`);
    const thumbs = opts.noThumbs ? "" : r.shots.filter((x) => x.img).map((x) =>
      `<button type="button" class="thumb" data-big="${esc(x.big || x.img)}" data-url="${esc(x.url || "")}" data-cap="${esc((s.label || "") + " · " + (s.signatura || "") + (x.n ? " · snímek " + x.n : ""))}" data-crop="${esc(x.crop || "")}">
        <img loading="lazy" src="${esc(x.img)}" alt="Snímek ${x.n || ""} ${esc(s.signatura || "")}">
        <span class="thumb-cap">${x.crop === "zápis" ? "výřez zápisu" : "celá strana"}${x.n ? " · snímek " + x.n : ""}</span>
      </button>`).join("");
    return `<li class="src"><span class="src-t">${title}</span>${links.length ? `<span class="src-links">${links.join(" ")}</span>` : ""}${thumbs ? `<div class="thumbs">${thumbs}</div>` : ""}</li>`;
  }

  function openLightbox(big, url, cap, crop) {
    const lb = $("#lightbox");
    $("#lb-img").src = big;
    $("#lb-cap").textContent = cap + (crop === "zápis" ? " — výřez zápisu" : crop ? " — celá strana" : "");
    const a = $("#lb-aron");
    if (url) { a.href = url; a.style.display = ""; } else a.style.display = "none";
    $("#lb-full").href = big;
    lb.classList.add("open");
    lb.setAttribute("aria-hidden", "false");
  }
  function closeLightbox() {
    const lb = $("#lightbox");
    lb.classList.remove("open");
    lb.setAttribute("aria-hidden", "true");
    $("#lb-img").removeAttribute("src");
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
  function initialView(data, L) {
    const f = data.meta.focus;
    const ids = [f];
    const ups = (id) => {
      const u = (data.unions || []).find((x) => (x.children || []).includes(id));
      return u ? (u.partners || []) : [];
    };
    for (const p of ups(f)) ids.push(p);
    const boxes = ids.map((id) => L.pos[id]).filter(Boolean);
    if (!boxes.length) return;
    const x0 = Math.min(...boxes.map((b) => b.x)), x1 = Math.max(...boxes.map((b) => b.x + b.w));
    const y0 = Math.min(...boxes.map((b) => b.y)), y1 = Math.max(...boxes.map((b) => b.y + b.h));
    const vp = $(".viewport");
    const s = Math.max(0.55, Math.min(1, (vp.clientWidth - 60) / (x1 - x0), (vp.clientHeight - 90) / (y1 - y0)));
    state.scale = s;
    const fb = L.pos[f];
    // na úzkém displeji centrovat na Štěpána, jinak na celou skupinu
    const cx = (x1 - x0) * s > vp.clientWidth ? fb.x + fb.w / 2 : (x0 + x1) / 2;
    state.tx = vp.clientWidth / 2 - cx * s;
    state.ty = vp.clientHeight / 2 - ((y0 + y1) / 2) * s;
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
    // na mobilu panel zakrývá spodní část obrazovky -> osobu dát nahoru
    const mobile = window.matchMedia("(max-width: 720px)").matches;
    state.ty = (mobile ? vp.clientHeight * 0.16 : vp.clientHeight / 2) - cy * state.scale;
    applyTransform();
    document.querySelectorAll(".card.active").forEach((n) => n.classList.remove("active"));
    const el = document.querySelector(`.card[data-id="${CSS.escape(id)}"]`);
    if (el) el.classList.add("active");
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function syncHash(id) {
    const want = id ? "#" + encodeURIComponent(id) : "";
    const now = location.hash || "";
    if (now !== want) history.replaceState(null, "", want ? want : location.pathname + location.search);
  }

  function openPerson(id) {
    const p = findPerson(state.data, id);
    if (!p) return;
    state.active = id;
    syncHash(id);
    if (!isUnattached(state.data, id)) { focusId(id); highlightPath(id, false); }
    else { clearHighlight(); document.querySelectorAll(".card.active").forEach((n) => n.classList.remove("active")); }
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
    const unions = allUnions(state.data).filter((u) => (u.partners || []).includes(id) || (u.children || []).includes(id));
    const rels = [];
    for (const u of unions) {
      if ((u.partners || []).includes(id)) {
        const others = (u.partners || []).filter((x) => x !== id).map(nameOf);
        const kids = (u.children || []).map(nameOf);
        const m = u.married ? (u.married.display + (u.married.place ? ", " + u.married.place : "")) : "";
        const us = (u.sources || []).length ? `<ul class="sources inner">${(u.sources || []).map((s) => sourceItem(s)).join("")}</ul>` : "";
        rels.push(`<li><strong>Svazek</strong>${others.length ? " s " + others.join(", ") : ""} (${esc(u.certainty || "")})${m ? " — " + esc(m) : ""}${kids.length ? "<br>děti: " + kids.join(", ") : ""}${us}</li>`);
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
    const sources = (p.sources || []).map((s) => sourceItem(s)).join("");
    const alert = p.certainty === "kandidat"
      ? `<div class="alert">${esc(cert.description || "Tato položka není v zápisech tvrdé doložena.")}</div>`
      : p.certainty === "pravdepodobne"
        ? `<div class="alert warn">${esc(cert.description || "")}</div>` : "";
    const ub = unattachedBranchOf(state.data, id);
    const ubNote = ub ? `<div class="alert warn">Tato osoba je v nepřipojené větvi „${esc(ub.title)}“ — v hlavním grafu není spojena se Štěpánem. ${esc(ub.reason || "")}</div>` : "";
    $("#panel-body").innerHTML = `
      <h2>${esc(p.name)}${p.maiden ? ` <span class="maiden">roz. ${esc(p.maiden)}</span>` : ""}</h2>
      <p class="sub">
        <span class="pill" style="background:${branchColor(state.data, p.branch)}">${esc(b.label || p.branch || "")}</span>
        &nbsp;${esc(cert.label || p.certainty || "")}
      </p>
      ${ubNote}
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
      ${sources ? `<h3>Zdroje <span class="h-note">klik na fotku = zvětšit · odkaz otevře snímek v archivu</span></h3><ul class="sources">${sources}</ul>` : ""}
      <p class="footer-note">Údaje výhradně z ledgeru ROD-1.md a ROD-1-doplneni.md. Nic není doplněno z domněnky. U žijících osob se neuveřejňují adresy ani čísla domů.</p>
    `;
  }
  function nameOf(id) {
    const p = findPerson(state.data, id);
    if (!p) return esc(id);
    return `<button type="button" class="linkish" data-jump="${esc(id)}">${esc(p.name)}</button>`;
  }

  function closePanel() {
    state.active = null;
    clearHighlight();
    $("#panel").classList.remove("open");
    $("#panel").setAttribute("aria-hidden", "true");
    document.querySelectorAll(".card.active").forEach((n) => n.classList.remove("active"));
    syncHash("");
  }

  function bindPanZoom() {
    const vp = $("#viewport");
    let dragging = false, lx = 0, ly = 0;
    vp.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".card, .panel, .topbar, .legend, .questions, .search-results, .pathbar, .lightbox")) return;
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
      items = allPeople(data).filter((p) => {
        const blob = [p.name, p.maiden, p.id, p.occupation, datesLine(p), ...(p.notes || [])].join(" ").toLowerCase();
        return blob.includes(q);
      }).slice(0, 20);
      box.innerHTML = items.map((p, i) => {
        const tag = isUnattached(data, p.id) ? " · nepřipojená větev" : "";
        return `<button type="button" data-i="${i}" class="${i === 0 ? "active" : ""}"><strong>${esc(p.name)}</strong><span class="meta">${esc(datesLine(p))} · ${esc((data.branches[p.branch] || {}).label || "")}${esc(tag)}</span></button>`;
      }).join("") || `<button type="button" disabled>Nic nenalezeno</button>`;
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
      const src = (q.sources || []).map((s) => sourceItem(s, { noThumbs: true })).join("");
      return `<article class="q-item">
        <h3>${esc(q.title || q.id || "Dotaz")}</h3>
        ${q.summary ? `<p class="q-sum">${esc(q.summary)}</p>` : ""}
        ${q.details ? `<p class="q-det">${esc(q.details)}</p>` : ""}
        ${rel ? `<p class="q-rel">V mapě: ${rel}</p>` : ""}
        ${src ? `<ul class="sources q-src">${src}</ul>` : ""}
      </article>`;
    }).join("");
    const branches = data.unattached_branches || [];
    if (branches.length) {
      const n = branches.reduce((s, b) => s + (b.people || []).length, 0);
      host.innerHTML += `<section class="ub-sec">
        <h2>Nepřipojené větve</h2>
        <p class="questions-lead">Jisté osoby a svazky, které po odstranění nedoložených vazeb nejsou v grafu spojeny se Štěpánem. Data zůstávají v JSON a půjdou připojit, až bude vazba doložena.</p>` +
        branches.map((b) => {
          const people = (b.people || []).map((person) =>
            `<li><button type="button" class="linkish" data-jump="${esc(person.id)}">${esc(person.name)}</button></li>`
          ).join("");
          return `<article class="q-item ub-item">
            <h3>${esc(b.title || b.id)}</h3>
            ${b.reason ? `<p class="q-sum">${esc(b.reason)}</p>` : ""}
            ${b.reattach ? `<p class="q-det">${esc(b.reattach)}</p>` : ""}
            <p class="q-rel">${(b.people || []).length} osob · ${(b.unions || []).length} svazků</p>
            <ul class="ub-people">${people}</ul>
          </article>`;
        }).join("") + `</section>`;
    }
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
    try {
      const zr = await fetch(ZDROJE_URL);
      state.zdroje = zr.ok ? await zr.json() : null;
    } catch (_) { state.zdroje = null; }
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
    document.addEventListener("click", (e) => {
      const t = e.target.closest(".thumb");
      if (t) { e.preventDefault(); openLightbox(t.dataset.big, t.dataset.url, t.dataset.cap, t.dataset.crop); }
    });
    $("#lightbox").addEventListener("click", (e) => {
      if (e.target.closest("a")) return;
      if (e.target.id === "lightbox" || e.target.closest(".lb-close")) closeLightbox();
    });
    $("#pathbar")?.addEventListener("click", (e) => {
      const jump = e.target.closest("[data-jump]");
      if (jump) openPerson(jump.getAttribute("data-jump"));
    });
    $("#panel").addEventListener("click", (e) => {
      const jump = e.target.closest("[data-jump]");
      if (jump) openPerson(jump.getAttribute("data-jump"));
    });
    $("#viewport").addEventListener("click", (e) => {
      if (e.target === e.currentTarget) closePanel();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if ($("#lightbox").classList.contains("open")) { closeLightbox(); return; }
        closePanel(); setQuestionsOpen(false);
      }
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault(); $("#q").focus();
      }
    });
    const qn = (data.open_questions || []).length;
    const ubn = (data.unattached_branches || []).reduce((s, b) => s + (b.people || []).length, 0);
    const counts = `${data.people.length} osob v hlavním grafu` +
      (ubn ? ` · ${ubn} v nepřipojených větvích` : "") +
      ` · ${L.generations} generací · ${Object.keys(data.branches).length} větví` +
      (qn ? ` · ${qn} otevřených dotazů` : "");
    $("#meta-line").textContent = counts + " · aktualizace " + (data.meta.updated || "");
    fitAll();
    // úvodní pohled: Štěpán a rodiče, nebo osoba z odkazu #id
    const hashId = decodeURIComponent((location.hash || "").replace(/^#/, "")).trim();
    setTimeout(() => {
      if (hashId && findPerson(data, hashId)) openPerson(hashId);
      else initialView(data, L);
    }, 50);
    window.addEventListener("hashchange", () => {
      const id = decodeURIComponent((location.hash || "").replace(/^#/, "")).trim();
      if (id && findPerson(state.data, id)) openPerson(id);
      else if (!id) closePanel();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", main);
  else main();
})();
