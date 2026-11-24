/* Rozložení: od výchozí osoby nahoru. Manželé zůstanou u sebe, předci se větví ven. */
(function (global) {
  const CARD_W = 200;
  const CARD_H = 100;
  const GAP_X = 22;
  const COUPLE_GAP = 16;
  const GAP_Y = 156;
  const MARGIN = 80;

  function rels(data) {
    const parentsOf = {}, childrenOf = {}, spousesOf = {}, unionOfChild = {};
    for (const u of data.unions) {
      const partners = u.partners || [];
      const children = u.children || [];
      for (const c of children) {
        parentsOf[c] = partners.slice();
        unionOfChild[c] = u;
      }
      for (const p of partners) {
        (childrenOf[p] ||= []).push(...children);
        for (const q of partners) if (p !== q) (spousesOf[p] ||= new Set()).add(q);
      }
    }
    return { parentsOf, childrenOf, spousesOf, unionOfChild };
  }

  function computeGenerations(data, R) {
    const gen = {};
    const focus = data.meta.focus;
    if (!focus) return gen;
    gen[focus] = 0;
    let changed = true, guard = 0;
    while (changed && guard++ < 80) {
      changed = false;
      const assign = (id, g) => {
        if (id == null) return;
        if (gen[id] == null) { gen[id] = g; changed = true; }
      };
      for (const [child, parents] of Object.entries(R.parentsOf)) {
        if (gen[child] != null) for (const p of parents) assign(p, gen[child] + 1);
      }
      for (const [parent, children] of Object.entries(R.childrenOf)) {
        if (gen[parent] != null) for (const c of children) assign(c, gen[parent] - 1);
      }
      for (const [p, set] of Object.entries(R.spousesOf)) {
        if (gen[p] != null) for (const q of set) assign(q, gen[p]);
      }
      for (const it of data.identifications || []) {
        if (gen[it.a] != null) assign(it.b, gen[it.a]);
        if (gen[it.b] != null) assign(it.a, gen[it.b]);
      }
      for (const l of data.candidate_links || []) {
        if (l.type === "parent-child" && l.child && gen[l.child] != null) {
          for (const p of l.parents || []) assign(p, gen[l.child] + 1);
        }
        if (l.type === "parent-child" && l.child) {
          for (const p of l.parents || []) {
            if (gen[p] != null) assign(l.child, gen[p] - 1);
          }
        }
      }
    }
    for (const p of data.people) if (gen[p.id] == null) gen[p.id] = 0;
    return gen;
  }

  function layout(data) {
    const byId = Object.fromEntries(data.people.map((p) => [p.id, p]));
    const R = rels(data);
    const gen = computeGenerations(data, R);
    const gens = Object.values(gen);
    const minG = Math.min(...gens);
    const maxG = Math.max(...gens);
    const yOf = (g) => MARGIN + (maxG - g) * (CARD_H + GAP_Y);

    const pos = {};
    const visiting = new Set();

    function birthKey(id) {
      return String(((byId[id] || {}).birth || {}).date || id);
    }
    function siblingsOf(id) {
      const u = R.unionOfChild[id];
      if (!u) return [];
      return (u.children || []).filter((c) => c !== id && byId[c]);
    }
    function confirmedParents(id) {
      return (R.parentsOf[id] || []).filter((p) => byId[p]);
    }
    function maxRight() {
      let m = MARGIN;
      for (const p of Object.values(pos)) m = Math.max(m, p.x + p.w);
      return m;
    }
    function normalize(positions) {
      const xs = Object.values(positions);
      if (!xs.length) return positions;
      const minx = Math.min.apply(null, xs);
      if (minx !== 0) for (const k of Object.keys(positions)) positions[k] -= minx;
      return positions;
    }
    function idsAt(positions, g) {
      return Object.keys(positions).filter((id) => gen[id] === g)
        .sort((a, b) => positions[a] - positions[b]);
    }
    function blockOf(positions, ids) {
      if (!ids.length) return null;
      const min = Math.min.apply(null, ids.map((id) => positions[id]));
      const max = Math.max.apply(null, ids.map((id) => positions[id]));
      return {
        ids,
        min,
        width: max - min + CARD_W,
        rel: Object.fromEntries(ids.map((id) => [id, positions[id] - min])),
      };
    }

    function mergeTrees(tL, tR) {
      const positions = {};
      const L = tL.rootId, Rgt = tR.rootId;
      const gCouple = gen[L];
      const allG = new Set(Object.keys(tL.positions).concat(Object.keys(tR.positions)).map((id) => gen[id]));

      const lSibs = idsAt(tL.positions, gCouple).filter((id) => id !== L);
      const rSibs = idsAt(tR.positions, gCouple).filter((id) => id !== Rgt);
      lSibs.sort((a, b) => birthKey(a).localeCompare(birthKey(b)));
      rSibs.sort((a, b) => birthKey(a).localeCompare(birthKey(b)));
      let x = 0;
      for (const id of lSibs) { positions[id] = x; x += CARD_W + GAP_X; }
      positions[L] = x;
      x += CARD_W + COUPLE_GAP;
      positions[Rgt] = x;
      x += CARD_W + GAP_X;
      for (const id of rSibs) { positions[id] = x; x += CARD_W + GAP_X; }
      const coupleMid = (positions[L] + positions[Rgt] + CARD_W) / 2;

      const higher = [...allG].filter((g) => g > gCouple).sort((a, b) => a - b);
      for (const g of higher) {
        const bL = blockOf(tL.positions, idsAt(tL.positions, g));
        const bR = blockOf(tR.positions, idsAt(tR.positions, g));
        if (bL && bR) {
          let leftStart = coupleMid - GAP_X / 2 - bL.width;
          let rightStart = coupleMid + GAP_X / 2;
          if (leftStart + bL.width + GAP_X > rightStart) {
            rightStart = leftStart + bL.width + GAP_X;
          }
          for (const id of bL.ids) positions[id] = leftStart + bL.rel[id];
          for (const id of bR.ids) positions[id] = rightStart + bR.rel[id];
        } else if (bL) {
          const start = coupleMid - bL.width / 2;
          for (const id of bL.ids) positions[id] = start + bL.rel[id];
        } else if (bR) {
          const start = coupleMid - bR.width / 2;
          for (const id of bR.ids) positions[id] = start + bR.rel[id];
        }
      }

      for (const [id, px] of Object.entries(tL.positions)) if (positions[id] == null) positions[id] = px;
      for (const [id, px] of Object.entries(tR.positions)) if (positions[id] == null) positions[id] = px;
      return { positions: normalize(positions), rootId: L, rootX: positions[L] };
    }

    function addChildRow(tree, id, role) {
      const positions = Object.assign({}, tree.positions);
      const sibs = siblingsOf(id).filter((s) => positions[s] == null && !visiting.has(s) && !pos[s]);
      sibs.sort((a, b) => birthKey(a).localeCompare(birthKey(b)));
      let row;
      if (role === "left") row = sibs.concat([id]);
      else if (role === "right") row = [id].concat(sibs);
      else row = sibs.concat([id]).sort((a, b) => birthKey(a).localeCompare(birthKey(b)));

      const pars = confirmedParents(id).filter((p) => positions[p] != null);
      let cx = 0;
      if (pars.length) {
        const xs = pars.map((p) => positions[p]);
        cx = (Math.min.apply(null, xs) + Math.max.apply(null, xs) + CARD_W) / 2;
      } else if (tree.rootId != null && positions[tree.rootId] != null) {
        cx = positions[tree.rootId] + CARD_W / 2;
      }
      const rowW = row.length * CARD_W + Math.max(0, row.length - 1) * GAP_X;
      const rowLeft = cx - rowW / 2;
      row.forEach((rid, i) => { positions[rid] = rowLeft + i * (CARD_W + GAP_X); });
      return { positions: normalize(positions), rootId: id, rootX: positions[id] };
    }

    function selfRow(id, role) {
      const sibs = siblingsOf(id).filter((s) => !visiting.has(s) && !pos[s]);
      sibs.sort((a, b) => birthKey(a).localeCompare(birthKey(b)));
      let row;
      if (role === "left") row = sibs.concat([id]);
      else if (role === "right") row = [id].concat(sibs);
      else row = sibs.concat([id]).sort((a, b) => birthKey(a).localeCompare(birthKey(b)));
      const positions = {};
      row.forEach((rid, i) => { positions[rid] = i * (CARD_W + GAP_X); });
      return { positions, rootId: id, rootX: positions[id] };
    }

    function buildTree(id, role) {
      if (!byId[id] || visiting.has(id)) return null;
      visiting.add(id);
      const pars = confirmedParents(id).filter((p) => !visiting.has(p) && !pos[p]);
      let tree;
      if (pars.length >= 2) {
        const tL = buildTree(pars[0], "left");
        const tR = buildTree(pars[1], "right");
        if (tL && tR) tree = mergeTrees(tL, tR);
        else tree = tL || tR;
        tree = tree ? addChildRow(tree, id, role) : selfRow(id, role);
      } else if (pars.length === 1) {
        const t = buildTree(pars[0], "center");
        tree = t ? addChildRow(t, id, role) : selfRow(id, role);
      } else {
        tree = selfRow(id, role);
      }
      visiting.delete(id);
      return tree;
    }

    function stampTree(tree, originX) {
      if (!tree) return 0;
      let right = originX;
      for (const [id, x] of Object.entries(tree.positions)) {
        if (pos[id]) continue;
        pos[id] = { x: originX + x, y: yOf(gen[id]), w: CARD_W, h: CARD_H };
        right = Math.max(right, originX + x + CARD_W);
      }
      return right;
    }

    const focus = data.meta && data.meta.focus;
    stampTree(focus ? buildTree(focus, "center") : null, MARGIN);

    function attachSpouses() {
      let moved = true, guard = 0;
      while (moved && guard++ < 30) {
        moved = false;
        for (const [id, set] of Object.entries(R.spousesOf)) {
          if (!pos[id]) continue;
          for (const s of set) {
            if (!byId[s] || pos[s]) continue;
            pos[s] = {
              x: pos[id].x + CARD_W + COUPLE_GAP,
              y: yOf(gen[s] != null ? gen[s] : gen[id]),
              w: CARD_W, h: CARD_H,
            };
            moved = true;
          }
        }
      }
    }

    function originAvoidingOverlap(tree, origin) {
      let sh = origin;
      for (let iter = 0; iter < 40; iter++) {
        let extra = 0;
        for (const [id, x] of Object.entries(tree.positions)) {
          if (pos[id]) continue;
          const nx = sh + x;
          const g = gen[id];
          for (const [oid, op] of Object.entries(pos)) {
            if (gen[oid] !== g) continue;
            if (op.x + op.w + GAP_X > nx && nx + CARD_W + GAP_X > op.x) {
              extra = Math.max(extra, op.x + op.w + GAP_X - nx);
            }
          }
        }
        if (extra <= 0.5) break;
        sh += extra;
      }
      return sh;
    }

    function stampNear(tree, anchorId, preferredX) {
      if (!tree) return;
      const ax = tree.positions[anchorId] != null ? tree.positions[anchorId] : 0;
      const origin = originAvoidingOverlap(tree, preferredX - ax);
      stampTree(tree, origin);
    }

    function placeUnplacedChildren() {
      let progress = true, guard = 0;
      while (progress && guard++ < 40) {
        progress = false;
        for (const p of data.people) {
          if (pos[p.id]) continue;
          const parents = (R.parentsOf[p.id] || []).filter((id) => pos[id]);
          if (!parents.length) continue;
          const sibs = (R.childrenOf[parents[0]] || []).filter((id) => pos[id]);
          const mx = parents.reduce((a, id) => a + pos[id].x, 0) / parents.length;
          let x = sibs.length ? Math.max.apply(null, sibs.map((id) => pos[id].x)) + CARD_W + GAP_X : mx;
          const fake = { positions: { [p.id]: 0 } };
          x = originAvoidingOverlap(fake, x);
          pos[p.id] = { x, y: yOf(gen[p.id]), w: CARD_W, h: CARD_H };
          progress = true;
        }
        attachSpouses();
      }
    }

    attachSpouses();
    placeUnplacedChildren();

    function pickRoot() {
      const leftover = data.people.filter((p) => !pos[p.id]);
      if (!leftover.length) return null;
      let root = leftover.find((p) => (R.childrenOf[p.id] || []).some((c) => pos[c]));
      if (!root) {
        root = leftover.find((p) =>
          (data.candidate_links || []).some((l) => (l.parents || []).includes(p.id) && pos[l.child])
        );
      }
      if (!root) {
        root = leftover.find((p) =>
          (data.identifications || []).some((it) => (it.a === p.id && pos[it.b]) || (it.b === p.id && pos[it.a]))
        );
      }
      if (!root) root = leftover[0];
      let climb = 0, rid = root.id;
      while (climb++ < 20) {
        const pars = confirmedParents(rid).filter((id) => byId[id] && !pos[id] && !visiting.has(id));
        if (!pars.length) break;
        rid = pars[0];
      }
      return { leftoverRoot: root, rid };
    }

    function preferredXFor(rid) {
      for (const l of data.candidate_links || []) {
        if ((l.parents || []).includes(rid) && pos[l.child]) return pos[l.child].x;
        if (l.child === rid) {
          for (const p of l.parents || []) if (pos[p]) return pos[p].x;
        }
      }
      for (const it of data.identifications || []) {
        if (it.a === rid && pos[it.b]) return pos[it.b].x + CARD_W + 60;
        if (it.b === rid && pos[it.a]) return pos[it.a].x + CARD_W + 60;
      }
      const kids = (R.childrenOf[rid] || []).filter((id) => pos[id]);
      if (kids.length) return pos[kids[0]].x;
      const pars = confirmedParents(rid).filter((id) => pos[id]);
      if (pars.length) return pos[pars[0]].x;
      return maxRight() + 100;
    }

    let guardC = 0;
    while (guardC++ < 80) {
      const pick = pickRoot();
      if (!pick) break;
      const t = buildTree(pick.rid, "center");
      const pref = preferredXFor(pick.rid);
      if (t && Object.keys(t.positions).length) stampNear(t, pick.rid, pref);
      else if (!pos[pick.rid]) {
        const fake = { positions: { [pick.rid]: 0 } };
        const x = originAvoidingOverlap(fake, pref);
        pos[pick.rid] = { x, y: yOf(gen[pick.rid]), w: CARD_W, h: CARD_H };
      }
      attachSpouses();
      placeUnplacedChildren();
    }

        function unoverlap() {
      for (let g = minG; g <= maxG; g++) {
        const ids = data.people.filter((p) => gen[p.id] === g && pos[p.id]).map((p) => p.id)
          .sort((a, b) => pos[a].x - pos[b].x);
        for (let i = 1; i < ids.length; i++) {
          const prev = pos[ids[i - 1]], cur = pos[ids[i]];
          const minX = prev.x + prev.w + GAP_X;
          if (cur.x < minX) {
            const sh = minX - cur.x;
            for (let j = i; j < ids.length; j++) pos[ids[j]].x += sh;
          }
        }
      }
    }
    unoverlap();

    let minX = Infinity, maxX = 0, maxY = 0;
    for (const p of Object.values(pos)) minX = Math.min(minX, p.x);
    const sh = MARGIN - minX;
    for (const p of Object.values(pos)) p.x += sh;
    for (const p of Object.values(pos)) {
      maxX = Math.max(maxX, p.x + p.w);
      maxY = Math.max(maxY, p.y + p.h);
    }

    const links = [];
    function center(id) {
      const p = pos[id];
      if (!p) return null;
      return { x: p.x + p.w / 2, y: p.y + p.h / 2, top: p.y, bottom: p.y + p.h };
    }
    for (const u of data.unions) {
      const pts = (u.partners || []).filter((id) => pos[id]);
      const kids = (u.children || []).filter((id) => pos[id]);
      const cert = u.certainty || "potvrzeno";
      if (pts.length >= 1) {
        const cs = pts.map(center).filter(Boolean);
        if (cs.length === 2) {
          const y = cs[0].y;
          links.push({ type: "marry", cert, d: `M ${cs[0].x} ${y} L ${cs[1].x} ${y}` });
        }
        if (kids.length && cs.length) {
          const mx = cs.reduce((a, c) => a + c.x, 0) / cs.length;
          const my = cs[0].y;
          const kc = kids.map(center).filter(Boolean);
          const jy = my + CARD_H / 2 + 26;
          links.push({ type: "child", cert, d: `M ${mx} ${cs.length === 2 ? my : cs[0].bottom} L ${mx} ${jy}` });
          const minKx = Math.min.apply(null, kc.map((k) => k.x));
          const maxKx = Math.max.apply(null, kc.map((k) => k.x));
          if (kc.length > 1) links.push({ type: "child", cert, d: `M ${minKx} ${jy} L ${maxKx} ${jy}` });
          for (const k of kc) links.push({ type: "child", cert, d: `M ${k.x} ${jy} L ${k.x} ${k.top}` });
        }
      }
    }
    for (const l of data.candidate_links || []) {
      for (const p of l.parents || []) {
        const a = center(p), b = center(l.child);
        if (!a || !b) continue;
        const jy = (a.bottom + b.top) / 2;
        links.push({ type: "child", cert: "kandidat", d: `M ${a.x} ${a.bottom} C ${a.x} ${jy}, ${b.x} ${jy}, ${b.x} ${b.top}` });
      }
    }
    for (const it of data.identifications || []) {
      const a = center(it.a), b = center(it.b);
      if (!a || !b) continue;
      links.push({ type: "ident", cert: it.certainty || "pravdepodobne", d: `M ${a.x} ${a.y} C ${a.x} ${a.y - 50}, ${b.x} ${b.y - 50}, ${b.x} ${b.y}` });
    }

    return {
      pos, links, gen, minG, maxG,
      generations: maxG - minG + 1,
      width: maxX + MARGIN,
      height: maxY + MARGIN,
      CARD_W, CARD_H,
    };
  }

  global.RodokmenLayout = { layout, CARD_W, CARD_H };
})(typeof window !== "undefined" ? window : global);
