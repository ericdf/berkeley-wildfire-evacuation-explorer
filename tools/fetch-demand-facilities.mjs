// Licensed facilities and schools by evacuation zone, and HHS emPOWER counts by ZIP, for the
// reported assisted-evacuation figures (SOURCE_NOTES DM10–DM16). Downloads go to a temporary
// directory and are deleted; only zone aggregates (count and licensed capacity or enrollment by
// type) are written, to data/raw/facilities/facilities-by-zone.json, and emPOWER ZIP counts to
// data/raw/hhs/empower-zip.json. No facility names or addresses are stored.
//   node tools/fetch-demand-facilities.mjs [--keep <dir>]   (--keep: download into <dir> and keep it)
//
// Sources (all public):
//   CDSS Community Care Licensing facilities, ArcGIS layer CDSS_CCL_Facilities (geocoded, current):
//     licensed (STATUS 3) residential care for the elderly, adult residential and social
//     rehabilitation facilities, and child care centers (day care, infant, school-age). Resource
//     family homes and family child care homes are private homes and are left out.
//   CDPH Licensed and Certified Healthcare Facility Locations (data.chhs.ca.gov): open skilled nursing,
//     intermediate care (ICF-DD and similar) and congregate living facilities, and hospitals (general
//     acute and acute psychiatric), with licensed beds (CAPACITY).
//   CDE public school directory (pubschls.txt, active schools with coordinates) joined by CDS code to
//     CDE Census Day enrollment 2025-26 (cdenroll2526.txt, school level, all students).
//   NCES EDGE private school locations 2023-24 (geocoded) joined by name to CDE 2025-26 private school
//     enrollment (privateschooldata2526.xlsx, schools with 6 or more students); unmatched schools are
//     counted with enrollment unknown.
//   HHS emPOWER ZIP-level layer (HHS_emPOWER_REST_Service_Public): Medicare beneficiaries and those
//     who rely on electricity-dependent durable medical equipment, ZIPs touching the model area.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { zoneLocator, ROOT } from './zones.mjs';
const UA = 'berkeley-wildfire-simulator/0.1';
const ENV = '-122.334,37.836,-122.206,37.912'; // the 2020 block query envelope (data/raw/census/retrieved.txt)
const [W, S, E, N] = ENV.split(',').map(Number);
const inEnv = (lon, lat) => lon >= W && lon <= E && lat >= S && lat <= N;
const keep = process.argv.indexOf('--keep');
const DIR = keep > 0 ? path.resolve(process.argv[keep + 1]) : fs.mkdtempSync(path.join(os.tmpdir(), 'wfs-fac-'));
fs.mkdirSync(DIR, { recursive: true });
const TODAY = new Date().toISOString().slice(0, 10);

async function download(url, name) {
  const f = path.join(DIR, name);
  if (fs.existsSync(f) && keep > 0) return f;
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(300000), redirect: 'follow' });
      if (r.ok) { fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); return f; }
      console.warn(`HTTP ${r.status} ${url}`);
    } catch (e) { console.warn(`${e.name} ${url}`); }
    await new Promise(res => setTimeout(res, 3000 * (i + 1)));
  }
  throw new Error(`failed: ${url}`);
}
const arcgis = (layer, extra = {}) => `${layer}/query?` + new URLSearchParams({ where: '1=1', geometry: ENV, geometryType: 'esriGeometryEnvelope', inSR: '4326',
  spatialRel: 'esriSpatialRelIntersects', outFields: '*', outSR: '4326', resultRecordCount: '5000', f: 'json', ...extra });
function csv(text, delim = ',') { // small RFC 4180 reader → array of objects
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const h = rows.shift();
  return rows.filter(r => r.length > 1).map(r => Object.fromEntries(h.map((k, i) => [k.trim(), r[i]])));
}
const tsv = text => text.split(/\r?\n/).filter(Boolean).map(l => l.split('\t'));

