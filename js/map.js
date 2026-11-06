// Canvas map: pan/zoom, layers, picking, scenario playback drawing.
import { makeTerrainCanvas, makeContours } from './terrain.js';
import { CELL } from './fire.js';
import { pickEdge } from './data.js';
import { inPoly, bbox, inBB } from './fire.js';

export const STREET_MODES = {
  class: 'Road class',
  clearWidth: 'Clear width with parked cars',
  engine: 'Fire-engine access (current plan)',
  engineTime: 'Engine drive time (plan and seed)',
  grade: 'Grade (from DEM)',
  widthSource: 'Width data source',
  oneway: 'Direction of travel',
  ops: 'Contraflow and officer control (this plan)',
  walkRise: 'Homes above or below their street (hills)',
};

// Walk access (tools/walk-access.mjs): 90th-percentile height of hill homes above or below their street, m.
export const RISE_BINS = [[0, '#dbe7f3', '< 3 m'], [3, '#9ec5f4', '3–5 m'], [5, '#3987e5', '5–10 m'], [10, '#184f95', '10–20 m'], [20, '#0b2545', '20 m or more']];
export const riseColor = r => RISE_BINS.reduce((c, b) => r >= b[0] ? b[1] : c, RISE_BINS[0][1]);

// Access-constrained areas: residents behind the choke (synthetic), one blue ramp light to dark.
export const ACCESS_BINS = [[0, '#9ec5f4', '0'], [25, '#6da7ec', '25'], [100, '#3987e5', '100'], [250, '#256abf', '250'], [500, '#184f95', '500+']];
export const accessColor = r => ACCESS_BINS.reduce((c, b) => r >= b[0] ? b[1] : c, ACCESS_BINS[0][1]);

export class MapView {
  constructor(canvas, data) {
    this.cv = canvas; this.ctx = canvas.getContext('2d'); this.data = data;
    const t = data.net.meta.terrain;
    this.extent = [0, 0, t.xmax, t.ymax];
    this.terrain = makeTerrainCanvas(data.dem, data.Z);
    this.contours = makeContours(data.dem, data.Z, 20, 3);
    this.layers = { terrain: true, contours: true, streets: true, paths: true, evacZones: false, fireZones: true, neighborhoods: false, fire1923: true,
      cityBoundary: true, stations: true, noParking: false, tightTurns: false, access: false, demand: false, structures: false, fire: true, vehicles: true, queues: true, responder: true };
    this.streetMode = 'class';
    this.sim = null; this.selected = null; this.hover = null;
    this.family = []; // fire families on: [{ ignition, winds }] for the starting points a comparison tries (js/main.js syncFamilies)
    this.marks = []; // Guided view, Change the plan: [{ geom, kind: 'street' | 'link' | 'buyout', focus }] for the picked changes
    this.zoneShapes = data.layers.evacZones.map((z, i) => ({ i, rings: z.rings, bb: bbox(z.rings) }));
    this.resize();
    this.fit();
    this.bindEvents();
    this.fireImg = null; this.fireImgT = -1;
  }

  resize() {
    const r = this.cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    this.cv.width = Math.max(1, r.width * dpr); this.cv.height = Math.max(1, r.height * dpr);
    this.dpr = dpr; this.w = r.width; this.h = r.height;
  }
  fit(ext = [1500, 1200, 10300, 7600]) { // Berkeley city area by default
    this.cx = (ext[0] + ext[2]) / 2; this.cy = (ext[1] + ext[3]) / 2;
    this.scale = Math.min(this.w / (ext[2] - ext[0]), this.h / (ext[3] - ext[1])) * 0.95;
  }
  zoomTo(x, y, metersAcross = 800) { this.cx = x; this.cy = y; this.scale = this.w / metersAcross; this.draw(); }
  sx(x) { return (x - this.cx) * this.scale + this.w / 2; }
  sy(y) { return this.h / 2 - (y - this.cy) * this.scale; }
  wx(px) { return (px - this.w / 2) / this.scale + this.cx; }
  wy(py) { return this.cy - (py - this.h / 2) / this.scale; }

