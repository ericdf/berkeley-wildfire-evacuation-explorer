#!/usr/bin/env node
// One command for the street-widening screening (egress plan step 2b): ranking and screening
// (web requests for parcels, buildings and ACS), the simulator runs, and the report.
//
//   node tools/widening-all.mjs [--top 10] [--seeds 5] [--workers N]     about 20–30 min on 8 cores
//
// Rerun after every network rebuild and after tools/access-constraints.mjs.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pass = process.argv.slice(2);
for (const [tool, args] of [['tools/widening.mjs', []], ['tools/widening-sim.mjs', pass], ['tools/widening-report.mjs', []]]) {
  console.log(`\n== node ${tool} ${args.join(' ')}`);
  const r = spawnSync(process.execPath, [path.join(R, tool), ...args], { stdio: 'inherit', cwd: R });
  if (r.status !== 0) process.exit(r.status ?? 1);
}
