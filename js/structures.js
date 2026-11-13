// Structures lost where the fire front reached them, and what home hardening and Zone 0 change (step 3e option A,
// SOURCE_NOTES PH23; hardening and Zone 0, PH29–PH32). Loss only: the fire, its embers, orders and traffic are the
// same with and without hardening or Zone 0, because the fire model does not spread from building to building.
//
// For each 30 m cell the front has reached, the City footprints in Fire Zones 2–3 count by the gap to their nearest
// neighbor (data/model/structures.json: under 25 ft, 25–50 ft, 50 ft or more). Under 50 ft a structure is lost with the
// loss probability lossIfFront.within18m, at 50 ft or more beyond18m (assumption ranges, Knapp et al. 2021; PH23).
// Hardening and Zone 0 cut that probability by a share (data/assumptions.json structures.mitigation, assumption ranges
// low / central / high, PH32). Under 25 ft the cut depends on whether the home's close neighbors take part (NIST TN 2205:
// "limited or no effect" next to a burning neighbor; Zamanialaei et al. 2025: little difference for one home, substantial
// when community-wide): alone + (neighbors − alone) × the share of its neighbors taking part (model rule).
//
// Plan keys (none in DEFAULT_PLAN, so plans without them are unchanged): hardenShare and zone0Share, the share of
// structures taking part (0–1), and hardenMode and zone0Mode: 'scattered' (each structure independently, so a taking-part
// home's neighbors take part at the same share) or 'blocks' (whole blocks, so its neighbors all take part).
// Expected values, no draw: the same for every seed and plan with the same keys.

const MIDPOINT = r => (r[0] + r[1]) / 2;

// Share cut in loss probability for one lever, by band, at one effect level (0 low, 1 central, 2 high).
function cuts(M, mode, share, k) {
  if (!M || !(share > 0)) return { dense: 0, open: 0 };
  const alone = M.dense.alone[k], nb = M.dense.neighbors[k];
  const q = mode === 'blocks' ? 1 : share; // share of a taking-part home's close neighbors that also take part
  return { dense: share * (alone + (nb - alone) * q), open: share * M.open[k] };
}

// The lever settings of a plan, or null when the plan sets neither.
export function mitigationOf(plan) {
  const h = +(plan?.hardenShare || 0), z = +(plan?.zone0Share || 0);
  return h > 0 || z > 0 ? { hardenShare: h, hardenMode: plan.hardenMode || 'scattered', zone0Share: z, zone0Mode: plan.zone0Mode || 'scattered' } : null;
}

// Structures lost at time tSec (seconds) for a run's fire. Returns { reached, low, central, high } (structures), or null
// without the structure file or loss probabilities. low pairs the low loss probability with the high cut, high the high
// loss probability with the low cut; central uses the midpoints and the central cut.
export function structureLosses(data, fire, tSec, plan) {
  const st = data.structures, LF = data.A.structures?.lossIfFront, MM = data.A.structures?.mitigation;
  if (!st || !fire || !LF || st.meta.W !== fire.W || st.meta.H !== fire.H) return null;
  const m = mitigationOf(plan);
  // per effect level: [low loss uses high cut (k=2), central (1), high loss uses low cut (k=0)]
  const lv = [2, 1, 0].map(k => {
    const h = m ? cuts(MM?.hardening, m.hardenMode, m.hardenShare, k) : { dense: 0, open: 0 };
    const z = m ? cuts(MM?.zone0, m.zone0Mode, m.zone0Share, k) : { dense: 0, open: 0 };
    return { dense: (1 - h.dense) * (1 - z.dense), open: (1 - h.open) * (1 - z.open) }; // remaining share of the loss probability
  });
  const near = [LF.within18m[0], MIDPOINT(LF.within18m), LF.within18m[1]], far = [LF.beyond18m[0], MIDPOINT(LF.beyond18m), LF.beyond18m[1]];
  let reached = 0; const lost = [0, 0, 0];
  for (const [c, n, b25, b50, bFar] of st.structures) {
    if (!(fire.arrival[c] * 60 <= tSec)) continue;
    reached += n;
    // written so that with no mitigation (factors 1) it is exactly (b25 + b50) × near + bFar × far, the sum before PH32
    for (let i = 0; i < 3; i++) lost[i] += (b25 * lv[i].dense + b50 * lv[i].open) * near[i] + bFar * lv[i].open * far[i];
  }
  return { reached, low: lost[0], central: lost[1], high: lost[2] };
}
