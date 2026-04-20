/**
 * Three-word thematic crew codes: <adjective>-<beast-or-element>-<object>.
 *
 * Aim: poetic, short-ish, URL-safe, readable aloud, recognizable to Pirate Borg /
 * Mörk Borg readers. Combinatorial space is big enough (~50 × ~50 × ~50 ≈ 125k)
 * that collisions are vanishingly rare at hobby-group scale. Callers must still
 * do a DB uniqueness check — see db.generateUniqueCrewCode.
 */

const ADJECTIVES = [
  'bloody', 'cursed', 'rotten', 'salt', 'sunken', 'haunted', 'forsaken',
  'drowned', 'blackened', 'shackled', 'ragged', 'tattered', 'weeping',
  'smoldering', 'grim', 'ashen', 'hollow', 'leaden', 'crimson', 'wretched',
  'festering', 'mouldering', 'ruined', 'starving', 'withered', 'shivering',
  'iron', 'brine', 'fell', 'broken', 'lost', 'gilded', 'buried', 'tarred',
  'mad', 'doomed', 'howling', 'wailing', 'silent', 'frozen', 'seething',
  'gnashing', 'gutted', 'pale', 'waxen', 'bloated', 'parched', 'thirsting',
  'ember', 'ghost'
] as const;

const BEASTS = [
  'kraken', 'lich', 'leviathan', 'wyrm', 'serpent', 'carrion', 'vulture',
  'crow', 'maggot', 'shark', 'barnacle', 'eel', 'urchin', 'pig', 'hound',
  'wolf', 'rat', 'viper', 'mantis', 'locust', 'roach', 'spider', 'bat',
  'jackal', 'corpse', 'revenant', 'ghoul', 'wraith', 'gibbet', 'skeleton',
  'hag', 'witch', 'monk', 'priest', 'widow', 'orphan', 'gull', 'raven',
  'albatross', 'stormcrow', 'marrow', 'plague', 'fever', 'rot', 'tide',
  'gale', 'squall', 'tempest', 'fog', 'mire'
] as const;

const OBJECTS = [
  'rum', 'grog', 'compass', 'cutlass', 'dagger', 'flintlock', 'musket',
  'anchor', 'galleon', 'sloop', 'frigate', 'brigantine', 'lantern', 'skull',
  'bone', 'gallows', 'noose', 'chain', 'shackle', 'manacle', 'doubloon',
  'coin', 'pearl', 'scrimshaw', 'locket', 'trinket', 'relic', 'idol',
  'altar', 'tome', 'scroll', 'chart', 'ledger', 'sextant', 'astrolabe',
  'spyglass', 'barrel', 'cask', 'keg', 'bottle', 'flag', 'sail', 'mast',
  'rope', 'hook', 'shroud', 'tomb', 'crypt', 'cairn', 'dirge'
] as const;

function pick<T>(arr: readonly T[], rng: () => number): T {
  // Safe: arr is a non-empty const tuple at the call sites below.
  const idx = Math.floor(rng() * arr.length);
  return arr[idx] as T;
}

/**
 * Generate a candidate three-word code like "bloody-kraken-rum".
 *
 * Caller is responsible for checking DB uniqueness. Takes an optional RNG for
 * testability (default Math.random).
 */
export function generateCrewCodeCandidate(rng: () => number = Math.random): string {
  return `${pick(ADJECTIVES, rng)}-${pick(BEASTS, rng)}-${pick(OBJECTS, rng)}`;
}

/**
 * Reserved subpaths that must not collide with a crew code. Keep in sync with
 * /server/routes.ts. Anything that appears as a top-level path segment the app
 * needs to own should go here.
 */
export const RESERVED_CREW_CODES = new Set<string>([
  'api', 'ws', 'healthz', 'static', 'assets', 'c', 'admin', 'robots.txt',
  'favicon.ico', 'favicon.svg', 'sitemap.xml'
]);

export function isValidCrewCodeShape(code: string): boolean {
  // Three lowercase ASCII words separated by hyphens. Tight — URL-safe and
  // reads aloud cleanly. Length bound: 4..24 chars per word, three words.
  if (!/^[a-z]{3,14}-[a-z]{3,14}-[a-z]{3,14}$/.test(code)) return false;
  if (RESERVED_CREW_CODES.has(code)) return false;
  return true;
}
