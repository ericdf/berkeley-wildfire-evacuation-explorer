#!/usr/bin/env node
// One command for step 2 of the egress plan (secondary egress candidates):
//   node tools/egress-all.mjs [--refresh] [--top 10] [--seeds 5]
// 1. the City's "2nd Route Out" layer, if not already downloaded (tools/fetch-city-layers.mjs)
// 2. the access analysis (tools/access-constraints.mjs: data/model/access-constraints.json, docs/access-constraints.md)
// 3. candidates, screening, access effect and costs (tools/egress-candidates.mjs)
// 4. simulator runs with and without each tested link (tools/egress-sim.mjs, about 15–30 min on 8 cores)
// 5. the report (tools/egress-report.mjs: docs/egress-candidates.md)
// Rerun after any network rebuild: area ids, and the candidate ids built from them, change with the network.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const pass = k => argv.includes(k) ? [k, ...(k === '--refresh' ? [] : [argv[argv.indexOf(k) + 1]])] : [];
const run = (f, args = []) => { console.log(`\n$ node ${f} ${args.join(' ')}`); execFileSync(process.execPath, [path.join(R, f), ...args], { stdio: 'inherit', cwd: R }); };
if (argv.includes('--refresh') || !fs.existsSync(path.join(R, 'data/raw/city/imagined_road_panoramic.geojson'))) run('tools/fetch-city-layers.mjs', ['imagined_road_panoramic']);
run('tools/access-constraints.mjs');
run('tools/egress-candidates.mjs', pass('--refresh'));
run('tools/egress-sim.mjs', [...pass('--top'), ...pass('--seeds')]);
run('tools/egress-report.mjs');
