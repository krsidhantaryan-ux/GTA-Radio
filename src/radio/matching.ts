import { stations } from '../stations';
import type { Station } from '../types';

/** Lowercase, strip punctuation, collapse whitespace. */
const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * The `radiostations.json` station names are close to (but not identical with)
 * the app's station names. A naive substring match is ambiguous: e.g.
 * "Los Santos Underground Radio" and "Los Santos Rock Radio" both contain the
 * substring "los santos" and would collide with "Radio Los Santos". These
 * overrides map the exact metadata name (normalised) to a local station id.
 */
const METADATA_OVERRIDES: Record<string, string> = {
  'los santos underground radio': 'lsur',
  'blonded los santos': 'blonded',
  'vinewood boulevard radio': 'vinewood',
  'space 103 2': 'space',
  'kult fm': 'kult',
  'radio mirror park': 'radio-mirror-park',
  'the lab': 'lab',
  'the lowdown 91 1': 'lowdown',
  'flylo fm': 'flylo',
  'worldwide fm': 'worldwide',
  'the blue ark': 'blue-ark',
  'the music locker': 'music-locker',
  'blaine county talk radio': 'blaine-county',
  'west coast classics': 'west-coast-classics',
  'east los fm': 'east-los',
  'soulwax fm': 'soulwax',
  'rebel radio': 'rebel',
  'wctr': 'wctr',
  'channel x': 'channel-x',
  'radio los santos': 'los-santos',
  'non stop pop fm': 'non-stop-pop',
  'los santos rock radio': 'rock-radio',
  'still slipping los santos': 'still-slipping',
};

/** Stations that exist in the reference metadata but have no local counterpart. */
const UNMAPPED = new Set(['motomami los santos', 'ifruit radio', 'none']);

/**
 * Build a lookup of every local station's normalised full name and aliases so
 * we can match a metadata name to a station id exactly (or by strongest overlap).
 */
function buildStationIndex(): Map<string, Station> {
  const index = new Map<string, Station>();
  for (const station of stations) {
    if (station.id === 'off') continue;
    if (station.name) index.set(normalise(station.name), station);
    for (const alias of station.aliases) index.set(normalise(alias), station);
  }
  return index;
}

const stationIndex = buildStationIndex();

/** Weighted token overlap between two normalised names. */
function tokenScore(aNorm: string, bNorm: string): number {
  const aTokens = new Set(aNorm.split(' ').filter(t => t.length > 1));
  const bTokens = new Set(bNorm.split(' ').filter(t => t.length > 1));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let overlap = 0;
  for (const t of aTokens) if (bTokens.has(t)) overlap++;
  // Penalise tiny matches so "the" or "los" alone can't decide a station.
  if (overlap === 0) return 0;
  const coverage = overlap / Math.max(aTokens.size, bTokens.size);
  return overlap * coverage;
}

/**
 * Map a metadata (or arbitrary) station name to a local station id.
 *
 * Strategy:
 *  1. exact match of the normalised name against a station name/alias;
 *  2. known-name override table (handles the ambiguous "Los Santos …" family);
 *  3. strongest weighted token overlap above a threshold, as a fallback for
 *     custom station packs.
 *
 * Returns `null` when no local station (other than "Radio Off") corresponds.
 */
export function matchMetadataStation(name: string): string | null {
  const norm = normalise(name);
  if (!norm || UNMAPPED.has(norm)) return null;

  const exact = stationIndex.get(norm);
  if (exact) return exact.id;

  const overridden = METADATA_OVERRIDES[norm];
  if (overridden) return overridden;

  let best: Station | null = null;
  let bestScore = 0;
  for (const station of stations) {
    if (station.id === 'off') continue;
    const candidates = [station.name, ...station.aliases];
    for (const candidate of candidates) {
      const score = tokenScore(norm, normalise(candidate));
      if (score > bestScore) {
        bestScore = score;
        best = station;
      }
    }
  }
  // Require a meaningful overlap before trusting a fuzzy match.
  return best && bestScore >= 0.6 ? best.id : null;
}

/** Return the local station object for a metadata name, or null. */
export function stationForMetadataName(name: string): Station | null {
  const id = matchMetadataStation(name);
  return id ? stations.find(s => s.id === id) ?? null : null;
}
