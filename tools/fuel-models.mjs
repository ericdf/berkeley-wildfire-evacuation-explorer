// Scott and Burgan (2005) 40 standard fire behavior fuel models and Rothermel's surface spread rate,
// used to give each LANDFIRE FBFM40 class a relative spread factor (tools/fetch-fuel.mjs).
//
// Parameters: Scott, J. H.; Burgan, R. E. 2005. Standard fire behavior fuel models: a comprehensive
// set for use with Rothermel's surface fire spread model. Gen. Tech. Rep. RMRS-GTR-153, Table 7
// (p. 18): loads (t/ac) for 1-h, 10-h, 100-h, live herbaceous and live woody; SAV (1/ft) for dead
// 1-h, live herbaceous and live woody; depth (ft); dead extinction moisture (%); heat (BTU/lb).
// Constants for the whole set (p. 17): 10-h SAV 109, 100-h SAV 30, total mineral 5.55%, effective
// mineral 1.00%, particle density 32 lb/ft3. Dynamic models move part of the herbaceous load to a
// dead herbaceous class with the herbaceous SAV (p. 9).
//
// Spread model: Rothermel (1972, INT-115) as in Scott and Burgan's charts, with fuel classes weighted
// by surface area (Rothermel's original weighting; BehavePlus also uses size-class subgroups for net
// load, which changes results by a few percent). Moisture scenario D2L2 (p. 17): dead 1-h 6%,
// 10-h 7%, 100-h 8%, live herbaceous 60% (two-thirds cured), live woody 90%. No slope.

