# usage: python3 -I lodes_extract.py <xwalk.gz> <wac.gz> <out.csv>   (OD main streamed on stdin, uncompressed)
import sys, csv, gzip
xw, wac, out = sys.argv[1:4]
W, E, S, N = -122.330, -122.210, 37.840, 37.910
blk = {}; place = {}
with gzip.open(xw, 'rt') as f:
    for r in csv.DictReader(f):
        place[r['tabblk2020']] = r['stplc']
        if r['cty'] not in ('06001', '06013'): continue
        lat, lon = float(r['blklatdd']), float(r['blklondd'])
        if W <= lon <= E and S <= lat <= N: blk[r['tabblk2020']] = (lat, lon, r['stplc'], r['stplcname'])
jobs = {}
with gzip.open(wac, 'rt') as f:
    for r in csv.DictReader(f):
        if r['w_geocode'] in blk: jobs[r['w_geocode']] = (int(r['C000']), int(r['CNS15']), int(r['CNS16']))
inb = {}; tot = {}
rd = csv.reader(sys.stdin); hdr = next(rd)
for r in rd:
    w = r[0]
    if w not in blk: continue
    n = int(r[2]); tot[w] = tot.get(w, 0) + n
    if place.get(r[1]) != blk[w][2]: inb[w] = inb.get(w, 0) + n  # home outside the workplace's city (main file: CA residents)
with open(out, 'w', newline='') as f:
    o = csv.writer(f); o.writerow(['block', 'lat', 'lon', 'place', 'jobs', 'jobs_educ', 'jobs_health', 'od_main_jobs', 'od_main_home_outside_place'])
    for b in sorted(jobs):
        la, lo, p, pn = blk[b]; j = jobs[b]
        o.writerow([b, la, lo, p, j[0], j[1], j[2], tot.get(b, 0), inb.get(b, 0)])
print(len(blk), 'blocks in box;', len(jobs), 'with jobs;', sum(v[0] for v in jobs.values()), 'jobs', file=sys.stderr)