const { zones, locate } = zoneLocator();
const agg = {}; // zone -> type -> { n, capacity }
const notes = {};
const outside = {}; // type -> facilities in the envelope but in no zone
function add(type, lon, lat, cap, unit) {
  const { id } = locate(lon, lat);
  if (!id) { outside[type] = (outside[type] || 0) + 1; return; }
  const t = ((agg[id] ||= {})[type] ||= { n: 0, [unit]: 0 });
  t.n++; if (cap == null) t.unknown = (t.unknown || 0) + 1; else t[unit] += cap;
}

// ---- CDSS Community Care Licensing ----
const CCL = 'https://services.arcgis.com/XLPEppdz2H9dOiqp/arcgis/rest/services/CDSS_CCL_Facilities/FeatureServer/0';
{
  const j = JSON.parse(fs.readFileSync(await download(arcgis(CCL), 'ccl.json'), 'utf8'));
  const meta = JSON.parse(fs.readFileSync(await download(`${CCL}?f=json`, 'ccl-meta.json'), 'utf8'));
  const TYPE = d => /RESIDENTIAL-ELDERLY/.test(d) ? 'rcfe' : /ADULT RESIDENTIAL|SOCIAL REHAB/.test(d) ? 'adultResidential'
    : /DAY CARE CENTER|INFANT CENTER|SCHOOL-AGE DC|SINGLE CHILD CARE/.test(d) ? 'childCareCenter' : null;
  let used = 0, skipped = {};
  for (const f of j.features) {
    const a = f.attributes, d = String(a.FAC_TYPE_DESC).trim(), t = TYPE(d);
    if (!t || a.STATUS !== 3) { const k = `${d} (status ${a.STATUS})`; skipped[k] = (skipped[k] || 0) + 1; continue; }
    add(t, +a.FAC_LONGITUDE, +a.FAC_LATITUDE, a.CAPACITY ?? null, 'capacity'); used++;
  }
  notes.ccl = { url: CCL, retrieved: TODAY, dataLastEdit: new Date(meta.editingInfo?.dataLastEditDate).toISOString().slice(0, 10), inEnvelope: j.features.length, used, skipped,
    rule: 'STATUS 3 (licensed; every facility it shares with the CCL CSV of 2025-05-25 is LICENSED there). Capacity = licensed capacity.' };
}
// ---- CDPH healthcare facilities ----
{
  const url = 'https://data.chhs.ca.gov/dataset/3b5b80e8-6b8d-4715-b3c0-2699af6e72e5/resource/f0ae5731-fef8-417f-839d-54a0ed3a126e/download/health_facility_locations.csv';
  const rows = csv(fs.readFileSync(await download(url, 'cdph.csv'), 'latin1'));
  const TYPE = c => /^SNF/.test(c) ? 'skilledNursing' : /^ICF|^CLHF/.test(c) ? 'intermediateCare' : /^GACH|^APH/.test(c) ? 'hospital' : null;
  let used = 0, dataDate = null;
  for (const x of rows) {
    const lon = +x.LONGITUDE, lat = +x.LATITUDE, t = TYPE(x.FAC_TYPE_CODE || '');
    if (!t || !inEnv(lon, lat) || x.FAC_STATUS_TYPE_CODE !== 'OPEN') continue;
    add(t, lon, lat, x.CAPACITY === '' ? null : +x.CAPACITY, 'beds'); used++; dataDate = x.DATA_DATE;
  }
  notes.cdph = { url, retrieved: TODAY, dataDate, used, rule: 'FAC_STATUS_TYPE_CODE OPEN; SNF = skilled nursing; ICF* and CLHF = intermediate care and congregate living; GACH and APH = hospitals. Beds = CAPACITY (licensed beds). A hospital listed twice at one address with 0 beds adds a facility and no beds.' };
}
// ---- CDE public schools ----
{
  const dirUrl = 'https://www.cde.ca.gov/schooldirectory/report?rid=dl1&tp=txt';
  const enrUrl = 'https://www3.cde.ca.gov/demo-downloads/census/cdenroll2526.txt';
  const dir = tsv(fs.readFileSync(await download(dirUrl, 'pubschls.txt'), 'latin1')), h = dir.shift();
  const col = n => h.indexOf(n);
  const enr = new Map();
  for (const r of tsv(fs.readFileSync(await download(enrUrl, 'cdenroll2526.txt'), 'latin1')))
    if (r[1] === 'S' && r[9] === 'TA') enr.set(r[2] + r[3] + r[4], +r[10]);
  let used = 0, noEnr = 0;
  for (const r of dir) {
    if (r[col('StatusType')] !== 'Active') continue;
    const lon = +r[col('Longitude')], lat = +r[col('Latitude')];
    if (!inEnv(lon, lat) || /District Office|No Data/.test(r[col('School')])) continue;
    const e = enr.get(r[col('CDSCode')]); if (e == null) noEnr++;
    add('publicSchool', lon, lat, e ?? null, 'enrollment'); used++;
  }
  notes.publicSchools = { url: dirUrl, enrollment: enrUrl, retrieved: TODAY, used, withoutEnrollment: noEnr, rule: 'Active schools in the directory (district offices left out); enrollment = Census Day 2025-26 total (ReportingCategory TA). Adult education and preschool sites have no Census Day enrollment and count with enrollment unknown.' };
}
// ---- private schools ----
{
  const pssUrl = 'https://nces.ed.gov/opengis/rest/services/K12_School_Locations/EDGE_GEOCODE_PRIVATESCH_2324/MapServer/0';
  const xlsUrl = 'https://www.cde.ca.gov/ds/si/ps/documents/privateschooldata2526.xlsx';
  const pss = JSON.parse(fs.readFileSync(await download(arcgis(pssUrl), 'pss.json'), 'utf8')).features;
  const xf = await download(xlsUrl, 'private.xlsx');
  const ss = [...execFileSync('unzip', ['-p', xf, 'xl/sharedStrings.xml'], { maxBuffer: 1e8 }).toString().matchAll(/<si>(.*?)<\/si>/gs)]
    .map(m => [...m[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map(t => t[1]).join('').replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&quot;/g, '"'));
  const sheet = execFileSync('unzip', ['-p', xf, 'xl/worksheets/sheet1.xml'], { maxBuffer: 1e9 }).toString();
  const rows = [...sheet.matchAll(/<row[^>]*>(.*?)<\/row>/gs)].map(m => {
    const o = {};
    for (const c of m[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>(.*?)<\/c>)/gs)) {
      const v = (c[3] || '').match(/<v>(.*?)<\/v>/)?.[1] ?? (c[3] || '').match(/<t[^>]*>(.*?)<\/t>/)?.[1];
      o[c[1]] = /t="s"/.test(c[2]) ? ss[+v] : v;
    }
    return o;
  });
  const hi = rows.findIndex(r => r.A === 'CDS Code'), H = rows[hi], ci = n => Object.keys(H).find(k => H[k] === n);
  const DISTRICTS = new Set(['Berkeley Unified', 'Albany City Unified', 'Oakland Unified', 'West Contra Costa Unified', 'Emery Unified']);
  const norm = s => String(s).toLowerCase().replace(/&/g, ' and ').replace(/\bintl\b/g, 'international').replace(/\bsaint\b/g, 'st').replace(/[^a-z0-9 ]/g, '')
    .split(/\s+/).filter(w => w && !['the', 'school', 'of', 'and'].includes(w)).sort().join(' ');
  const cde = new Map();
  for (const r of rows.slice(hi + 1)) if (DISTRICTS.has(r[ci('Public School District')])) cde.set(norm(r[ci('School Name')]), +r[ci('Total Enrollment')]);
  let matched = 0, unmatched = 0;
  for (const f of pss) {
    const a = f.attributes, e = cde.get(norm(a.NAME));
    if (e == null) unmatched++; else matched++;
    add('privateSchool', a.LON, a.LAT, e ?? null, 'enrollment');
  }
  notes.privateSchools = { locations: pssUrl, enrollment: xlsUrl, retrieved: TODAY, located: pss.length, matched, unmatched,
    cdeSchoolsInDistricts: cde.size, rule: 'NCES 2023-24 locations in the envelope; enrollment from the CDE 2025-26 affidavit file where the normalized name matches exactly (Berkeley, Albany, Oakland, West Contra Costa and Emery districts); otherwise counted with enrollment unknown. Schools in the CDE file that NCES does not locate are not counted.' };
}
// ---- HHS emPOWER ----
{
  const url = 'https://services2.arcgis.com/ZQ4jTQn6k7VPXEwO/arcgis/rest/services/HHS_emPOWER_REST_Service_Public/FeatureServer/1';
  const j = JSON.parse(fs.readFileSync(await download(arcgis(url, { returnGeometry: 'false' }), 'empower.json'), 'utf8'));
  const meta = JSON.parse(fs.readFileSync(await download(`${url}?f=json`, 'empower-meta.json'), 'utf8'));
  const zips = Object.fromEntries(j.features.map(f => f.attributes).sort((a, b) => a.Zip_Code.localeCompare(b.Zip_Code)).map(a => [a.Zip_Code, {
    place: a.PA_NAME, county: a.COUNTY, medicareBeneficiaries: a.Medicare_Benes, electricityDependentDME: a.Power_Dependent_Devices_DME,
    dialysisFacility: a.Facility_ESRD_Dialysis_Any_DME, oxygen: a.O2_Services_Any_DME, homeHealth: a.Home_Health_Services_Any_DME,
    atHomeHospice: a.AtHome_Hospice_Any_DME, anyHealthcareService: a.Any_Healthcare_Srvc_Any_DME }]));
  fs.mkdirSync(path.join(ROOT, 'data/raw/hhs'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'data/raw/hhs/empower-zip.json'), JSON.stringify({ _meta: { url, retrieved: TODAY, userAgent: UA,
    dataLastEdit: new Date(meta.editingInfo?.dataLastEditDate).toISOString().slice(0, 10),
    query: `ZIP polygons intersecting the envelope ${ENV}`, category: 'sourced',
    note: 'Medicare beneficiaries (Medicare fee-for-service and Medicare Advantage, per HHS emPOWER) who rely on electricity-dependent durable medical equipment, by ZIP. HHS publishes 11 for any count from 1 to 10 (suppression), so 11 means "1 to 11". Not by evacuation zone: ZIPs cross zone lines, and some ZIPs (94516 Canyon, 94563 Orinda, 94803 El Sobrante) lie mostly outside the model area.' }, zips }, null, 1));
  notes.empower = { url, zips: Object.keys(zips).length };
}

fs.mkdirSync(path.join(ROOT, 'data/raw/facilities'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data/raw/facilities/facilities-by-zone.json'), JSON.stringify({
  _meta: { retrieved: TODAY, userAgent: UA, category: 'sourced (public licensing and school records), aggregated by evacuation zone (derived)', envelope: ENV,
    note: 'Counts and licensed capacity, beds or enrollment by type and Genasys zone. No names or addresses are kept. unknown = facilities in the count whose capacity or enrollment is not known.',
    outsideEveryZone: outside, sources: notes },
  zones: agg }, null, 1));
const tot = {}; for (const z of Object.values(agg)) for (const [t, v] of Object.entries(z)) { const T = (tot[t] ||= { n: 0, cap: 0, unknown: 0 }); T.n += v.n; T.cap += v.capacity ?? v.beds ?? v.enrollment; T.unknown += v.unknown || 0; }
console.log(tot, 'outside zones', outside);
console.log(JSON.stringify(notes, null, 1).slice(0, 2500));
if (keep < 0) fs.rmSync(DIR, { recursive: true, force: true });
