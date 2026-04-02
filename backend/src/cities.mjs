// src/cities.mjs
// Single source of truth for all 30 Moxident service-area cities.
// Used by the search-volume-updater Lambda and getSearchVolume() in db.mjs.
//
// monthlySearchEstimate: derived from "emergency dentist" US monthly volume
// (250,000) × Seattle metro share (1.3% = 3,250/mo), distributed by city
// population proportion using 2020 Census / ACS estimates.

const CITIES = [
  { slug: "kirkland",          city: "Kirkland",          primaryZip: "98033", adjacentZips: ["98034", "98011", "98028"],          monthlySearchEstimate: 110 },
  { slug: "bellevue",          city: "Bellevue",          primaryZip: "98004", adjacentZips: ["98005", "98006", "98007", "98008"], monthlySearchEstimate: 180 },
  { slug: "redmond",           city: "Redmond",           primaryZip: "98052", adjacentZips: ["98053", "98033", "98074"],          monthlySearchEstimate: 87 },
  { slug: "bothell",           city: "Bothell",           primaryZip: "98011", adjacentZips: ["98012", "98021", "98028"],          monthlySearchEstimate: 65 },
  { slug: "woodinville",       city: "Woodinville",       primaryZip: "98072", adjacentZips: ["98011", "98028", "98077"],          monthlySearchEstimate: 17 },
  { slug: "kenmore",           city: "Kenmore",           primaryZip: "98028", adjacentZips: ["98011", "98033", "98072"],          monthlySearchEstimate: 29 },
  { slug: "shoreline",         city: "Shoreline",         primaryZip: "98133", adjacentZips: ["98155", "98177", "98125"],          monthlySearchEstimate: 67 },
  { slug: "mountlake-terrace", city: "Mountlake Terrace", primaryZip: "98043", adjacentZips: ["98021", "98036", "98133"],          monthlySearchEstimate: 26 },
  { slug: "edmonds",           city: "Edmonds",           primaryZip: "98020", adjacentZips: ["98021", "98026", "98043"],          monthlySearchEstimate: 50 },
  { slug: "lynnwood",          city: "Lynnwood",          primaryZip: "98036", adjacentZips: ["98020", "98021", "98043"],          monthlySearchEstimate: 51 },
  { slug: "mill-creek",        city: "Mill Creek",        primaryZip: "98012", adjacentZips: ["98011", "98021", "98036"],          monthlySearchEstimate: 25 },
  { slug: "mukilteo",          city: "Mukilteo",          primaryZip: "98275", adjacentZips: ["98012", "98026", "98036"],          monthlySearchEstimate: 26 },
  { slug: "everett",           city: "Everett",           primaryZip: "98201", adjacentZips: ["98203", "98204", "98208"],          monthlySearchEstimate: 138 },
  { slug: "marysville",        city: "Marysville",        primaryZip: "98270", adjacentZips: ["98201", "98271", "98292"],          monthlySearchEstimate: 83 },
  { slug: "monroe",            city: "Monroe",            primaryZip: "98272", adjacentZips: ["98019", "98065", "98296"],          monthlySearchEstimate: 24 },
  { slug: "snohomish",         city: "Snohomish",         primaryZip: "98290", adjacentZips: ["98012", "98270", "98272"],          monthlySearchEstimate: 13 },
  { slug: "renton",            city: "Renton",            primaryZip: "98055", adjacentZips: ["98056", "98057", "98058"],          monthlySearchEstimate: 126 },
  { slug: "kent",              city: "Kent",              primaryZip: "98030", adjacentZips: ["98031", "98032", "98042"],          monthlySearchEstimate: 162 },
  { slug: "auburn",            city: "Auburn",            primaryZip: "98001", adjacentZips: ["98002", "98003", "98030"],          monthlySearchEstimate: 104 },
  { slug: "federal-way",       city: "Federal Way",       primaryZip: "98003", adjacentZips: ["98001", "98023", "98063"],          monthlySearchEstimate: 115 },
  { slug: "des-moines",        city: "Des Moines",        primaryZip: "98198", adjacentZips: ["98003", "98032", "98148"],          monthlySearchEstimate: 38 },
  { slug: "burien",            city: "Burien",            primaryZip: "98146", adjacentZips: ["98106", "98148", "98166"],          monthlySearchEstimate: 62 },
  { slug: "tukwila",           city: "Tukwila",           primaryZip: "98188", adjacentZips: ["98032", "98146", "98168"],          monthlySearchEstimate: 25 },
  { slug: "seatac",            city: "SeaTac",            primaryZip: "98188", adjacentZips: ["98146", "98148", "98168"],          monthlySearchEstimate: 37 },
  { slug: "mercer-island",     city: "Mercer Island",     primaryZip: "98040", adjacentZips: ["98004", "98005", "98006"],          monthlySearchEstimate: 31 },
  { slug: "bellevue-east",     city: "Bellevue East",     primaryZip: "98007", adjacentZips: ["98004", "98005", "98008"],          monthlySearchEstimate: 54 },
  { slug: "issaquah",          city: "Issaquah",          primaryZip: "98027", adjacentZips: ["98029", "98065", "98074"],          monthlySearchEstimate: 48 },
  { slug: "sammamish",         city: "Sammamish",         primaryZip: "98074", adjacentZips: ["98027", "98029", "98052"],          monthlySearchEstimate: 82 },
  { slug: "maple-valley",      city: "Maple Valley",      primaryZip: "98038", adjacentZips: ["98030", "98042", "98058"],          monthlySearchEstimate: 36 },
  { slug: "covington",         city: "Covington",         primaryZip: "98042", adjacentZips: ["98030", "98031", "98038"],          monthlySearchEstimate: 27 },
];

// Lookup maps for fast access
const BY_ZIP = new Map();
const BY_SLUG = new Map();

for (const entry of CITIES) {
  BY_ZIP.set(entry.primaryZip, entry);
  BY_SLUG.set(entry.slug, entry);
}

export { CITIES, BY_ZIP, BY_SLUG };