  bindEvents() {
    let drag = null, moved = false;
    this.cv.addEventListener('mousedown', e => { drag = [e.offsetX, e.offsetY, this.cx, this.cy]; moved = false; });
    window.addEventListener('mouseup', e => {
      if (drag && !moved && e.target === this.cv) this.click(e.offsetX, e.offsetY);
      drag = null;
    });
    this.cv.addEventListener('mousemove', e => {
      if (drag) {
        const dx = e.offsetX - drag[0], dy = e.offsetY - drag[1];
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        this.cx = drag[2] - dx / this.scale; this.cy = drag[3] + dy / this.scale; this.draw();
      }
      this.onHover?.(this.wx(e.offsetX), this.wy(e.offsetY));
    });
    this.cv.addEventListener('wheel', e => {
      e.preventDefault();
      const x = this.wx(e.offsetX), y = this.wy(e.offsetY);
      const f = Math.exp(-e.deltaY * 0.0015);
      this.scale = Math.max(0.02, Math.min(20, this.scale * f));
      this.cx = x - (e.offsetX - this.w / 2) / this.scale; this.cy = y + (e.offsetY - this.h / 2) / this.scale;
      this.draw();
    }, { passive: false });
    // Touch (phones and tablets): one finger pans, two fingers pinch to zoom, a tap selects like a click.
    let touch = null;
    const pos = t => { const r = this.cv.getBoundingClientRect(); return [t.clientX - r.left, t.clientY - r.top]; };
    const startTouch = e => {
      const ps = [...e.touches].map(pos);
      if (ps.length === 1) touch = { ps, cx: this.cx, cy: this.cy, moved: touch?.moved && e.type !== 'touchstart' ? true : false, tap: e.type === 'touchstart' };
      else if (ps.length >= 2) {
        const mx = (ps[0][0] + ps[1][0]) / 2, my = (ps[0][1] + ps[1][1]) / 2;
        touch = { ps, d: Math.hypot(ps[0][0] - ps[1][0], ps[0][1] - ps[1][1]) || 1, scale: this.scale, wx: this.wx(mx), wy: this.wy(my), moved: true, tap: false };
      } else touch = null;
    };
    this.cv.addEventListener('touchstart', e => { e.preventDefault(); startTouch(e); }, { passive: false });
    this.cv.addEventListener('touchmove', e => {
      e.preventDefault();
      if (!touch) return;
      const ps = [...e.touches].map(pos);
      if (ps.length === 1 && touch.ps.length === 1) {
        const dx = ps[0][0] - touch.ps[0][0], dy = ps[0][1] - touch.ps[0][1];
        if (Math.abs(dx) + Math.abs(dy) > 6) { touch.moved = true; touch.tap = false; }
        this.cx = touch.cx - dx / this.scale; this.cy = touch.cy + dy / this.scale; this.draw();
      } else if (ps.length >= 2 && touch.ps.length >= 2) {
        const d = Math.hypot(ps[0][0] - ps[1][0], ps[0][1] - ps[1][1]) || 1;
        const mx = (ps[0][0] + ps[1][0]) / 2, my = (ps[0][1] + ps[1][1]) / 2;
        this.scale = Math.max(0.02, Math.min(20, touch.scale * d / touch.d));
        this.cx = touch.wx - (mx - this.w / 2) / this.scale; this.cy = touch.wy + (my - this.h / 2) / this.scale;
        this.draw();
      }
    }, { passive: false });
    this.cv.addEventListener('touchend', e => {
      e.preventDefault();
      if (touch?.tap && !touch.moved && e.touches.length === 0) this.click(touch.ps[0][0], touch.ps[0][1]);
      if (e.touches.length) startTouch(e); else touch = null;
    }, { passive: false });
    this.cv.addEventListener('touchcancel', () => { touch = null; });
    window.addEventListener('resize', () => { this.resize(); this.draw(); });
  }

  click(px, py) {
    const x = this.wx(px), y = this.wy(py);
    const eid = pickEdge(this.data, x, y, 10 / this.scale);
    if (eid != null) this.selected = { kind: 'edge', id: eid };
    else {
      const z = this.zoneShapes.find(q => inBB(q.bb, x, y) && inPoly(x, y, q.rings));
      this.selected = z ? { kind: 'zone', id: z.i } : null;
    }
    this.onSelect?.(this.selected, x, y);
    this.draw();
  }

