# usage: python3 -I cde_extract.py <pubschls.txt> <cdenroll.txt> <privateschooldata.xlsx> <out_public.csv> <out_private.csv>
import sys, csv, openpyxl, collections
csv.field_size_limit(10**8)
pub, enr, prv, outp, outv = sys.argv[1:6]
W, E, S, N = -122.330, -122.210, 37.840, 37.910
sch = {}
for s in csv.DictReader(open(pub, encoding='latin-1'), delimiter='\t'):
    try: la, lo = float(s['Latitude']), float(s['Longitude'])
    except ValueError: continue
    if s['StatusType'] == 'Active' and W <= lo <= E and S <= la <= N and s['School'] not in ('', 'No Data'):
        sch[s['CDSCode']] = [s['CDSCode'], s['District'], s['School'], s['SOCType'], s['Virtual'], la, lo, '']
for r in csv.DictReader(open(enr, encoding='latin-1'), delimiter='\t'):
    if r['AggregateLevel'] != 'S' or r['ReportingCategory'] != 'TA': continue
    k = r['CountyCode'] + r['DistrictCode'] + r['SchoolCode']
    if k in sch: sch[k][7] = r['TOTAL_ENR']
with open(outp, 'w', newline='') as f:
    o = csv.writer(f); o.writerow(['cds', 'district', 'school', 'type', 'virtual', 'lat', 'lon', 'enrollment_2025_26'])
    for k in sorted(sch): o.writerow(sch[k])
ws = openpyxl.load_workbook(prv, read_only=True).active
agg = collections.defaultdict(lambda: [0, 0, 0])
for r in list(ws.iter_rows(values_only=True))[6:]:
    if not r or not r[2]: continue
    if r[2] in ('Berkeley Unified', 'Albany City Unified', 'Emery Unified', 'Oakland Unified', 'West Contra Costa Unified'):
        a = agg[r[2]]; a[0] += 1; a[1] += int(r[17] or 0); a[2] += sum(int(r[i] or 0) for i in range(19, 23))
with open(outv, 'w', newline='') as f:
    o = csv.writer(f); o.writerow(['public_school_district', 'private_schools_6plus', 'enrollment_2025_26', 'staff_ft_pt_admin_other'])
    for k in sorted(agg): o.writerow([k] + agg[k])
print(len(sch), 'public schools;', sum(int(v[7] or 0) for v in sch.values()), 'enrolled;', dict(agg), file=sys.stderr)
