import { matchMetadataStation } from './matching';
import type { SongMarker, StationSchedule } from './types';

/** Raw timestamp shape inside `radiostations.json`. */
type RawTimestamp = {
  start?: unknown;
  end?: unknown;
  artist?: unknown;
  song?: unknown;
};

/** Raw station shape inside `radiostations.json`. */
type RawStation = {
  name?: unknown;
  seconds?: unknown;
  timestamps?: unknown;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const toNumber = (value: unknown): number | null => {
  if (isFiniteNumber(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const strip = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * Parse the `radiostations.json` document produced by `jtaomas/GTA-V-Radio`.
 * The document is tolerant: it accepts either `{ stationdata: [...] }` or a bare
 * array of stations, ignores unknown fields, and drops malformed stations.
 *
 * @returns a list of raw, un-normalised stations (kept untyped so callers can
 * handle both the reference format and future variants).
 */
export function parseRadioMetadataDocument(input: unknown): RawStation[] {
  if (Array.isArray(input)) return input as RawStation[];
  if (input && typeof input === 'object') {
    const doc = input as { stationdata?: unknown };
    if (Array.isArray(doc.stationdata)) return doc.stationdata as RawStation[];
  }
  return [];
}

/**
 * Sort and clean a station's raw timestamps into normalised song markers,
 * clamped to the broadcast length. Markers that are out of order, empty, or
 * outside the broadcast are dropped; remaining markers are re-indexed.
 */
export function normaliseTimestamps(
  rawTimestamps: unknown,
  broadcastSeconds: number,
  sourceName: string,
): SongMarker[] {
  if (!Array.isArray(rawTimestamps)) return [];

  const capped = broadcastSeconds > 0 ? broadcastSeconds : Number.POSITIVE_INFINITY;
  const parsed: SongMarker[] = [];

  rawTimestamps.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const item = entry as RawTimestamp;
    const start = toNumber(item.start);
    const end = toNumber(item.end);
    // A timestamp is only usable if it has a real, positive range.
    if (start === null || end === null) return;
    if (!(end > start)) return;
    if (start < 0) return;
    const clampedEnd = Math.min(end, capped);
    const clampedStart = Math.min(start, Math.max(0, clampedEnd - 1));
    if (!(clampedEnd > clampedStart)) return;

    const title = strip(item.song) || `Track ${parsed.length + 1}`;
    const artistRaw = strip(item.artist);
    parsed.push({
      index: 0,
      title,
      artist: artistRaw || null,
      start: clampedStart,
      end: clampedEnd,
      duration: clampedEnd - clampedStart,
      isTalk: artistRaw === '' && /show|radio|hour|morning|evening/i.test(title),
    });
  });

  parsed.sort((a, b) => a.start - b.start);

  // Drop markers that overlap the previous one (a well-formed broadcast has
  // contiguous, non-overlapping ranges; overlapping entries are bad metadata).
  const cleaned: SongMarker[] = [];
  for (const marker of parsed) {
    const previous = cleaned[cleaned.length - 1];
    if (previous && marker.start < previous.end) continue;
    marker.index = cleaned.length;
    cleaned.push(marker);
  }
  // Re-index in case a marker was dropped mid-list.
  cleaned.forEach((marker, index) => (marker.index = index));

  if (cleaned.length === 0) {
    // Fall back to a single whole-broadcast marker so we still know it is a song.
    return [{
      index: 0,
      title: sourceName,
      artist: null,
      start: 0,
      end: broadcastSeconds > 0 ? broadcastSeconds : 0,
      duration: broadcastSeconds > 0 ? broadcastSeconds : 0,
      isTalk: false,
    }];
  }
  return cleaned;
}

/**
 * Import a metadata document and return normalised schedules for every station
 * that also exists in our local library. Each schedule carries enough info for
 * the boundary / validation stages to consume without re-parsing.
 */
export function importRadioMetadata(input: unknown): StationSchedule[] {
  const rawStations = parseRadioMetadataDocument(input);
  const schedules: StationSchedule[] = [];

  for (const raw of rawStations) {
    if (!raw || typeof raw !== 'object') continue;
    const sourceName = strip(raw.name);
    if (!sourceName) continue;

    const stationId = matchMetadataStation(sourceName);
    if (!stationId) continue;

    const reportedSeconds = toNumber(raw.seconds) ?? 0;
    const totalSeconds = Math.max(0, Math.min(reportedSeconds || 0, reportedSeconds || 0));
    const songs = normaliseTimestamps(raw.timestamps, totalSeconds, sourceName);

    let valid = reportedSeconds > 0 && songs.length > 0;
    let invalidReason: string | undefined;
    if (!valid) invalidReason = reportedSeconds <= 0 ? 'Metadata has no broadcast length' : 'Metadata has no usable song timestamps';

    schedules.push({
      stationId,
      sourceName,
      reportedSeconds,
      totalSeconds,
      valid,
      invalidReason,
      songs,
    });
  }

  return schedules;
}

/** Index schedules by station id, keeping the first valid entry per station. */
export function indexSchedules(schedules: StationSchedule[]): Map<string, StationSchedule> {
  const index = new Map<string, StationSchedule>();
  for (const schedule of schedules) {
    if (!schedule.valid) continue;
    const existing = index.get(schedule.stationId);
    // Prefer the schedule whose timestamps span the widest range (most complete).
    if (!existing || schedule.songs[schedule.songs.length - 1]?.end > existing.songs[existing.songs.length - 1]?.end) {
      index.set(schedule.stationId, schedule);
    }
  }
  return index;
}
