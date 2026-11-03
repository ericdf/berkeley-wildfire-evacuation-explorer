[out:json][timeout:120];
// Off-street parking (amenity=parking) in the simulator's model area (js AREA_LONLAT), with capacity, parking type,
// operator and access tags where mappers added them. Used by tools/workplaces.mjs for the opt-in "by workplace"
// non-resident placement (SOURCE_NOTES WP5). parking-campus-geom.overpassql adds footprints near campus and the Lab.
nwr["amenity"="parking"](37.840,-122.330,37.910,-122.210);
out center tags qt;