  // ---------- drawing ----------
  draw() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = null; this.render(); });
  }

  render() {
    const { ctx, data, layers: L } = this, d = this.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.fillStyle = '#e9e6de'; ctx.fillRect(0, 0, this.w, this.h);
    const t = data.net.meta.terrain;
    if (L.terrain) {
      ctx.imageSmoothingEnabled = this.scale < 1 / t.resolution * 1.5;
      ctx.drawImage(this.terrain, this.sx(0), this.sy(t.ymax), t.width * t.resolution * this.scale, t.height * t.resolution * this.scale);
    }
    if (L.contours) this.drawContours();
    if (L.fireZones) this.drawPolys(data.layers.fireZones.filter(z => z.zone >= 2), z => z.zone === 3 ? 'rgba(200,60,30,0.13)' : 'rgba(230,140,40,0.12)', null);
    if (L.demand && data.demand) this.drawDemand();
    if (L.evacZones) this.drawEvacZones();
    if (L.neighborhoods) this.drawPolys(data.layers.neighborhoods, null, 'rgba(70,70,120,0.55)', z => z.name);
    if (L.cityBoundary) this.drawPolys(data.layers.cityBoundary, null, 'rgba(40,40,40,0.7)', null, [6, 4], 1.5);
    if (L.fire1923) this.drawPolys(data.layers.fire1923, null, 'rgba(150,20,20,0.8)', () => '1923 fire (archival boundary)', [3, 3], 1.5);
    if (L.structures && data.structures) this.drawStructures();
    if (L.fire && this.sim) this.drawFire();
    if (L.access && data.access) this.drawAccessUnder();
    if (L.streets) this.drawStreets();
    if (L.paths) this.drawPaths();
    if (L.access && data.access) this.drawAccessOver();
    if (L.queues && this.sim) this.drawQueues();
    if (L.responder && this.sim) this.drawResponder();
    if (L.vehicles && this.sim) this.drawVehicles();
    if (L.tightTurns) this.drawTightTurns();
    if (L.noParking) this.drawPoints(data.layers.noParkingSigns, '#b0306a', 1.6);
    if (L.stations) this.drawStations();
    this.drawFamily();
    if (this.sim) this.drawIgnition();
    this.drawMarks();
    this.drawSelection();
    this.drawScaleNorth();
  }

  // The streets a picked change touches: a red curb or widening (green), a new road (dashed green),
  // a bought-out block (purple). The change the user is looking at is drawn heavier.
  drawMarks() {
    const { ctx } = this; if (!this.marks.length) return;
    const C = { street: '#15803d', link: '#15803d', buyout: '#7e22ce' };
    ctx.save(); ctx.lineCap = 'round';
    for (const m of this.marks) {
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = m.focus ? 11 : 8; ctx.setLineDash([]); ctx.beginPath(); this.path(m.geom); ctx.stroke();
      ctx.strokeStyle = C[m.kind]; ctx.lineWidth = m.focus ? 7 : 5; ctx.setLineDash(m.kind === 'link' ? [6, 5] : []); ctx.beginPath(); this.path(m.geom); ctx.stroke();
    }
    ctx.restore();
  }
  path(pts) {
    const { ctx } = this; ctx.moveTo(this.sx(pts[0][0]), this.sy(pts[0][1]));
    for (let i = 1; i < pts.length; i++) ctx.lineTo(this.sx(pts[i][0]), this.sy(pts[i][1]));
  }
  drawPolys(polys, fill, stroke, label, dash, width = 1) {
    const { ctx } = this;
    for (const p of polys) {
      ctx.beginPath(); for (const r of p.rings) { this.path(r); ctx.closePath(); }
      if (fill) { ctx.fillStyle = typeof fill === 'function' ? fill(p) : fill; ctx.fill('evenodd'); }
      if (stroke) { ctx.setLineDash(dash || []); ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); ctx.setLineDash([]); }
      if (label && this.scale > 0.12) {
        const txt = label(p); if (!txt) continue;
        const b = bbox(p.rings); const x = this.sx((b[0] + b[2]) / 2), y = this.sy((b[1] + b[3]) / 2);
        ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = stroke || '#333'; ctx.textAlign = 'center'; ctx.fillText(txt, x, y);
      }
    }
  }
  // Share of residents 75 and older by zone (ACS 2020–2024, data/model/demand-by-zone.json); figures only.
  drawDemand() {
    const D = this.data.demand.zones, Z = this.data.layers.evacZones;
    this.drawPolys(Z.filter(z => D[z.id]?.age75), z => { const s = D[z.id].age75.value; return `rgba(13,110,140,${s < 0.05 ? 0.06 : s < 0.1 ? 0.18 : s < 0.15 ? 0.32 : 0.48})`; },
      'rgba(13,110,140,0.45)', this.scale > 0.35 ? z => `${Math.round(D[z.id].age75.value * 100)}%` : null);
  }
  drawEvacZones() {
    const sim = this.sim, t = sim?.t ?? 0, Z = this.data.layers.evacZones;
    const fill = sim ? (z => { const T = sim.orderT[Z.indexOf(z)]; return T <= t ? 'rgba(120,60,200,0.16)' : T < Infinity ? 'rgba(120,60,200,0.05)' : null; }) : null;
    this.drawPolys(Z, fill, 'rgba(110,60,170,0.6)', this.scale > 0.35 ? z => z.id : null);
  }
  drawContours() {
    const { ctx } = this;
    const step = this.scale < 0.25 ? 100 : this.scale < 0.6 ? 40 : 20;
    for (const { level, segs } of this.contours) {
      if (level % step) continue;
      const major = level % 100 === 0;
      ctx.strokeStyle = major ? 'rgba(110,90,60,0.45)' : 'rgba(110,90,60,0.22)'; ctx.lineWidth = major ? 0.9 : 0.5;
      ctx.beginPath();
      for (let i = 0; i < segs.length; i += 4) { ctx.moveTo(this.sx(segs[i]), this.sy(segs[i + 1])); ctx.lineTo(this.sx(segs[i + 2]), this.sy(segs[i + 3])); }
      ctx.stroke();
      if (major && this.scale > 0.4) { // a few labels per major contour
        ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = 'rgba(100,80,50,0.8)'; ctx.textAlign = 'center';
        for (let i = 0; i < segs.length; i += 4 * 400) { const x = this.sx(segs[i]), y = this.sy(segs[i + 1]); if (x > 0 && y > 0 && x < this.w && y < this.h) ctx.fillText(`${level} m`, x, y); }
      }
    }
  }
  streetStyle(e) {
    const m = this.streetMode, sim = this.sim;
    const lanes = e.lanes[0] + e.lanes[1];
    let w = Math.max(1, Math.min(4, lanes * 0.6)) * Math.max(0.6, Math.min(2.5, this.scale * 1.5));
    let c = '#555';
    if (m === 'class') c = { Interstate: '#7a4b9c', Ramp: '#7a4b9c', 'Principal Arterial': '#c0703a', 'Major Collector': '#c09a3a' }[e.cls] || (e.fireZone >= 2 ? '#3d4f63' : '#5b5b5b');
    else if (m === 'clearWidth') { const cw = sim ? sim.clear[e.id] : e.clearWidthM; const ft = cw / 0.3048; c = cw == null || Number.isNaN(cw) ? '#aaa' : ft < 6.5 ? '#c0262d' : ft < 8.5 ? '#e07a1e' : ft < 10 ? '#e8c21e' : ft < 20 ? '#9cc65a' : '#2f8a4a'; }
    else if (m === 'engine') { const ok = sim ? sim.engineOK[e.id] : !e.engineBlocked; const eff = sim ? sim.eff[e.id] : e.effLanes; c = !ok ? '#c0262d' : eff === 1 || eff === 0 ? '#e08a1e' : eff === 2 ? '#2f8a4a' : '#aaa'; }
    else if (m === 'engineTime') { // minutes at ignition, no traffic (sim.engineReach0; SOURCE_NOTES ER1)
      const t = sim?.engineReach0?.[e.id]; c = t == null ? '#aaa' : t === Infinity ? '#7f1d1d' : t <= 300 ? '#2f8a4a' : t <= 480 ? '#e0a21e' : '#c0262d'; }
    else if (m === 'grade') { const g = e.gradeReliable ? e.gradeMax : null; c = g == null ? '#aaa' : g < 5 ? '#4f7f9b' : g < 10 ? '#8fae4a' : g < 15 ? '#e0b21e' : g < 20 ? '#e07a1e' : '#c0262d'; }
    else if (m === 'widthSource') c = e.widthSrc === 'unknown' ? '#aaa' : e.narrow ? '#8a3fb8' : '#2b6cb0';
    else if (m === 'oneway') c = e.trav === 'FT' || e.trav === 'TF' ? '#d1495b' : e.trav === 'NT' ? '#aaa' : '#666';
    else if (m === 'walkRise') { // the segment's figure, or its zone's pooled one where it has fewer than 5 buildings
      const W = this.data.walk, sg = W?.segments?.[e.id], v = sg ? (sg.p90RiseM ?? W.zones?.[sg.zone]?.p90RiseM) : null;
      c = v == null ? '#d4d4d4' : riseColor(v); if (v != null) w = Math.max(w, 2.5); }
    else if (m === 'robust') { // Guided view (js/explore.js): a class per segment across the run set, colored by edgePalette
      const k = this.edgeClass?.[e.id] ?? 0; c = this.edgePalette?.[k] || '#d4d4d4'; if (k >= 2) w = Math.max(w, 2.5); }
    else if (m === 'ops') { // js/operations.js: contraflow status on this plan
      const st = sim?.ops?.cf?.status.get(e.id), comp = st && sim.ops.cf.comps[st.comp];
      c = !st ? '#d4d4d4' : !st.ok ? '#e07a1e' : comp?.state === 'running' ? '#1d4ed8' : comp?.state === 'scheduled' ? '#93c5fd' : '#9ca3af';
      if (st) w = Math.max(w, 3); }
    return [c, w];
  }
  drawStreets() {
    const { ctx, data } = this;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const vb = [this.wx(0), this.wy(this.h), this.wx(this.w), this.wy(0)];
    for (const e of data.net.edges) {
      if (e.mode !== 'vehicle') continue;
      const m = data.edgeMid[e.id]; if (m[0] < vb[0] - 500 || m[0] > vb[2] + 500 || m[1] < vb[1] - 500 || m[1] > vb[3] + 500) continue;
      const [c, w] = this.streetStyle(e);
      ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); this.path(e.geom); ctx.stroke();
      if (this.streetMode === 'oneway' && (e.trav === 'FT' || e.trav === 'TF') && this.scale > 0.5) this.arrow(e);
    }
    // Junctions under officer control, and dark signals in a power shutoff (street mode "ops")
    if (this.streetMode === 'ops' && this.sim?.ops) {
      const o = this.sim.ops, ctl = new Set(o.police && o.prio ? o.police.nodes : []), r = Math.max(3, Math.min(6, this.scale * 4));
      const dark = o.shutoff ? (data.signals?.junctions || []).filter(j => j.signal && (this.sim.world.powerShutoff === 'all' || j.hills)).map(j => j.node) : [];
      for (const [n, col] of [...dark.filter(n => !ctl.has(n)).map(n => [n, '#111']), ...[...ctl].map(n => [n, '#7c3aed'])]) {
        const x = this.sx(data.net.nodes[n][0]), y = this.sy(data.net.nodes[n][1]);
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill();
      }
    }
    // Diverters (City list, shape from OpenStreetMap), bollards and gates that close a street to residents' cars
    for (const e of data.net.edges) {
      if (!e.barrier?.closed) continue;
      const [mx, my] = data.edgeMid[e.id], x = this.sx(mx), y = this.sy(my), r = Math.max(3, Math.min(6, this.scale * 4));
      if (x < -10 || y < -10 || x > this.w + 10 || y > this.h + 10) continue;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); ctx.stroke();
      ctx.strokeStyle = e.barrier.engines ? '#7c3aed' : '#111'; ctx.lineWidth = 2; ctx.stroke();
    }
    if (this.scale > 1.2) { // street labels
      ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = '#222'; ctx.textAlign = 'center';
      const seen = new Set();
      for (const e of data.net.edges) {
        if (e.mode !== 'vehicle' || e.len * this.scale < 70 || e.name === 'UNNAMED') continue;
        const [mx, my] = data.edgeMid[e.id], x = this.sx(mx), y = this.sy(my);
        if (x < 0 || y < 0 || x > this.w || y > this.h) continue;
        const k = `${e.name}${Math.round(x / 150)},${Math.round(y / 150)}`; if (seen.has(k)) continue; seen.add(k);
        const g = e.geom, a = Math.atan2(-(g[g.length - 1][1] - g[0][1]), g[g.length - 1][0] - g[0][0]);
        ctx.save(); ctx.translate(x, y); ctx.rotate(a > Math.PI / 2 || a < -Math.PI / 2 ? a + Math.PI : a);
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 3; ctx.strokeText(titleCaseShort(e.name), 0, -3); ctx.fillText(titleCaseShort(e.name), 0, -3); ctx.restore();
      }
    }
  }
  arrow(e) {
    const { ctx } = this, g = e.trav === 'FT' ? e.geom : [...e.geom].reverse();
    const [mx, my] = this.data.edgeMid[e.id]; let best = 1, bd = Infinity;
    for (let i = 1; i < g.length; i++) { const d = Math.hypot(g[i][0] - mx, g[i][1] - my); if (d < bd) { bd = d; best = i; } }
    const a = g[best - 1], b = g[best], ang = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
    ctx.save(); ctx.translate(this.sx(mx), this.sy(my)); ctx.rotate(ang); ctx.fillStyle = '#d1495b';
    ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-4, 4); ctx.fill(); ctx.restore();
  }
  drawPaths() {
    const { ctx } = this; ctx.setLineDash([3, 3]); ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = Math.max(1, Math.min(2, this.scale * 1.2));
    for (const e of this.data.net.edges) if (e.mode !== 'vehicle') { ctx.beginPath(); this.path(e.geom); ctx.stroke(); }
    ctx.setLineDash([]);
  }
  // Access layer, below the streets: a band under each member street, so "Color streets by"
  // still shows on top. Shade = residents behind the outermost choke; dashed band = one-way area.
  inView(m, pad = 300) { return m[0] > this.wx(0) - pad && m[0] < this.wx(this.w) + pad && m[1] > this.wy(this.h) - pad && m[1] < this.wy(0) + pad; }
  accessBand() { return Math.max(6, Math.min(18, this.scale * 9)); }
  drawAccessUnder() {
    const { ctx, data } = this, acc = data.access, band = this.accessBand();
    ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
    const sel = this.selectedArea;
    if (sel) { // selected area: a yellow rim under the band
      ctx.strokeStyle = 'rgba(250,204,21,0.9)'; ctx.lineWidth = band + 8;
      for (const id of sel.memberEdges) { ctx.beginPath(); this.path(data.net.edges[id].geom); ctx.stroke(); }
    }
    for (const [id, areas] of acc.edgeAreas) {
      if (!this.inView(data.edgeMid[id])) continue;
      const a = areas[areas.length - 1], e = data.net.edges[id]; // outermost area
      ctx.strokeStyle = accessColor(a.residents); ctx.lineWidth = band;
      ctx.setLineDash(a.type === 'one-way' ? [band * 1.2, band * 0.8] : []);
      ctx.beginPath(); this.path(e.geom); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.lineCap = 'round';
  }
  // Above the streets: chokes, hints, existing paths, allocation warnings.
  drawAccessOver() {
    const { ctx, data } = this, acc = data.access, band = this.accessBand(), sel = this.selectedArea;
    const near = this.scale > 0.5;
    // Allocation warnings: hatched, outlined box around the area
    for (const a of acc.areas) {
      if (!a.allocationWarning) continue;
      const [x0, y0, x1, y1] = a.bbox, P = 40, X = this.sx(x0 - P), Y = this.sy(y1 + P), W = (x1 - x0 + 2 * P) * this.scale, H = (y1 - y0 + 2 * P) * this.scale;
      ctx.fillStyle = this.hatch(); ctx.fillRect(X, Y, W, H);
      ctx.strokeStyle = '#9a3412'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]); ctx.strokeRect(X, Y, W, H); ctx.setLineDash([]);
      ctx.font = 'bold 11px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#9a3412';
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3;
      const t = this.scale > 0.3 ? '⚠ population placement artifact' : '⚠'; ctx.strokeText(t, X, Y - 4); ctx.fillText(t, X, Y - 4);
    }
    // Existing paths and stairways out of an area, and the nearest-other-street hint (dead ends only)
    for (const a of acc.areas) {
      const show = a === sel || (near && a.residents >= 10 && this.inView(a.chokeAt, 600)); // hints for areas with 10+ residents, or the selected one
      if (!show) continue;
      if (a.existingLink) {
        ctx.setLineDash([3, 3]); ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 3.5;
        for (const id of a.existingLink.edges) { ctx.beginPath(); this.path(data.net.edges[id].geom); ctx.stroke(); }
      }
      const h = a.nearestOtherStreet;
      if (a.type === 'dead end' && h && h.distM > 0) {
        const fx = this.sx(h.from[0]), fy = this.sy(h.from[1]), tx = this.sx(h.to[0]), ty = this.sy(h.to[1]);
        ctx.setLineDash([6, 4]); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.strokeStyle = '#111'; ctx.lineWidth = 1.8; ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#111'; for (const [x, y] of [[fx, fy], [tx, ty]]) { ctx.beginPath(); ctx.arc(x, y, 2.5, 0, 7); ctx.fill(); }
        if (this.scale > 1.2 || a === sel) {
          const t = `${Math.round(h.distM)} m, ${h.climbM >= 0 ? '+' : '−'}${Math.abs(Math.round(h.climbM))} m climb`;
          this.halo(t, (fx + tx) / 2 + 4, (fy + ty) / 2 - 4, '#111', 'left');
        }
      }
    }
    ctx.setLineDash([]);
    // Chokes: a thick bar; red if an engine does not fit (under 10 ft clear, both sides parked), open if width unknown
    ctx.lineCap = 'butt';
    for (const a of acc.areas) {
      if (!this.inView(a.chokeAt)) continue;
      const fits = a.choke.engineFits, g = this.chokeMouth(a, Math.max(25, 16 / this.scale));
      if (!g) continue;
      ctx.beginPath(); this.path(g);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = band + 6; ctx.stroke();
      ctx.strokeStyle = fits === false ? '#c0262d' : '#1f2937'; ctx.lineWidth = band + 3; ctx.stroke();
      if (fits == null) { ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(2, band - 3); ctx.stroke(); }
      if (this.scale > 1.5) {
        const [lx, ly] = g[g.length - 1];
        this.halo(a.choke.clearWidthFt == null ? 'width unknown' : `${Math.round(a.choke.clearWidthFt)} ft`, this.sx(lx) + band, this.sy(ly) + 4, fits === false ? '#c0262d' : '#111', 'left', 'bold 11px');
      }
    }
    ctx.lineCap = 'round';
  }
  // The first L meters of the entrance, starting at its outer end (chokeAt), as a polyline.
  chokeMouth(a, L) {
    const ed = this.data.net.edges, d2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
    let best = null;
    for (const id of a.chokeEdges) {
      const g = ed[id].geom, f = d2(g[0], a.chokeAt), b = d2(g[g.length - 1], a.chokeAt);
      const c = f <= b ? [f, g] : [b, [...g].reverse()]; if (!best || c[0] < best[0]) best = c;
    }
    if (!best) return null;
    const g = best[1], out = [g[0]]; let acc = 0;
    for (let i = 1; i < g.length; i++) {
      const d = Math.hypot(g[i][0] - g[i - 1][0], g[i][1] - g[i - 1][1]);
      if (acc + d >= L) { const u = d ? (L - acc) / d : 0; out.push([g[i - 1][0] + u * (g[i][0] - g[i - 1][0]), g[i - 1][1] + u * (g[i][1] - g[i - 1][1])]); return out; }
      acc += d; out.push(g[i]);
    }
    return out;
  }
  halo(t, x, y, color, align = 'center', font = '10.5px') {
    const { ctx } = this; ctx.font = `${font} system-ui, sans-serif`; ctx.textAlign = align;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3; ctx.strokeText(t, x, y); ctx.fillStyle = color; ctx.fillText(t, x, y);
  }
  hatch() {
    if (this._hatch) return this._hatch;
    const c = document.createElement('canvas'); c.width = c.height = 8; const g = c.getContext('2d');
    g.strokeStyle = 'rgba(154,52,18,0.35)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, 8); g.lineTo(8, 0); g.stroke();
    return (this._hatch = this.ctx.createPattern(c, 'repeat'));
  }
  drawTightTurns() {
    const { ctx } = this; ctx.strokeStyle = '#d97706'; ctx.lineWidth = 4;
    for (const t of this.data.layers.tightTurns) { ctx.beginPath(); this.path(t.pts); ctx.stroke(); }
  }
  // Structures per 30 m fire cell (tools/build-structures.mjs): darker where more of the cell's
  // structures stand under 25 ft from their nearest neighbor.
  drawStructures() {
    const { ctx } = this, st = this.data.structures, W = st.meta.W, C = st.meta.cell, s = C * this.scale;
    ctx.save();
    for (const [c, n, b25] of st.structures) {
      const x = (c % W) * C, y = (Math.floor(c / W) + 1) * C, f = b25 / n;
      ctx.fillStyle = `rgba(${Math.round(120 - 60 * f)},${Math.round(70 - 40 * f)},${Math.round(150 - 50 * f)},${0.25 + 0.15 * Math.min(n, 4)})`;
      ctx.fillRect(this.sx(x), this.sy(y), s, s);
    }
    ctx.restore();
  }

  drawPoints(pts, color, r) {
    const { ctx } = this; ctx.fillStyle = color;
    for (const p of pts) { const x = this.sx(p.pt[0]), y = this.sy(p.pt[1]); if (x < -5 || y < -5 || x > this.w + 5 || y > this.h + 5) continue; ctx.fillRect(x - r, y - r, 2 * r, 2 * r); }
  }
  drawStations() {
    const { ctx } = this;
    ctx.font = 'bold 10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const s of this.data.layers.fireStations) {
      const x = this.sx(s.pt[0]), y = this.sy(s.pt[1]);
      ctx.fillStyle = '#b91c1c'; ctx.fillRect(x - 8, y - 7, 16, 14); ctx.fillStyle = '#fff'; ctx.fillText(s.name.replace(/\D+/g, '') || 'FS', x, y + 0.5);
    }
    for (const s of this.data.layers.shelters) {
      const x = this.sx(s.pt[0]), y = this.sy(s.pt[1]);
      ctx.fillStyle = '#15803d'; ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText('S', x, y + 0.5);
    }
    ctx.textBaseline = 'alphabetic';
  }
  drawFire() {
    const sim = this.sim, f = sim.fire, tMin = sim.t / 60;
    if (!this.fireImg || Math.abs(this.fireImgT - tMin) >= 0.5 || this.fireImgSim !== sim) {
      const W = f.W, H = f.H;
      const cv = this.fireImg || document.createElement('canvas'); cv.width = W; cv.height = H;
      const c = cv.getContext('2d'), img = c.createImageData(W, H), px = img.data;
      for (let r = 0; r < H; r++) for (let col = 0; col < W; col++) {
        const i = r * W + col, o = ((H - 1 - r) * W + col) * 4, a = f.arrival[i], em = f.ember[i];
        if (a <= tMin) {
          const age = tMin - a;
          if (age < 15) { px[o] = 255; px[o + 1] = 110 + age * 4; px[o + 2] = 0; px[o + 3] = 220; }
          else { px[o] = 90; px[o + 1] = 30; px[o + 2] = 25; px[o + 3] = 170; }
        } else if (em <= tMin) {
          const stipple = ((col + r) % 2 === 0);
          px[o] = 255; px[o + 1] = 170; px[o + 2] = 20; px[o + 3] = stipple ? 120 : 60;
        }
      }
      c.putImageData(img, 0, 0);
      this.fireImg = cv; this.fireImgT = tMin; this.fireImgSim = sim;
    }
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(this.fireImg, this.sx(0), this.sy(f.H * CELL), f.W * CELL * this.scale, f.H * CELL * this.scale);
  }
  drawQueues() {
    const { ctx, sim } = this, t = sim.t;
    ctx.lineCap = 'round';
    for (const lid of sim.active) {
      const L = sim.links[lid]; let w = 0;
      for (const i of L.q) if (t >= sim.v.enter[i] + L.ff) w++;
      if (w < 3) continue;
      const frac = Math.min(1, w / L.storage);
      ctx.strokeStyle = `rgba(200,20,40,${0.35 + 0.5 * frac})`; ctx.lineWidth = 3 + 6 * frac;
      ctx.beginPath(); this.path(this.data.net.edges[L.e].geom); ctx.stroke();
    }
  }
  drawVehicles() {
    const { ctx, sim, data } = this, t = sim.t, v = sim.v, spacing = data.A.capacity.vehicleSpacingM;
    const s = Math.max(1.2, Math.min(3, this.scale * 2));
    for (const lid of sim.active) {
      const L = sim.links[lid], e = data.net.edges[L.e], g = e.geom;
      const lanes = Math.max(1, e.lanes[L.dir]);
      L.q.forEach((i, k) => {
        const prog = Math.min((t - v.enter[i]) / L.ff * L.len, L.len - Math.floor(k / lanes) * spacing);
        const u = Math.max(0, prog) / L.len;
        const [x, y] = along(g, L.dir ? 1 - u : u);
        ctx.fillStyle = v.exposed[i] ? '#e11d48' : v.cls[i] === 2 ? '#d97706' : '#1d4ed8';
        ctx.fillRect(this.sx(x) - s / 2, this.sy(y) - s / 2, s, s);
      });
    }
  }
  drawResponder() {
    const { ctx, sim } = this, r = sim.responder;
    if (!r?.route?.length) return;
    ctx.strokeStyle = 'rgba(14,116,144,0.85)'; ctx.lineWidth = 4; ctx.setLineDash([8, 5]);
    for (const eid of r.route) { ctx.beginPath(); this.path(this.data.net.edges[eid].geom); ctx.stroke(); }
    ctx.setLineDash([]);
    if (r.pinch) { ctx.strokeStyle = '#c0262d'; ctx.lineWidth = 6; for (const eid of r.pinch) { ctx.beginPath(); this.path(this.data.net.edges[eid].geom); ctx.stroke(); } }
  }
  // Fire families: a small circle at each starting point a comparison tries, with a short line toward
  // where each family wind comes from (0°, 30°, 45°, 60°). No picker: the watched run stays the fire as it is.
  drawFamily() {
    const { ctx } = this; if (!this.family.length) return;
    ctx.save();
    for (const f of this.family) {
      const X = this.sx(f.ignition[0]), Y = this.sy(f.ignition[1]);
      ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 1.5;
      for (const w of f.winds) { const a = w * Math.PI / 180; ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X + Math.sin(a) * 22, Y - Math.cos(a) * 22); ctx.stroke(); }
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#b91c1c'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(X, Y, 5, 0, 7); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }
  drawIgnition() {
    const { ctx } = this, [x, y] = this.sim.scenario.ignition, X = this.sx(x), Y = this.sy(y);
    ctx.fillStyle = '#b91c1c'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    for (const [sx, sy] of this.sim.fire.starts?.length > 1 ? this.sim.fire.starts : [[x, y]]) { // several starts (earthquake): a marker at each
      const PX = this.sx(sx), PY = this.sy(sy);
      ctx.beginPath(); ctx.moveTo(PX, PY - 11); ctx.lineTo(PX + 7, PY + 6); ctx.lineTo(PX - 7, PY + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    // wind arrow
    // The wind in force at the run's current time (a scenario wind schedule changes it; js/fire.js windSegments).
    const sc = this.sim.scenario, now = (sc.windSchedule || []).filter(w => w.fromMin * 60 <= this.sim.t).pop() || sc;
    const to = ((now.windFrom + 180) % 360) * Math.PI / 180, L = 40;
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2; ctx.beginPath();
    const x1 = X - Math.sin(to) * L - 20, y1 = Y + Math.cos(to) * L, x2 = X - 20, y2 = Y;
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x2, y2, 3, 0, 7); ctx.fillStyle = '#0f172a'; ctx.fill();
    ctx.font = '11px system-ui, sans-serif'; ctx.fillText(`wind ${now.windMph} mph`, x1, y1 - 4);
  }
  drawSelection() {
    const { ctx, selected } = this; if (!selected) return;
    if (selected.kind === 'edge') {
      ctx.strokeStyle = '#facc15'; ctx.lineWidth = 8; ctx.globalAlpha = 0.8; ctx.beginPath(); this.path(this.data.net.edges[selected.id].geom); ctx.stroke(); ctx.globalAlpha = 1;
    } else if (selected.kind === 'zone') {
      this.drawPolys([this.data.layers.evacZones[selected.id]], 'rgba(250,204,21,0.18)', '#ca8a04', null, null, 2);
    }
  }
  drawScaleNorth() {
    const { ctx } = this;
    const target = 120 / this.scale, pow = 10 ** Math.floor(Math.log10(target));
    const m = [1, 2, 5].map(k => k * pow).reverse().find(v => v <= target) || pow;
    const px = m * this.scale, x0 = 16, y0 = this.h - 18;
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(x0 - 6, y0 - 20, px + 70, 28);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y0 - 5); ctx.lineTo(x0, y0); ctx.lineTo(x0 + px, y0); ctx.lineTo(x0 + px, y0 - 5); ctx.stroke();
    ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = '#111'; ctx.textAlign = 'left';
    ctx.fillText(m >= 1000 ? `${m / 1000} km` : `${m} m`, x0 + px + 6, y0);
    // north arrow (grid north of UTM 10N; within 1° of true north here)
    const nx = this.w - 26, ny = 40;
    ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(nx, ny, 17, 0, 7); ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.moveTo(nx, ny - 13); ctx.lineTo(nx + 6, ny + 7); ctx.lineTo(nx, ny + 3); ctx.lineTo(nx - 6, ny + 7); ctx.closePath(); ctx.fill();
    ctx.font = 'bold 10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('N', nx, ny + 16);
  }
}

function along(g, u) {
  let L = 0; for (let i = 1; i < g.length; i++) L += Math.hypot(g[i][0] - g[i - 1][0], g[i][1] - g[i - 1][1]);
  let target = u * L, acc = 0;
  for (let i = 1; i < g.length; i++) {
    const d = Math.hypot(g[i][0] - g[i - 1][0], g[i][1] - g[i - 1][1]);
    if (acc + d >= target) { const k = d ? (target - acc) / d : 0; return [g[i - 1][0] + k * (g[i][0] - g[i - 1][0]), g[i - 1][1] + k * (g[i][1] - g[i - 1][1])]; }
    acc += d;
  }
  return g[g.length - 1];
}
const titleCaseShort = s => s.toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase());
