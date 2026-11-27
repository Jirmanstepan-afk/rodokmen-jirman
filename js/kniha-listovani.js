/* Kniha – listovací verze. Obsah se bere z data/kniha (přes js/kniha.js → window.Kniha.load),
   automaticky se rozdělí na stránky podle výšky a zobrazí jako otevřená kniha (StPageFlip). */
(function () {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const VOID = /^<(br|img|hr|wbr|input)\b/i;

  let BOOK = null;          // výsledek Kniha.load()
  let flip = null;          // instance StPageFlip
  let pages = [];           // DOM stránky
  let geom = null;          // rozměry
  let idToPage = new Map(); // id prvku → index stránky
  let chapterStart = new Map();

  /* ---------- rozměry ---------- */
  function computeGeom() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const top = 46, bot = 50;
    const portrait = vw < 760 || vw / vh < 1.05;
    const availH = vh - top - bot - (portrait ? 18 : 34);
    let pw, ph;
    if (portrait) {
      pw = Math.min(vw - 22, 620);
      ph = Math.min(availH, Math.round(pw * 2));
    } else {
      const availW = vw - 150;
      ph = availH;
      pw = Math.min(availW / 2, ph * 0.76);
      if (pw < ph * 0.6) ph = pw / 0.6;
    }
    pw = Math.floor(pw); ph = Math.floor(ph);
    const fs = Math.max(13.5, Math.min(19.5, Math.min(ph / 44, pw / 27)));
    return { pw, ph, fs, portrait };
  }

  /* ---------- kostra stránky ---------- */
  function makePage(cls, opts = {}) {
    const el = document.createElement("div");
    el.className = "fb-page " + cls;
    if (opts.hard) el.dataset.density = "hard";
    el.innerHTML = opts.inner != null ? opts.inner
      : '<div class="fb-inner"><div class="fb-head"></div><div class="fb-content"></div><div class="fb-foot"></div></div>';
    el.style.width = geom.pw + "px"; el.style.height = geom.ph + "px";
    return el;
  }

  /* ---------- rozklad kapitoly na bloky ---------- */
  function chapterBlocks(chHtml) {
    const tpl = document.createElement("template");
    tpl.innerHTML = chHtml;
    const sec = tpl.content.querySelector("section");
    const B = [];
    const head = sec.querySelector(".kn-ch-head");
    const facts = head.querySelector(".kn-facts");
    if (facts) facts.remove();
    const open = document.createElement("div");
    open.className = "fb-ch-open"; open.id = sec.id;
    open.innerHTML = head.innerHTML;
    B.push({ t: "atom", el: open, keep: true });
    if (facts) B.push({ t: "atom", el: facts });
    const mb = sec.querySelector(".kn-mapbox");
    if (mb) B.push({ t: "atom", el: mb });
    const text = sec.querySelector(".kn-text");
    let first = true;
    for (const n of [...text.children]) {
      const tag = n.tagName;
      if (tag === "P") { if (first) { n.classList.add("kn-first"); first = false; } B.push({ t: "p", el: n }); }
      else if (tag === "UL" || tag === "OL") { const w = document.createElement("div"); w.className = "fb-listwrap"; w.appendChild(n); B.push({ t: "list", el: w }); }
      else if (tag === "ASIDE") B.push({ t: "aside", el: n });
      else if (/^H[1-6]$/.test(tag)) B.push({ t: "atom", el: n, keep: true });
      else B.push({ t: "atom", el: n });
    }
    for (const cls of ["kn-open", "kn-notes"]) {
      const box = sec.querySelector("." + cls);
      if (!box) continue;
      const h = box.querySelector("h3");
      const hw = document.createElement("div"); hw.className = cls; hw.appendChild(h.cloneNode(true));
      B.push({ t: "atom", el: hw, keep: true });
      const list = box.querySelector("ul,ol");
      const lw = document.createElement("div"); lw.className = cls; lw.appendChild(list.cloneNode(true));
      B.push({ t: "list", el: lw });
    }
    return B;
  }

  /* ---------- dělení odstavce ---------- */
  function tokenize(html) { return html.split(/(<[^>]+>|\s+)/).filter((x) => x !== ""); }
  function splitTokens(tokens, k) {
    // k = počet mezer (míst zlomu), za kterými se láme
    const stack = []; let seen = 0, i = 0;
    for (; i < tokens.length; i++) {
      const t = tokens[i];
      if (t[0] === "<") {
        if (t[1] === "/") stack.pop();
        else if (!VOID.test(t) && !t.endsWith("/>")) stack.push(t);
      } else if (/^\s+$/.test(t)) {
        if (seen === k) break;
        seen++;
      }
    }
    const close = stack.slice().reverse().map((o) => "</" + o.match(/^<([a-z0-9]+)/i)[1] + ">").join("");
    const head = tokens.slice(0, i).join("") + close;
    const tail = stack.join("") + tokens.slice(i + 1).join("");
    return [head, tail];
  }
  function breaks(tokens) { return tokens.filter((t) => /^\s+$/.test(t)).length; }

  /* ---------- stránkování ---------- */
  function paginate(meas, blocksByChapter) {
    const out = [];
    let page = null, content = null, deferred = [];
    const fits = () => content.scrollHeight <= content.clientHeight + 1;
    const used = () => { const l = content.lastElementChild; return l ? l.offsetTop + l.offsetHeight : 0; };
    const newPage = (info) => {
      page = makePage("fb-paper");
      Object.assign(page.dataset, info);
      meas.appendChild(page);
      content = page.querySelector(".fb-content");
      out.push(page);
      // obrázky, které se nevešly na předchozí stranu, jdou nahoru na novou
      while (deferred.length) content.appendChild(deferred.shift().el.cloneNode(true));
    };
    const tryAppend = (node, keep) => {
      content.appendChild(node);
      let ok = fits();
      if (ok && keep) {
        const sp = document.createElement("div"); sp.style.height = "4.4em";
        content.appendChild(sp); ok = fits(); sp.remove();
      }
      if (!ok) node.remove();
      return ok;
    };
    for (const { info, blocks } of blocksByChapter) {
      newPage(info);
      const queue = blocks.slice();
      while (queue.length) {
        const b = queue.shift();
        const node = b.el.cloneNode(true);
        if (tryAppend(node, b.keep)) continue;
        const empty = content.children.length === 0;
        // obrázek se nevejde: text pokračuje, obrázek se přesune na začátek další strany
        if (b.t === "atom" && b.el.classList.contains("kn-fig") && !empty && deferred.length === 0
            && content.clientHeight - used() > content.clientHeight * 0.18 && queue.length) {
          deferred.push(b); continue;
        }
        // pokus o rozdělení
        if (b.t === "p" || b.t === "aside") {
          const target = b.t === "p" ? null : "p";
          const res = splitBlock(b, target);
          if (res) { queue.unshift(res.rest); newPage(info); continue; }
        } else if (b.t === "list") {
          const res = splitList(b);
          if (res) { if (res.rest) { queue.unshift(res.rest); newPage(info); } continue; }
        }
        if (empty) { content.appendChild(node); newPage(info); continue; } // přerostlý blok
        newPage(info);
        queue.unshift(b);
      }
      if (deferred.length) newPage(info);
      // prázdná poslední stránka kapitoly
      if (content.children.length === 0) { out.pop(); page.remove(); }
    }
    return out;

    function splitBlock(b, inner) {
      const srcP = inner ? b.el.querySelector(inner) : b.el;
      if (!srcP) return null;
      const tokens = tokenize(srcP.innerHTML);
      const n = breaks(tokens);
      const build = (k) => {
        const [h, t] = splitTokens(tokens, k);
        const a = b.el.cloneNode(true), r = b.el.cloneNode(true);
        const ap = inner ? a.querySelector(inner) : a, rp = inner ? r.querySelector(inner) : r;
        ap.innerHTML = h; rp.innerHTML = t;
        ap.classList.add("fb-split"); rp.classList.add("fb-cont"); rp.classList.remove("kn-first");
        if (inner) { r.classList.add("fb-cont"); const tag = r.querySelector(".kn-guess-tag"); if (tag) tag.remove(); }
        return [a, r];
      };
      let lo = 0, hi = n - 1, best = -1, bestNode = null;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const [a] = build(mid);
        content.appendChild(a);
        const ok = fits(); a.remove();
        if (ok) { best = mid; lo = mid + 1; } else hi = mid - 1;
      }
      if (best < 3 || n - best < 3) return null;   // aspoň pár slov na každé straně
      const [a, r] = build(best);
      content.appendChild(a);
      return { rest: { t: b.t, el: r } };
    }
    function splitList(b) {
      const list = b.el.querySelector("ul,ol") || b.el;
      const items = [...list.children];
      if (items.length < 2) return null;
      const startAttr = parseInt(list.getAttribute("start") || "1", 10);
      const w = b.el.cloneNode(true); const wl = w.querySelector("ul,ol") || w;
      wl.innerHTML = "";
      content.appendChild(w);
      let k = 0;
      for (const it of items) {
        wl.appendChild(it.cloneNode(true));
        if (!fits()) { wl.lastChild.remove(); break; }
        k++;
      }
      if (k === 0) { w.remove(); return null; }
      if (k === items.length) return { rest: null };
      const r = b.el.cloneNode(true); const rl = r.querySelector("ul,ol") || r;
      rl.innerHTML = ""; items.slice(k).forEach((it) => rl.appendChild(it.cloneNode(true)));
      if (rl.tagName === "OL") rl.setAttribute("start", String(startAttr + k));
      return { rest: { t: "list", el: r } };
    }
  }

  /* ---------- stavba celé knihy ---------- */
  function build() {
    geom = computeGeom();
    const root = document.documentElement;
    root.style.setProperty("--fs", geom.fs.toFixed(2) + "px");
    root.style.setProperty("--pw", geom.pw + "px");
    const meas = document.createElement("div");
    meas.className = "fb-measure fb-root";
    document.body.appendChild(meas);
    // výška obrázků a map podle výšky obsahu stránky
    const probe = makePage("fb-paper"); meas.appendChild(probe);
    const ch = probe.querySelector(".fb-content").clientHeight;
    probe.remove();
    root.style.setProperty("--fig-h", Math.round(ch * (geom.portrait ? 0.3 : 0.34)) + "px");
    root.style.setProperty("--fig-full-h", Math.round(ch * 0.78) + "px");
    root.style.setProperty("--fig-ann-h", Math.round(ch * (geom.portrait ? 0.36 : 0.44)) + "px");
    root.style.setProperty("--map-h", Math.round(ch * (geom.portrait ? 0.36 : 0.42)) + "px");

    const K = BOOK.kniha;
    // obsah: kapitoly
    const groups = [], partPages = [];
    for (const P of BOOK.parts) {
      if (P.part.label) groups.push({ part: P });
      for (const c of P.chapters) {
        groups.push({ info: { ch: c.ch.id, title: c.ch.title, no: c.no }, blocks: chapterBlocks(c.html) });
      }
    }
    // stránkování kapitol (díly mají vlastní stránku)
    const content = [];
    for (const g of groups) {
      if (g.part) {
        const pg = makePage("fb-paper fb-partpage");
        pg.dataset.title = g.part.part.title; pg.dataset.part = g.part.part.id; pg.dataset.nonum = "1";
        pg.querySelector(".fb-content").innerHTML = g.part.html;
        meas.appendChild(pg);
        content.push(pg);
      } else {
        content.push(...paginate(meas, [g]));
      }
    }
    // obsah (TOC)
    const tocRows = [];
    for (const P of BOOK.parts) {
      tocRows.push(`<div class="toc-part">${esc(P.part.label ? P.part.label + " · " : "")}${esc(P.part.title)}</div>`);
      for (const c of P.chapters) {
        tocRows.push(`<a class="toc-row" href="#k-${esc(c.ch.id)}" data-goto="k-${esc(c.ch.id)}"><span class="toc-no">${c.no ? c.no + "." : ""}</span><span class="toc-t">${esc(c.ch.title)}</span><span class="toc-dots"></span><span class="toc-pg" data-pg="k-${esc(c.ch.id)}">000</span></a>`);
      }
    }
    const tocPages = [];
    {
      let pg = null, cont = null;
      const np = (first) => { pg = makePage("fb-paper fb-toc"); pg.dataset.title = "Obsah"; meas.appendChild(pg); cont = pg.querySelector(".fb-content");
        if (first) { cont.innerHTML = '<h2 id="obsah">Obsah</h2>'; } tocPages.push(pg); };
      np(true);
      for (const r of tocRows) {
        const t = document.createElement("template"); t.innerHTML = r; const n = t.content.firstChild;
        cont.appendChild(n);
        if (cont.scrollHeight > cont.clientHeight + 1) { n.remove(); np(false); cont.appendChild(n); }
      }
    }
    // přední část
    const cover = makePage("fb-cover fb-front", { hard: true, inner: `<div class="fb-inner"><div class="fb-cover-frame">
      <div class="c-sm">Rodinná kronika</div><h1>${esc(K.title)}</h1><div class="c-rule"></div>
      <div class="c-names">Jirmanové · Klimešové · Syroví · Proßovi · Rosenbergerové · Ringelové</div>
      <div class="c-auth">${esc(K.author || "Štěpán Jirman")}</div>
      <div class="c-open">${geom.portrait ? "přejeďte prstem a otevřete" : "klikněte na roh nebo použijte šipky"}</div></div></div>` });
    const endA = makePage("fb-endpaper", { inner: "" });
    const title = makePage("fb-paper fb-titlepage");
    title.dataset.nonum = "1"; title.dataset.nohead = "1";
    title.querySelector(".fb-content").innerHTML = `<div class="t-sm">Rodinná kronika</div><h1>${esc(K.title)}</h1>
      <p class="t-sub">${esc(K.subtitle || "")}</p><div class="t-orn">❧ ✦ ☙</div>
      <div class="t-auth">${esc(K.author || "Štěpán Jirman")}</div><div class="t-year">${esc(K.updated || "")}</div>`;
    const colo = makePage("fb-paper fb-colophon");
    colo.dataset.nohead = "1";
    colo.querySelector(".fb-content").innerHTML = `
      <p>Stav k ${esc(K.updated)} · ${BOOK.no} kapitol · asi ${Math.round(BOOK.words / 100) * 100} slov · ${BOOK.peopleCount} osob v datech.</p>
      <p>Vše, co je v knize uvedeno jako fakt, vychází ze zápisů v matrikách. Odkazy v poznámkách vedou na snímky v archivu ARON. Domněnky jsou odlišené a označené slovem <em>Domněnka</em>.</p>
      <p>Jména osob jsou odkazy do <a href="./index.html">rodokmenu</a>, mapky ukazují místa na II. vojenském mapování (1836–1852).</p>
      <p>Kniha se doplňuje po každém kole hledání. Celý text je také v <a href="./kniha-text.html">klasické textové verzi</a>.</p>
      <p>Soukromá rodinná stránka.</p>`;
    let all = [cover, endA, title, colo, ...tocPages, ...content];
    if (all.length % 2 === 1) { const bl = makePage("fb-paper fb-blank"); bl.dataset.nonum = "1"; all.push(bl); }
    const endB = makePage("fb-endpaper", { inner: "" });
    const back = makePage("fb-cover fb-back", { hard: true, inner: `<div class="fb-inner"><div class="fb-cover-frame"><div class="c-emb">❦</div>
      <div class="c-names" style="margin-top:1em">${esc(K.title)}</div></div></div>` });
    all.push(endB, back);
    // čísla stran, živá záhlaví, strany
    idToPage = new Map(); chapterStart = new Map();
    all.forEach((pg, i) => {
      const left = !geom.portrait && i % 2 === 1;
      pg.classList.add(geom.portrait ? "is-single" : (left ? "is-left" : "is-right"));
      pg.dataset.idx = i;
      const foot = pg.querySelector(".fb-foot"), head = pg.querySelector(".fb-head");
      if (foot && !pg.dataset.nonum && pg.classList.contains("fb-paper") && i >= 2) foot.textContent = String(i - 1);
      if (head && !pg.dataset.nohead && !pg.classList.contains("fb-partpage")) {
        head.textContent = (left && pg.dataset.ch) ? K.title : (pg.dataset.title || K.title);
      }
      pg.querySelectorAll("[id]").forEach((e) => { if (!idToPage.has(e.id)) idToPage.set(e.id, i); });
      if (pg.dataset.ch && !chapterStart.has(pg.dataset.ch)) chapterStart.set(pg.dataset.ch, i);
    });
    tocPages.forEach((pg) => pg.querySelectorAll("[data-pg]").forEach((s) => {
      const i = idToPage.get(s.dataset.pg); s.textContent = i != null ? String(i - 1) : "";
    }));
    meas.remove();
    pages = all;
    return all;
  }

  /* ---------- zobrazení ---------- */
  function mount(startIdx) {
    const stage = $("#fb-stage");
    const shift = $("#fb-shift");
    shift.querySelector(".fb-root")?.remove();
    if (flip) { try { flip.destroy(); } catch (e) { /* nic */ } flip = null; }
    const root = document.createElement("div");
    root.className = "fb-root";
    shift.appendChild(root);
    pages.forEach((p) => root.appendChild(p));
    stage.classList.toggle("is-portrait", geom.portrait);
    root.style.width = (geom.portrait ? geom.pw : geom.pw * 2) + "px";
    root.style.height = geom.ph + "px";
    flip = new St.PageFlip(root, {
      width: geom.pw, height: geom.ph, size: "fixed", autoSize: false,
      showCover: true, usePortrait: geom.portrait, drawShadow: true, maxShadowOpacity: 0.55,
      flippingTime: 900, mobileScrollSupport: false, clickEventForward: true, useMouseEvents: true,
      swipeDistance: 30, showPageCorners: true, startPage: 0
    });
    flip.loadFromHTML(pages);
    flip.on("flip", onFlip);
    flip.on("changeState", (e) => {
      if (e.data === "flipping" || e.data === "user_fold") $("#fb-stage").classList.remove("is-closed-front", "is-closed-back");
      if (e.data === "read") updateUi();
    });
    // mapy a odkazy nesmějí spouštět otáčení
    root.querySelectorAll(".kn-mapbox").forEach((mb) => {
      ["mousedown", "touchstart", "pointerdown"].forEach((ev) => mb.addEventListener(ev, (e) => e.stopPropagation(), { passive: true }));
    });
    root.addEventListener("click", onLinkClick, true);
    // klik na odkaz nemá zároveň otočit list
    ["mousedown", "touchstart"].forEach((ev) => root.addEventListener(ev, (e) => {
      if (e.target.closest("a, button")) e.stopPropagation();
    }, { capture: true, passive: true }));
    if (startIdx) flip.turnToPage(Math.min(startIdx, pages.length - 1));
    updateUi();
    setTimeout(initVisibleMaps, 50);
  }

  function curIdx() { return flip ? flip.getCurrentPageIndex() : 0; }
  function onFlip() { updateUi(); setTimeout(initVisibleMaps, 30); }
  function visibleIdx() {
    const i = curIdx();
    if (geom.portrait) return [i];
    if (i === 0) return [0];
    const l = i % 2 === 1 ? i : i - 1;
    return [l, l + 1].filter((x) => x < pages.length);
  }
  function updateUi() {
    const i = curIdx(), n = pages.length;
    const st = $("#fb-stage");
    st.classList.toggle("is-closed-front", !geom.portrait && i === 0);
    st.classList.toggle("is-closed-back", !geom.portrait && i >= n - 1);
    const vis = visibleIdx();
    const nums = vis.map((x) => pages[x]).filter((p) => p.classList.contains("fb-paper")).map((p) => Number(p.dataset.idx) - 1).filter((x) => x >= 1);
    $("#fb-count").textContent = i === 0 ? "Desky" : i >= n - 1 ? "Zadní desky" : nums.length ? `strana ${nums.join("–")} z ${n - 4}` : "Předsádka";
    $(".fb-prev").disabled = i === 0;
    $(".fb-next").disabled = i >= n - 1;
    const p2 = $("#fb-prev2"), n2 = $("#fb-next2");
    if (p2) p2.disabled = i === 0;
    if (n2) n2.disabled = i >= n - 1;
    updateStack(i, n);
    history.replaceState(null, "", i ? `#s=${Math.max(1, i - 1)}` : location.pathname + location.search);
  }
  /* tloušťka bloku stránek: vpravo zbývající listy, vlevo přečtené */
  function updateStack(i, n) {
    const shift = $("#fb-shift"); if (!shift || !geom) return;
    const max = geom.portrait ? 8 : Math.max(10, Math.min(22, Math.round(n / 8)));
    const prog = n > 1 ? Math.min(1, Math.max(0, i / (n - 1))) : 0;
    const l = Math.round(max * prog * 10) / 10, r = Math.round(max * (1 - prog) * 10) / 10;
    shift.style.setProperty("--stk-l", l + "px");
    shift.style.setProperty("--stk-r", r + "px");
    shift.dataset.progress = Math.round(prog * 100);
  }
  function initVisibleMaps() {
    for (const x of visibleIdx()) {
      const pg = pages[x]; if (!pg) continue;
      pg.querySelectorAll(".kn-map[data-ids]").forEach((el) => {
        if (el.offsetWidth === 0) return;
        if (!el.dataset.ready) window.Kniha.initMap(el);
        else if (el._map) el._map.invalidateSize();
      });
    }
  }
  function goTo(idx) {
    if (!flip || idx == null) return;
    idx = Math.max(0, Math.min(idx, pages.length - 1));
    const vis = visibleIdx();
    if (vis.includes(idx)) return;
    if (Math.abs(idx - curIdx()) <= 2) flip.flip(idx); else { flip.turnToPage(idx); onFlip(); }
  }
  function goToId(id) {
    const i = idToPage.get(id);
    if (i == null) return false;
    goTo(i);
    const el = pages[i].querySelector("#" + CSS.escape(id));
    if (el) { el.classList.add("fb-target"); setTimeout(() => el.classList.remove("fb-target"), 2500); }
    return true;
  }
  function onLinkClick(e) {
    const a = e.target.closest("a"); if (!a) return;
    const href = a.getAttribute("href") || "";
    if (href.startsWith("#")) {
      e.preventDefault(); e.stopPropagation();
      goToId(a.dataset.goto || href.slice(1));
    }
  }

  /* ---------- start ---------- */
  function startIndexFromHash() {
    const h = decodeURIComponent(location.hash.slice(1));
    let m;
    if ((m = h.match(/^s=(\d+)$/))) return Number(m[1]) + 1;
    if (h && idToPage.has(h)) return idToPage.get(h);
    return 0;
  }
  let lastKey = "";
  function rebuild(keepIdx) {
    const anchorPage = pages[curIdx()];
    const anchorId = anchorPage && (anchorPage.querySelector(".fb-content [id]") || {}).id;
    build();
    let idx = keepIdx;
    if (anchorId && idToPage.has(anchorId)) idx = idToPage.get(anchorId);
    mount(idx || 0);
  }
  async function main() {
    try {
      await Promise.all([document.fonts.load('17px "EB Garamond"'), document.fonts.load('italic 17px "EB Garamond"'), document.fonts.load('700 17px "Cormorant SC"')]);
    } catch (e) { /* písma nejsou nutná */ }
    BOOK = await window.Kniha.load();
    build();
    lastKey = `${geom.pw}x${geom.ph}${geom.portrait}`;
    mount(startIndexFromHash());
    $("#fb-loading").remove();
    $(".fb-prev").addEventListener("click", () => flip.flipPrev());
    $(".fb-next").addEventListener("click", () => flip.flipNext());
    $("#fb-prev2").addEventListener("click", () => flip.flipPrev());
    $("#fb-next2").addEventListener("click", () => flip.flipNext());
    $("#fb-toc").addEventListener("click", () => goToId("obsah"));
    $("#fb-first").addEventListener("click", () => { flip.turnToPage(0); onFlip(); });
    const fsb = $("#fb-fs");
    fsb.addEventListener("click", () => {
      if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.();
    });
    document.addEventListener("keydown", (e) => {
      if (e.target.closest("input,textarea")) return;
      if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); flip.flipNext(); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); flip.flipPrev(); }
      else if (e.key === "Home") { flip.turnToPage(0); onFlip(); }
      else if (e.key === "End") { flip.turnToPage(pages.length - 1); onFlip(); }
    });
    let t = null;
    window.addEventListener("resize", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const g = computeGeom();
        const key = `${g.pw}x${g.ph}${g.portrait}`;
        if (key === lastKey) return;
        if (!g.portrait && geom && !geom.portrait && Math.abs(g.ph - geom.ph) < 24 && Math.abs(g.pw - geom.pw) < 24) return;
        lastKey = key;
        rebuild(curIdx());
      }, 350);
    });
    window.addEventListener("hashchange", () => {
      const h = decodeURIComponent(location.hash.slice(1));
      if (h && !h.startsWith("s=")) goToId(h);
    });
    const hint = $("#fb-hint");
    if (hint) setTimeout(() => { hint.style.opacity = 0; }, 6000);
    window.__fb = { get flip() { return flip; }, get pages() { return pages; }, goToId, goTo };
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", main); else main();
})();
