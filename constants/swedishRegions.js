// Swedish regions (län) for escort profiles
const SWEDISH_REGIONS = [
  'Blekinge län',
  'Dalarnas län', 
  'Gotlands län',
  'Gävleborgs län',
  'Hallands län',
  'Jämtlands län',
  'Jönköpings län',
  'Kalmar län',
  'Kronobergs län',
  'Norrbottens län',
  'Skåne län',
  'Stockholms län',
  'Södermanlands län',
  'Uppsala län',
  'Värmlands län',
  'Västerbottens län',
  'Västernorrlands län',
  'Västmanlands län',
  'Västra Götalands län',
  'Örebro län',
  'Östergötlands län'
];

// Helper function to validate if a region is a valid Swedish region
function isValidSwedishRegion(region) {
  if (!region || typeof region !== 'string') return false;
  const trimmed = region.trim();
  if (SWEDISH_REGIONS.includes(trimmed)) return true;
  // Also accept common short forms like "Stockholm", "Västra Götaland" without "län"/possessive s
  const canonical = normalizeSwedishRegion(trimmed);
  return !!canonical && SWEDISH_REGIONS.includes(canonical);
}

// Helper function to get all Swedish regions
function getSwedishRegions() {
  return [...SWEDISH_REGIONS];
}

// Build a map of common aliases to canonical "X län" entries
const REGION_ALIAS_MAP = (() => {
  const map = new Map();
  for (const r of SWEDISH_REGIONS) {
    // Exact
    map.set(r.toLowerCase(), r);
    // Without trailing " län"
    const base = r.replace(/\s*län$/i, '');
    map.set(base.toLowerCase(), r);
    // Without possessive 's' before län (e.g., "Stockholms län" -> "Stockholm")
    const noPoss = r.replace(/s\s*län$/i, '').replace(/\s*län$/i, '');
    map.set(noPoss.toLowerCase(), r);
  }
  return map;
})();

// Normalize various user inputs to canonical "X län"
function normalizeSwedishRegion(input) {
  if (!input || typeof input !== 'string') return null;
  const key = input.trim().toLowerCase();
  return REGION_ALIAS_MAP.get(key) || null;
}

module.exports = {
  SWEDISH_REGIONS,
  isValidSwedishRegion,
  getSwedishRegions,
  normalizeSwedishRegion
};