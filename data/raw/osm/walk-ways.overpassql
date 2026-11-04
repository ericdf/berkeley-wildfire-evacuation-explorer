[out:json][timeout:300];
(
  way["highway"~"^(steps|footway|path|pedestrian)$"](37.836,-122.334,37.912,-122.206);
);
out body geom qt;
