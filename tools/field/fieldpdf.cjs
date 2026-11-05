const fs=require('fs');const {chromium}=require('playwright');
const B=JSON.parse(fs.readFileSync('blocks.json'));
const RT=JSON.parse(fs.readFileSync('route.json'));
const tour=RT.order.map(r=>{const x=B.find(q=>q.edge===r.edge);const fwd=r.startNode===x.ea;return {...x,dfrom:fwd?x.from:x.to,dto:fwd?x.to:x.from,s:r.start,e:r.end};});
const pts=tour.flatMap(x=>[x.s,x.e]);const legs=[];for(let i=0;i<pts.length-1;i+=9){legs.push(pts.slice(i,Math.min(pts.length,i+10)));}
const gm=L=>`https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=${L[0].join(',')}&destination=${L[L.length-1].join(',')}${L.length>2?'&waypoints='+L.slice(1,-1).map(p=>p.join(',')).join('%7C'):''}`;
const stopOf=i=>Math.floor(i/2)+1;
const legHTML=legs.map((L,k)=>{const i0=k*9,i1=i0+L.length-1;return `<li><a href="${gm(L)}">Leg ${k+1}: blocks ${stopOf(i0)}–${stopOf(i1)}</a></li>`;}).join('');
const t=s=>s.replace(/\b([A-Z])([A-Z']*)\b/g,(m,a,b)=>a+b.toLowerCase()).replace(/\bAv\b/g,'Ave').replace(/\bBl\b/g,'Blvd').replace(/\bWy\b/g,'Way').replace(/\bPa\b/g,'Path').replace(/\bWk\b/g,'Walk').replace(/\bLn\b/g,'Ln');
const rows=tour.map((b,k)=>`<tr><td>${k+1}</td><td><b>${t(b.street)}</b><br><span class="s">drive from ${t(b.dfrom)} to ${t(b.dto)}</span><br><a href="https://www.google.com/maps/search/?api=1&query=${b.lat},${b.lon}">${b.lat}, ${b.lon}</a></td><td>${b.lengthM} m<br>${b.pavementFt} ft wide</td><td>${b.cars}<br><span class="s">${b.pattern||''}${b.canopy?`; ${Math.round(b.canopy*100)}% under trees`:''}</span></td><td class="w"></td><td class="w"></td><td class="w"></td><td class="w"></td><td class="w"></td></tr>`).join('');
const html=`<!doctype html><html><head><meta charset="utf-8"><title>Hill parking check</title><style>
@page{size:Letter landscape;margin:12mm}body{font:10.5pt/1.35 system-ui,sans-serif;color:#1f2328}h1{font-size:15pt;margin:0 0 4px}h2{font-size:11.5pt;margin:12px 0 4px}
p,li{margin:3px 0}ul{margin:2px 0 2px 18px;padding:0}table{border-collapse:collapse;width:100%;font-size:9.5pt}th,td{border:1px solid #9a948a;padding:4px 5px;vertical-align:top}th{background:#efe9df;text-align:left}
td.w{width:9%}.s{color:#555;font-size:8.5pt}a{color:#1d4ed8;font-size:8.5pt}tr{page-break-inside:avoid}.box{border:1px solid #c9bfae;background:#faf7f1;padding:6px 9px;margin:6px 0}</style></head><body>
<h1>Hill parking check: 22 blocks, evening</h1>
<p>Prepared 2026-11-04 for the Berkeley Wildfire Evacuation Explorer. Every parking count the simulator uses comes from one daytime moment: the City's 2020 aerial photos, counted by Claude and not yet checked by a person. Parking at night is an assumption. These 22 blocks are the ones counted from the air: 5 streets you photographed earlier and 17 drawn at random from two-way hill blocks 70–220 m long. Counting them in person settles two things: whether the aerial counts are right, and how much fuller the blocks are at night.</p>
<div class="box"><b>When.</b> A weeknight, Tuesday to Thursday, <b>9 to 11 p.m.</b>, when most residents are home: the simulator's fall-night case. Not on a holiday, a Cal home game night or a street-sweeping morning. If you can, repeat a few blocks on a weekday <b>1 to 3 p.m.</b>, the time of day the 2020 photos show, to separate a counting error from a day-and-night difference.<br>
<b>Where.</b> Each block runs between the two cross streets named. "Path", "Walk" and "Steps" are footpaths; the block ends where the path meets the street. The coordinates are the middle of the block. The blocks are in driving order: the shortest route through all 22 on the City street network, one-way streets included, driving each block from one end to the other (about ${RT.totalKm} km). Each leg link below opens that stretch in Google Maps; tap the next leg when you finish one.<br>
<b>Privacy.</b> Photos help with counting, but only the counts are kept; frame them to avoid faces and license plates where you can.</div>
<h2>Route</h2><ul>${legHTML}</ul><h2>What to write down for each block</h2>
<ul><li><b>Side 1 / Side 2:</b> parked cars on each side (pick either side as side 1; trucks and vans count as cars).</li>
<li><b>Pinches:</b> places where cars on both sides leave about one car's width or less to drive through.</li>
<li><b>Corners:</b> cars parked within about 20 ft (one car length) before a corner crosswalk, marked or not, on the side cars approach from, which state law has barred since 2024 (daylighting, Vehicle Code §22500(n)).</li>
<li><b>Signs / red curb:</b> posted no-parking signs or red curb on the block, and whether cars are parked against them.</li>
<li><b>Notes:</b> cars far from the curb or on the sidewalk, driveways or gates that limit parking, anything unusual.</li></ul>
<table><thead><tr><th>#</th><th>Block</th><th>Size</th><th>2020 aerial count</th><th>Side 1</th><th>Side 2</th><th>Pinches</th><th>Corners / signs</th><th>Notes</th></tr></thead><tbody>${rows}</tbody></table>
<p class="s">Date: ________ Start time: ______ End time: ______ Weather: __________. Aerial counts: City of Berkeley 2020 3-inch orthophotos, counted 2026-11-01 (data/field/aerial-parking-counts-2020.json); "under trees" is the share of the block hidden by canopy, so the aerial count misses cars there.</p>
</body></html>`;
fs.writeFileSync('/home/user/berkeley-wildfire-evacuation-explorer/docs/field/hill-parking-check.html',html);
(async()=>{const b=await chromium.launch();const p=await b.newPage();await p.setContent(html,{waitUntil:'load'});await p.pdf({path:'/home/user/berkeley-wildfire-evacuation-explorer/docs/field/hill-parking-check.pdf',format:'Letter',landscape:true,printBackground:true});await b.close();console.log('ok');})();
