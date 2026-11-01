[out:json][timeout:300];
(
  way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street)$"](37.836,-122.334,37.912,-122.206);
);
(._;>;);
out body qt;
