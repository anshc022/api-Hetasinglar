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
  return SWEDISH_REGIONS.includes(region);
}

// Helper function to get all Swedish regions
function getSwedishRegions() {
  return [...SWEDISH_REGIONS];
}

module.exports = {
  SWEDISH_REGIONS,
  isValidSwedishRegion,
  getSwedishRegions
};