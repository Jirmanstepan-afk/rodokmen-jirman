/* Rozložení rodokmenu po generacích.
 * - Manželé stojí vedle sebe, mezi nimi uzel páru (kroužek).
 * - Z uzlu páru vede jedna čára dolů na sběrnici a z ní ke každému dítěti (ortogonálně, zaoblené rohy).
 * - Předci každého z partnerů jsou nad ním; sourozenci předků (s jejich rodinami) po straně.
 * - Bloky se skládají podle obrysů řádků (jako „tidy tree“), takže se karty ani čáry nepřekrývají.
 */
(function (global) {
  const CARD_W = 214;
  const CARD_H = 92;
  const COUPLE_GAP = 46;   // mezera mezi manželi (místo pro uzel páru)
  const SIB_GAP = 26;      // mezi sourozenci
  const FAMILY_GAP = 54;   // mezi různými rodinami
  const ROW_GAP = 118;     // svislá mezera mezi generacemi (prostor pro sběrnice)
  const MARGIN_X = 150;    // vlevo místo na popisky generací
  const MARGIN_Y = 70;
  const RADIUS = 12;

  /* ---------- vztahy ---------- */
  function rels(data) {
    const byId = Object.fromEntries((data.people || []).map((p) => [p.id, p]));
    const parentUnion = {}, unionsOf = {};
    const unions = (data.unions || []).map((u) => ({
      ...u,
      partners: (u.partners || []).filter((id) => byId[id]),
      children: (u.children || []).filter((id) => byId[id]),
    }));
    for (const u of unions) {
      for (const c of u.children) if (!parentUnion[c]) parentUnion[c] = u;
      for (const p of u.partners) (unionsOf[p] ||= []).push(u);
    }
    return { byId, unions, parentUnion, unionsOf };
  }

  function birthKey(byId, id) {
    const p = byId[id] || {};
    const ev = p.birth || p.baptism || {};
    if (ev.date) return ev.date;
    const m = String(ev.display || "").match(/(1[6-9]\d{2}|20\d{2})/);
    return m ? m[1] : "9999";
  }

  /* ---------- bloky ---------- */
  // blok = { n: { id: {x, row} } }  (x = levý okraj karty)
  const single = (id, row) => ({ n: { [id]: { x: 0, row } } });
  function shift(b, dx) {
    if (!dx) return b;
    for (const k in b.n) b.n[k].x += dx;
    return b;
  }
  function merge(a, b) {
    for (const k in b.n) if (!a.n[k]) a.n[k] = b.n[k];
    return a;
  }
  function contour(b) {
    const c = {};
    for (const k in b.n) {
      const { x, row } = b.n[k];
      const r = c[row] || (c[row] = [Infinity, -Infinity]);
      if (x < r[0]) r[0] = x;
      if (x > r[1]) r[1] = x;
    }
    return c;
  }
  // posun, aby b leželo celé vpravo od a (po řádcích)
  function packRight(a, b, gapFn) {
    const ca = contour(a), cb = contour(b);
    let dx = -Infinity;
    for (const row in cb) {
      if (!ca[row]) continue;
      dx = Math.max(dx, ca[row][1] + CARD_W + gapFn(+row) - cb[row][0]);
    }
    if (dx === -Infinity) {
      // žádný společný řádek: postavit vedle sebe podle celkového rozsahu
      const ax = Math.max(...Object.values(a.n).map((v) => v.x));
      const bx = Math.min(...Object.values(b.n).map((v) => v.x));
      dx = ax + CARD_W + FAMILY_GAP - bx;
    }
    shift(b, dx);
    return merge(a, b);
  }
  // přesné překrytí karet ve stejných řádcích
  function collides(a, b, gap) {
    const rowsA = {};
    for (const k in a.n) (rowsA[a.n[k].row] ||= []).push(a.n[k].x);
    for (const k in b.n) {
      const xs = rowsA[b.n[k].row];
      if (!xs) continue;
      const x = b.n[k].x;
      for (const ax of xs) if (Math.abs(ax - x) < CARD_W + gap) return true;
    }
    return false;
  }
  function placeNear(base, b, dx0, gap) {
    shift(b, dx0);
    if (!collides(base, b, gap)) return merge(base, b);
    for (let k = 1; k < 800; k++) {
      for (const s of [k * 8, -k * 8]) {
        shift(b, s);
        if (!collides(base, b, gap)) return merge(base, b);
        shift(b, -s);
      }
    }
    return merge(base, b);
  }
  const rowSpan = (b, row) => {
    const xs = Object.values(b.n).filter((v) => v.row === row).map((v) => v.x);
    return xs.length ? [Math.min(...xs), Math.max(...xs) + CARD_W] : null;
  };

  /* ---------- skladba ---------- */
  function layout(data) {
    const R = rels(data);
    const { byId, parentUnion, unionsOf } = R;
    const handled = new Set();   // svazky již zpracované
    const placed = new Set();    // osoby již umístěné

    // osoba + její další svazky (manželé na straně `side`) + jejich děti dolů
    function downBlock(id, row, skipUnion, side) {
      placed.add(id);
      let b = single(id, row);
      const extra = (unionsOf[id] || []).filter((u) => u !== skipUnion && !handled.has(u));
      let flip = side;
      for (const u of extra) {
        handled.add(u);
        const spouses = u.partners.filter((p) => p !== id && !placed.has(p));
        let sb = null;
        for (const s of spouses) {
          const unit = (() => { placed.add(s); return downBlock(s, row, u, flip); })();
          const up = parentUnion[s] && !handled.has(parentUnion[s])
            ? famBlock(parentUnion[s], s, unit, flip === "right" ? "left" : "right", row)
            : unit;
          sb = sb ? (flip === "right" ? packRight(sb, up, gapRow(row)) : packRight(up, sb, gapRow(row))) : up;
        }
        if (sb) b = flip === "right" ? packRight(b, sb, gapRow(row, true)) : packRight(sb, b, gapRow(row, true));
        // děti tohoto svazku pod uzel páru
        const kids = u.children.filter((c) => !placed.has(c))
          .sort((a, c) => birthKey(byId, a).localeCompare(birthKey(byId, c)));
        if (kids.length) {
          let kb = null;
          for (const c of kids) {
            const cb = downBlock(c, row - 1, null, "right");
            kb = kb ? packRight(kb, cb, () => SIB_GAP) : cb;
          }
          const mx = markerX(b, u, id);
          const span = rowSpan(kb, row - 1);
          b = placeNear(b, kb, mx - (span[0] + span[1]) / 2, SIB_GAP);
        }
        flip = flip === "right" ? "left" : "right";
      }
      return b;
    }

    function markerX(b, u, fallbackId) {
      const xs = u.partners.filter((p) => b.n[p]).map((p) => b.n[p].x).sort((a, c) => a - c);
      if (xs.length >= 2) return (xs[0] + CARD_W + xs[xs.length - 1]) / 2;
      const id = xs.length ? u.partners.find((p) => b.n[p]) : fallbackId;
      return b.n[id].x + CARD_W / 2;
    }

    function gapRow(coupleRow, isCouple) {
      return (r) => (isCouple && r === coupleRow ? COUPLE_GAP : FAMILY_GAP);
    }

    // svazek U (rodiče) nad dítětem `anchor`; anchorBlk = blok dítěte; end = na kterou stranu sourozenců dát kotvu
    function famBlock(U, anchor, anchorBlk, end, childRow) {
      handled.add(U);
      const row = childRow + 1;
      const ps = U.partners.filter((p) => !placed.has(p));
      const ups = ps.map((p, i) => {
        const side = ps.length === 2 ? (i === 0 ? "left" : "right") : "left";
        const unit = downBlock(p, row, U, side);
        const pu = parentUnion[p];
        return pu && !handled.has(pu) ? famBlock(pu, p, unit, side === "left" ? "right" : "left", row) : unit;
      });
      let couple = ups[0] || null;
      if (ups.length === 2) couple = packRight(ups[0], ups[1], gapRow(row, true));
      // děti
      const others = U.children.filter((c) => c !== anchor && !placed.has(c))
        .sort((a, c) => birthKey(byId, a).localeCompare(birthKey(byId, c)));
      const seq = end === "right" ? [...others, anchor] : [anchor, ...others];
      let kb = null;
      for (const c of seq) {
        const cb = c === anchor ? anchorBlk : downBlock(c, childRow, null, "right");
        kb = kb ? packRight(kb, cb, () => SIB_GAP) : cb;
      }
      if (!couple) return kb;
      const mx = markerX(couple, U, ps[0]);
      const span = rowSpan(kb, childRow);
      // couple má přednost: děti posunout pod uzel páru
      return placeNear(couple, kb, mx - (span[0] + span[1]) / 2, SIB_GAP);
    }

    const focus = data.meta && data.meta.focus;
    let root = { n: {} };
    if (focus && byId[focus]) {
      const unit = downBlock(focus, 0, null, "right");
      root = parentUnion[focus] ? famBlock(parentUnion[focus], focus, unit, "right", 0) : unit;
    }
    // zbylé osoby (nemělo by nastat): do řádku pod mapou
    const rest = (data.people || []).filter((p) => !root.n[p.id]);
    if (rest.length) {
      const rows = Object.values(root.n).map((v) => v.row);
      const r = rows.length ? Math.min(...rows) - 1 : 0;
      let x = 0;
      for (const p of rest) { root.n[p.id] = { x, row: r, orphan: true }; x += CARD_W + SIB_GAP; }
      if (global.console) console.warn("Nezařazené osoby:", rest.map((p) => p.id));
    }

    /* ---------- souřadnice ---------- */
    const all = Object.values(root.n);
    const minX = Math.min(...all.map((v) => v.x));
    const rowsArr = all.map((v) => v.row);
    const maxRow = Math.max(...rowsArr), minRow = Math.min(...rowsArr);
    const yOf = (row) => MARGIN_Y + (maxRow - row) * (CARD_H + ROW_GAP);
    const pos = {};
    for (const [id, v] of Object.entries(root.n)) {
      pos[id] = { x: v.x - minX + MARGIN_X, y: yOf(v.row), w: CARD_W, h: CARD_H, row: v.row, orphan: !!v.orphan };
    }
    const width = Math.max(...Object.values(pos).map((p) => p.x + CARD_W)) + 60;
    const height = yOf(minRow) + CARD_H + MARGIN_Y;

    /* ---------- čáry ---------- */
    const links = [], markers = [];
    const ancestors = ancestorSet(R, focus);
    // sběrnice: přiřadit hladiny, aby se vodorovné úseky v jedné mezeře nepřekrývaly
    const buses = [];
    for (const u of R.unions) {
      const ps = u.partners.filter((p) => pos[p]).sort((a, b) => pos[a].x - pos[b].x);
      const kids = u.children.filter((c) => pos[c]);
      if (!ps.length) continue;
      const cert = u.certainty || "potvrzeno";
      let mx, my, startY;
      if (ps.length >= 2) {
        const a = pos[ps[0]], b = pos[ps[ps.length - 1]];
        const lineage = ps.every((p) => ancestors.has(p));
        // leží mezi partnery jiná karta? Pak spojit „závorkou“ pod kartami, ne přes ně.
        const blocked = Object.entries(pos).some(([id, q]) => q.y === a.y && !ps.includes(id) && q.x > a.x && q.x < b.x);
        if (!blocked) {
          my = a.y + CARD_H / 2;
          mx = (a.x + CARD_W + b.x) / 2;
          links.push({ kind: "couple", union: u.id, cert, lineage, people: ps.slice(),
            d: `M ${a.x + CARD_W} ${my} L ${b.x} ${my}` });
        } else {
          const ax = a.x + CARD_W * 0.72, bx = b.x + CARD_W * 0.28, yb = a.y + CARD_H + 20, r = 8;
          my = yb; mx = (ax + bx) / 2;
          links.push({ kind: "couple bracket", union: u.id, cert, lineage, people: ps.slice(),
            d: `M ${ax} ${a.y + CARD_H} L ${ax} ${yb - r} Q ${ax} ${yb} ${ax + r} ${yb} L ${bx - r} ${yb} Q ${bx} ${yb} ${bx} ${yb - r} L ${bx} ${b.y + CARD_H}` });
        }
        startY = my;
        markers.push({ union: u.id, x: mx, y: my, cert, lineage, married: u.married || null, people: ps.slice() });
      } else {
        const a = pos[ps[0]];
        mx = a.x + CARD_W / 2; my = a.y + CARD_H; startY = my;
      }
      if (!kids.length) continue;
      const childTop = Math.min(...kids.map((k) => pos[k].y));
      const xs = kids.map((k) => pos[k].x + CARD_W / 2).concat([mx]);
      buses.push({ u, ps, kids, mx, startY, childTop, cert, lo: Math.min(...xs), hi: Math.max(...xs) });
    }
    const byGap = {};
    for (const b of buses) (byGap[b.childTop] ||= []).push(b);
    for (const list of Object.values(byGap)) {
      list.sort((a, b) => a.lo - b.lo);
      const levels = [];
      for (const b of list) {
        let L = levels.findIndex((end) => end + 14 < b.lo);
        if (L < 0) { L = levels.length; levels.push(-Infinity); }
        levels[L] = b.hi; b.level = L;
      }
      const n = levels.length;
      const step = Math.min(14, (ROW_GAP - 40) / Math.max(1, n));
      for (const b of list) b.busY = b.childTop - ROW_GAP / 2 + (b.level - (n - 1) / 2) * step;
    }
    for (const b of buses) {
      for (const k of b.kids) {
        const kx = pos[k].x + CARD_W / 2, ky = pos[k].y;
        const lineage = (k === focus || ancestors.has(k)) && b.ps.every((p) => ancestors.has(p));
        links.push({ kind: "child", union: b.u.id, child: k, cert: b.cert, lineage, people: [...b.ps, k],
          d: orth(b.mx, b.startY, b.busY, kx, ky) });
      }
    }
    for (const l of data.candidate_links || []) {
      for (const p of l.parents || []) {
        const a = pos[p], c = pos[l.child];
        if (!a || !c) continue;
        const ax = a.x + CARD_W / 2, cx = c.x + CARD_W / 2;
        const top = a.y < c.y;
        const y1 = top ? a.y + CARD_H : a.y, y2 = top ? c.y : c.y + CARD_H;
        links.push({ kind: "child", cert: "kandidat", people: [p, l.child], d: orth(ax, y1, (y1 + y2) / 2, cx, y2) });
      }
    }

    const rowsList = [];
    for (let r = maxRow; r >= minRow; r--) rowsList.push({ row: r, y: yOf(r) });

    return {
      pos, links, markers, rows: rowsList, ancestors,
      generations: maxRow - minRow + 1, maxRow, minRow,
      width, height, CARD_W, CARD_H,
    };
  }

  // svisle dolů na sběrnici, vodorovně, svisle dolů k dítěti; zaoblené rohy
  function orth(x1, y1, yb, x2, y2) {
    const dx = x2 - x1;
    if (Math.abs(dx) < 1) return `M ${x1} ${y1} L ${x2} ${y2}`;
    const r = Math.min(RADIUS, Math.abs(dx) / 2, Math.abs(yb - y1), Math.abs(y2 - yb));
    const s = dx > 0 ? 1 : -1;
    return `M ${x1} ${y1} L ${x1} ${yb - r} Q ${x1} ${yb} ${x1 + s * r} ${yb} ` +
      `L ${x2 - s * r} ${yb} Q ${x2} ${yb} ${x2} ${yb + r} L ${x2} ${y2}`;
  }

  function ancestorSet(R, focus) {
    const out = new Set();
    if (!focus) return out;
    const stack = [focus];
    while (stack.length) {
      const id = stack.pop();
      const u = R.parentUnion[id];
      if (!u) continue;
      for (const p of u.partners) if (!out.has(p)) { out.add(p); stack.push(p); }
    }
    return out;
  }

  // nejkratší cesta osobou -> focus přes svazky (rodič/dítě/manžel)
  function pathTo(data, from, to) {
    const R = rels(data);
    const adj = {};
    const add = (a, b, u) => { (adj[a] ||= []).push([b, u]); };
    for (const u of R.unions) {
      const m = [...u.partners, ...u.children];
      for (const a of m) for (const b of m) if (a !== b) {
        // sourozence nespojovat napřímo (cesta má jít přes rodiče)
        if (u.children.includes(a) && u.children.includes(b)) continue;
        add(a, b, u.id);
      }
    }
    const prev = { [from]: null };
    const q = [from];
    while (q.length) {
      const x = q.shift();
      if (x === to) break;
      for (const [y, u] of adj[x] || []) if (!(y in prev)) { prev[y] = [x, u]; q.push(y); }
    }
    if (!(to in prev)) return null;
    const people = [], unions = [];
    let cur = to;
    while (cur != null) {
      people.push(cur);
      const p = prev[cur];
      if (!p) break;
      unions.push(p[1]);
      cur = p[0];
    }
    return { people: people.reverse(), unions };
  }

  global.RodokmenLayout = { layout, pathTo, CARD_W, CARD_H };
})(typeof window !== "undefined" ? window : globalThis);