export const MODELS = {
  // code: [name, 1h, 10h, 100h, herb, woody, dynamic, sav1h, savHerb, savWoody, depth, mxDead, heat]
  101: ['GR1', 0.10, 0.00, 0.00, 0.30, 0.00, 1, 2200, 2000, 9999, 0.4, 15, 8000],
  102: ['GR2', 0.10, 0.00, 0.00, 1.00, 0.00, 1, 2000, 1800, 9999, 1.0, 15, 8000],
  103: ['GR3', 0.10, 0.40, 0.00, 1.50, 0.00, 1, 1500, 1300, 9999, 2.0, 30, 8000],
  104: ['GR4', 0.25, 0.00, 0.00, 1.90, 0.00, 1, 2000, 1800, 9999, 2.0, 15, 8000],
  105: ['GR5', 0.40, 0.00, 0.00, 2.50, 0.00, 1, 1800, 1600, 9999, 1.5, 40, 8000],
  106: ['GR6', 0.10, 0.00, 0.00, 3.40, 0.00, 1, 2200, 2000, 9999, 1.5, 40, 9000],
  107: ['GR7', 1.00, 0.00, 0.00, 5.40, 0.00, 1, 2000, 1800, 9999, 3.0, 15, 8000],
  108: ['GR8', 0.50, 1.00, 0.00, 7.30, 0.00, 1, 1500, 1300, 9999, 4.0, 30, 8000],
  109: ['GR9', 1.00, 1.00, 0.00, 9.00, 0.00, 1, 1800, 1600, 9999, 5.0, 40, 8000],
  121: ['GS1', 0.20, 0.00, 0.00, 0.50, 0.65, 1, 2000, 1800, 1800, 0.9, 15, 8000],
  122: ['GS2', 0.50, 0.50, 0.00, 0.60, 1.00, 1, 2000, 1800, 1800, 1.5, 15, 8000],
  123: ['GS3', 0.30, 0.25, 0.00, 1.45, 1.25, 1, 1800, 1600, 1600, 1.8, 40, 8000],
  124: ['GS4', 1.90, 0.30, 0.10, 3.40, 7.10, 1, 1800, 1600, 1600, 2.1, 40, 8000],
  141: ['SH1', 0.25, 0.25, 0.00, 0.15, 1.30, 1, 2000, 1800, 1600, 1.0, 15, 8000],
  142: ['SH2', 1.35, 2.40, 0.75, 0.00, 3.85, 0, 2000, 9999, 1600, 1.0, 15, 8000],
  143: ['SH3', 0.45, 3.00, 0.00, 0.00, 6.20, 0, 1600, 9999, 1400, 2.4, 40, 8000],
  144: ['SH4', 0.85, 1.15, 0.20, 0.00, 2.55, 0, 2000, 1800, 1600, 3.0, 30, 8000],
  145: ['SH5', 3.60, 2.10, 0.00, 0.00, 2.90, 0, 750, 9999, 1600, 6.0, 15, 8000],
  146: ['SH6', 2.90, 1.45, 0.00, 0.00, 1.40, 0, 750, 9999, 1600, 2.0, 30, 8000],
  147: ['SH7', 3.50, 5.30, 2.20, 0.00, 3.40, 0, 750, 9999, 1600, 6.0, 15, 8000],
  148: ['SH8', 2.05, 3.40, 0.85, 0.00, 4.35, 0, 750, 9999, 1600, 3.0, 40, 8000],
  149: ['SH9', 4.50, 2.45, 0.00, 1.55, 7.00, 1, 750, 1800, 1500, 4.4, 40, 8000],
  161: ['TU1', 0.20, 0.90, 1.50, 0.20, 0.90, 1, 2000, 1800, 1600, 0.6, 20, 8000],
  162: ['TU2', 0.95, 1.80, 1.25, 0.00, 0.20, 0, 2000, 9999, 1600, 1.0, 30, 8000],
  163: ['TU3', 1.10, 0.15, 0.25, 0.65, 1.10, 1, 1800, 1600, 1400, 1.3, 30, 8000],
  164: ['TU4', 4.50, 0.00, 0.00, 0.00, 2.00, 0, 2300, 9999, 2000, 0.5, 12, 8000],
  165: ['TU5', 4.00, 4.00, 3.00, 0.00, 3.00, 0, 1500, 9999, 750, 1.0, 25, 8000],
  181: ['TL1', 1.00, 2.20, 3.60, 0.00, 0.00, 0, 2000, 9999, 9999, 0.2, 30, 8000],
  182: ['TL2', 1.40, 2.30, 2.20, 0.00, 0.00, 0, 2000, 9999, 9999, 0.2, 25, 8000],
  183: ['TL3', 0.50, 2.20, 2.80, 0.00, 0.00, 0, 2000, 9999, 9999, 0.3, 20, 8000],
  184: ['TL4', 0.50, 1.50, 4.20, 0.00, 0.00, 0, 2000, 9999, 9999, 0.4, 25, 8000],
  185: ['TL5', 1.15, 2.50, 4.40, 0.00, 0.00, 0, 2000, 9999, 1600, 0.6, 25, 8000],
  186: ['TL6', 2.40, 1.20, 1.20, 0.00, 0.00, 0, 2000, 9999, 9999, 0.3, 25, 8000],
  187: ['TL7', 0.30, 1.40, 8.10, 0.00, 0.00, 0, 2000, 9999, 9999, 0.4, 25, 8000],
  188: ['TL8', 5.80, 1.40, 1.10, 0.00, 0.00, 0, 1800, 9999, 9999, 0.3, 35, 8000],
  189: ['TL9', 6.65, 3.30, 4.15, 0.00, 0.00, 0, 1800, 9999, 1600, 0.6, 35, 8000],
  201: ['SB1', 1.50, 3.00, 11.00, 0.00, 0.00, 0, 2000, 9999, 9999, 1.0, 25, 8000],
  202: ['SB2', 4.50, 4.25, 4.00, 0.00, 0.00, 0, 2000, 9999, 9999, 1.0, 25, 8000],
  203: ['SB3', 5.50, 2.75, 3.00, 0.00, 0.00, 0, 2000, 9999, 9999, 1.2, 25, 8000],
  204: ['SB4', 5.25, 3.50, 5.25, 0.00, 0.00, 0, 2000, 9999, 9999, 2.7, 25, 8000],
};
// Nonburnable codes (Scott and Burgan p. 12): NB1 urban or suburban, NB2 snow or ice, NB3 agriculture,
// NB8 open water, NB9 bare ground. LANDFIRE uses -9999 for no data.
export const NONBURNABLE = { 91: 'NB1', 92: 'NB2', 93: 'NB3', 98: 'NB8', 99: 'NB9' };

export const D2L2 = { m1: 0.06, m10: 0.07, m100: 0.08, mHerb: 0.60, mWoody: 0.90 };
const TAC = 2000 / 43560; // t/ac → lb/ft²

// Particles of a model after the dynamic herbaceous transfer: { dead: [...], live: [...] }, each { w, s, m }.
export function particles(p, M = D2L2) {
  const [, l1, l10, l100, lh, lw, dyn, s1, sh, sw] = p;
  const cured = dyn ? Math.min(1, Math.max(0, (1.20 - M.mHerb) / 0.90)) : 0; // fraction of herb load moved to dead
  const dead = [{ w: l1 * TAC, s: s1, m: M.m1 }, { w: l10 * TAC, s: 109, m: M.m10 }, { w: l100 * TAC, s: 30, m: M.m100 },
    { w: lh * cured * TAC, s: sh, m: M.m1 }];
  const live = [{ w: lh * (1 - cured) * TAC, s: sh, m: M.mHerb }, { w: lw * TAC, s: sw, m: M.mWoody }];
  return { dead: dead.filter(x => x.w > 0), live: live.filter(x => x.w > 0) };
}

