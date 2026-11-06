// Robustness labels for headline findings (product brief docs/product-brief-spread-access.md, "Uncertainty and
// robustness"; method and thresholds in SOURCE_NOTES SA4–SA6). Every label is computed from the runs a finding
// already rests on, and always names those runs and their count. A share of model runs is not a probability:
// no label or sentence built here states one.
//
// Three labels:
//   consistent  the finding appears in every or nearly every tested run (at least CONSISTENT_SHARE of them)
//   sensitive   it depends mainly on an uncertain setting with a low/central/high range: its share of runs
//               differs by at least SENSITIVE_GAP between the setting's levels (for runs grouped by severity,
//               the fire's spread rate), or an alternative assumption moves the value by at least ASSUMPTION_GAP
//   mixed       everything else: it appears in some runs and not in others, or changes direction

export const CONSISTENT_SHARE = 0.9; // 14 of 15, 5 of 5, 54 of 60 (model rule)
export const SENSITIVE_GAP = 0.6;    // e.g. 5 of 5 runs at high severity against 2 of 5 or fewer at low (model rule)
export const ASSUMPTION_GAP = 0.25;  // an alternative assumption moves the value by 25% or more (model rule)

export const LABEL = {
  consistent: 'Consistent in the tested scenarios',
  mixed: 'Mixed across scenarios',
  sensitive: 'Sensitive to assumptions',
};
export const SEV_WORD = { low: 'low', central: 'medium', high: 'high' };

const atLeast = (k, n) => k >= Math.ceil(CONSISTENT_SHARE * n - 1e-9);

// A finding that is present or absent in each run. byLevel: { low: [k, n], central: [k, n], high: [k, n] }
// (any level keys; severity by default). Returns { label, k, n, levels, present } where present says whether
// the consistent finding is that it appears (true) or that it does not (false).
export function presence(byLevel) {
  const lv = Object.entries(byLevel).filter(([, [, n]]) => n > 0);
  const k = lv.reduce((s, [, [a]]) => s + a, 0), n = lv.reduce((s, [, [, b]]) => s + b, 0);
  if (!n) return { label: null, k, n, levels: byLevel };
  if (atLeast(k, n)) return { label: 'consistent', k, n, levels: byLevel, present: true };
  if (atLeast(n - k, n)) return { label: 'consistent', k, n, levels: byLevel, present: false };
  const shares = lv.map(([, [a, b]]) => a / b);
  const label = lv.length > 1 && Math.max(...shares) - Math.min(...shares) >= SENSITIVE_GAP ? 'sensitive' : 'mixed';
  return { label, k, n, levels: byLevel };
}

// A paired comparison (Plan B against Plan A on the same fire, households and seed), pass by pass:
// { better, worse, same, n } overall and per level. Lower is better unless the caller swapped the pairs.
export function direction(byLevel) {
  const lv = Object.entries(byLevel).filter(([, t]) => t.n > 0);
  const sum = key => lv.reduce((s, [, t]) => s + t[key], 0);
  const better = sum('better'), worse = sum('worse'), n = sum('n'), same = n - better - worse;
  const out = { better, worse, same, n, levels: byLevel };
  if (!n) return { ...out, label: null };
  if (atLeast(better, n) && worse === 0) return { ...out, label: 'consistent', dir: 'better' };
  if (atLeast(worse, n) && better === 0) return { ...out, label: 'consistent', dir: 'worse' };
  if (atLeast(same, n)) return { ...out, label: 'consistent', dir: 'same' };
  const net = t => (t.better - t.worse) / t.n, shares = lv.map(([, t]) => net(t));
  const label = lv.length > 1 && Math.max(...shares) - Math.min(...shares) >= SENSITIVE_GAP ? 'sensitive' : 'mixed';
  return { ...out, label, dir: better > worse ? 'better' : worse > better ? 'worse' : 'mixed' };
}

// A value under a central assumption and an alternative one (for example the night parking rule).
export function assumption(central, alt) {
  if (central == null || alt == null) return null;
  const base = Math.max(Math.abs(central), Math.abs(alt), 1);
  return Math.abs(central - alt) / base >= ASSUMPTION_GAP ? 'sensitive' : 'consistent';
}

// Plain-language level breakdown: "low 1 of 5, medium 4 of 5, high 5 of 5".
export const levelText = (byLevel, names = SEV_WORD) => Object.entries(byLevel).filter(([, v]) => (Array.isArray(v) ? v[1] : v.n) > 0)
  .map(([k, v]) => Array.isArray(v) ? `${names[k] || k} ${v[0]} of ${v[1]}` : `${names[k] || k}: better in ${v.better}, worse in ${v.worse} of ${v.n}`).join('; ');

// HTML chip for a label, with the tested runs in its tooltip.
export function chip(label, tip = '') {
  if (!label) return '';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<span class="robust r-${label}"${tip ? ` title="${esc(tip)}"` : ''}>${LABEL[label]}${tip ? ' ⓘ' : ''}</span>`;
}
