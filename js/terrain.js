// Shaded-relief background and contour lines from the DEM. Bare-earth terrain only:
// it does not show buildings, stairs or retaining walls.

export function makeTerrainCanvas(dem, Z) {
  const W = dem.width, H = dem.height, res = dem.resolution;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(W, H), px = img.data;
  const z = (r, c) => { r = Math.max(0, Math.min(H - 1, r)); c = Math.max(0, Math.min(W - 1, c)); const v = Z[r * W + c]; return v === -32768 ? 0 : v / 10; };
  const azMath = (360 - 315 + 90) * Math.PI / 180, alt = 45 * Math.PI / 180; // light from the north-west
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const i = r * W + c, o = i * 4, v = Z[i];
    if (v === -32768 || v <= 5) { // open water or no data
      px[o] = 196; px[o + 1] = 214; px[o + 2] = 226; px[o + 3] = 255;
      if (v !== -32768 && v > 0) { px[o] = 214; px[o + 1] = 222; px[o + 2] = 224; } // shoreline flats
      continue;
    }
    const dzdx = (z(r, c + 1) - z(r, c - 1)) / (2 * res), dzdy = (z(r + 1, c) - z(r - 1, c)) / (2 * res);
    const slope = Math.atan(Math.hypot(dzdx, dzdy)), aspect = Math.atan2(dzdy, -dzdx);
    const hs = Math.max(0, Math.cos(alt) * Math.cos(slope) + Math.sin(alt) * Math.sin(slope) * Math.cos(azMath - aspect));
    const e = v / 10;
    const [hr, hg, hb] = hypso(e);
    const k = 0.55 + 0.6 * hs;
    px[o] = Math.min(255, hr * k); px[o + 1] = Math.min(255, hg * k); px[o + 2] = Math.min(255, hb * k); px[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

// Muted hypsometric tint: flats warm grey, hills sage, ridge tan.
const STOPS = [[0, [232, 228, 218]], [60, [226, 226, 212]], [150, [214, 222, 200]], [300, [210, 214, 188]], [450, [222, 210, 186]], [600, [232, 222, 206]]];
function hypso(e) {
  for (let i = 1; i < STOPS.length; i++) if (e <= STOPS[i][0]) {
    const [e0, c0] = STOPS[i - 1], [e1, c1] = STOPS[i], u = (e - e0) / (e1 - e0);
    return c0.map((v, k) => v + u * (c1[k] - v));
  }
  return STOPS[STOPS.length - 1][1];
}

// Marching-squares contour segments in local metres, every `interval` metres.
export function makeContours(dem, Z, interval = 20, step = 3) {
  const W = dem.width, H = dem.height, res = dem.resolution, ymax = dem.ymax - dem.ymin;
  const cols = Math.floor((W - 1) / step), rows = Math.floor((H - 1) / step);
  const zv = (r, c) => { const v = Z[Math.min(H - 1, r * step) * W + Math.min(W - 1, c * step)]; return v === -32768 ? NaN : v / 10; };
  const X = c => (c * step + 0.5) * res, Y = r => ymax - (r * step + 0.5) * res;
  const levels = new Map();
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const a = zv(r, c), b = zv(r, c + 1), d = zv(r + 1, c), e = zv(r + 1, c + 1);
    if ([a, b, d, e].some(Number.isNaN)) continue;
    const lo = Math.min(a, b, d, e), hi = Math.max(a, b, d, e);
    for (let L = Math.ceil(lo / interval) * interval; L <= hi; L += interval) {
      if (L <= 5) continue;
      const pts = [];
      const edge = (z1, z2, x1, y1, x2, y2) => { if ((z1 < L) !== (z2 < L)) { const u = (L - z1) / (z2 - z1); pts.push(x1 + u * (x2 - x1), y1 + u * (y2 - y1)); } };
      edge(a, b, X(c), Y(r), X(c + 1), Y(r));
      edge(b, e, X(c + 1), Y(r), X(c + 1), Y(r + 1));
      edge(e, d, X(c + 1), Y(r + 1), X(c), Y(r + 1));
      edge(d, a, X(c), Y(r + 1), X(c), Y(r));
      if (pts.length >= 4) { if (!levels.has(L)) levels.set(L, []); const arr = levels.get(L); arr.push(pts[0], pts[1], pts[2], pts[3]); if (pts.length === 8) arr.push(pts[4], pts[5], pts[6], pts[7]); }
    }
  }
  return [...levels.entries()].map(([L, arr]) => ({ level: L, segs: Float32Array.from(arr) }));
}
