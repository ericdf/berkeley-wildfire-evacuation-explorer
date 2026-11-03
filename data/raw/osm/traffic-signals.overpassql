[out:json][timeout:120];
// Traffic signals (highway=traffic_signals nodes) in the simulator's model area. tools/signals.mjs keeps those
// outside the City of Berkeley; the City Signals layer (SOURCE_NOTES G4) covers Berkeley.
node["highway"="traffic_signals"](37.840,-122.330,37.910,-122.210);
out body qt;