// Rothermel (1972) head-fire rate of spread, ft/min, on flat ground at midflame wind U (mi/h).
export function rothermel(p, Umph, M = D2L2) {
  const depth = p[10], mxDead = p[11] / 100, h = p[12], rhoP = 32, St = 0.0555, Se = 0.01;
  const { dead, live } = particles(p, M);
  const all = [...dead, ...live];
  const area = x => x.s * x.w / rhoP;
  const Ad = dead.reduce((a, x) => a + area(x), 0), Al = live.reduce((a, x) => a + area(x), 0), At = Ad + Al;
  const cats = [[dead, Ad], [live, Al]].filter(([, A]) => A > 0).map(([ps, A]) => {
    const f = ps.map(x => area(x) / A);
    return { ps, f, fi: A / At, sigma: ps.reduce((a, x, k) => a + f[k] * x.s, 0), wn: ps.reduce((a, x, k) => a + f[k] * x.w * (1 - St), 0), mf: ps.reduce((a, x, k) => a + f[k] * x.m, 0) };
  });
  const sigma = cats.reduce((a, c) => a + c.fi * c.sigma, 0);
  const w0 = all.reduce((a, x) => a + x.w, 0), rhoB = w0 / depth, beta = rhoB / rhoP;
  const betaOp = 3.348 * sigma ** -0.8189, rel = beta / betaOp;
  const A = 133 * sigma ** -0.7913, gMax = sigma ** 1.5 / (495 + 0.0594 * sigma ** 1.5);
  const gamma = gMax * rel ** A * Math.exp(A * (1 - rel));
  // live extinction moisture (Albini 1976)
  const ed = dead.reduce((a, x) => a + x.w * Math.exp(-138 / x.s), 0), el = live.reduce((a, x) => a + x.w * Math.exp(-500 / x.s), 0);
  const mfDeadFine = ed ? dead.reduce((a, x) => a + x.w * Math.exp(-138 / x.s) * x.m, 0) / ed : 0;
  const mxLive = el ? Math.max(mxDead, 2.9 * (ed / el) * (1 - mfDeadFine / mxDead) - 0.226) : mxDead;
  const etaS = Math.min(1, 0.174 * Se ** -0.19);
  const etaM = (mf, mx) => { const r = Math.min(1, mf / mx); return Math.max(0, 1 - 2.59 * r + 5.11 * r * r - 3.52 * r ** 3); };
  const IR = gamma * cats.reduce((a, c) => a + c.wn * h * etaM(c.mf, c.ps === dead ? mxDead : mxLive) * etaS, 0); // BTU/ft²/min
  const xi = Math.exp((0.792 + 0.681 * sigma ** 0.5) * (beta + 0.1)) / (192 + 0.2595 * sigma);
  const C = 7.47 * Math.exp(-0.133 * sigma ** 0.55), B = 0.02526 * sigma ** 0.54, E = 0.715 * Math.exp(-3.59e-4 * sigma);
  const U = Math.min(Umph * 88, 0.9 * IR); // ft/min, with Rothermel's wind limit
  const phiW = C * U ** B * rel ** -E;
  const sink = rhoB * cats.reduce((a, c) => a + c.fi * c.ps.reduce((b, x, k) => b + c.f[k] * Math.exp(-138 / x.s) * (250 + 1116 * x.m), 0), 0);
  return { ros: IR * xi * (1 + phiW) / sink, sigma, beta, IR };
}

// Anderson (1982) fuel models 1, 2, 8 and 10 in the same layout, for Scott and Burgan's crosswalk check (pp. 13–15).
export const ANDERSON = {
  1: ['FM1', 0.74, 0, 0, 0, 0, 0, 3500, 9999, 9999, 1.0, 12, 8000],
  2: ['FM2', 2.0, 1.0, 0.5, 0.5, 0, 0, 3000, 1500, 9999, 1.0, 15, 8000],
  8: ['FM8', 1.5, 1.0, 2.5, 0, 0, 0, 2000, 9999, 9999, 0.2, 30, 8000],
  10: ['FM10', 3.01, 2.0, 5.01, 0, 2.0, 0, 2000, 9999, 1500, 1.0, 25, 8000],
};
