import type { SchedulerOptions, StationSchedule } from './types';

/**
 * Identify song boundaries (the time, in broadcast seconds, at which a song
 * ends and the next one begins). These are the only positions at which a
 * commercial break can be inserted without clipping a song.
 */
export function deriveBreakCandidates(schedule: StationSchedule, options: SchedulerOptions): number[] {
  const { minLeadTime, wrapAtEnd } = options;
  const total = schedule.totalSeconds;
  const boundaries: number[] = [];

  for (const song of schedule.songs) {
    if (song.end <= 0) continue;
    if (song.end > total && !wrapAtEnd) continue;
    const boundary = song.end % total;
    // A song that ends exactly at the broadcast length wraps onto the loop point
    // (position 0). Scheduling a break at the very start of a file is never a
    // clean spot and it corrupts the spacing of the following real boundaries.
    if (boundary <= 0) continue;
    boundaries.push(boundary);
  }

  // De-duplicate and sort. Reject boundaries that are too close together to be
  // useful as separate ad slots (e.g. many fragmented talk segments).
  const sorted = Array.from(new Set(boundaries)).sort((a, b) => a - b);
  const spaced: number[] = [];
  let last = -Infinity;
  for (const boundary of sorted) {
    if (boundary - last >= options.minGapBetweenBreaks) {
      spaced.push(boundary);
      last = boundary;
    }
  }
  return spaced;
}

export type BreakPoint = {
  /** Broadcast offset where the break's fade-out begins, seconds. */
  fadeStart: number;
  /** Broadcast offset of the song boundary, seconds. */
  boundary: number;
  /** Index of the song that is ending. */
  songIndex: number;
  /** Seconds until the boundary from "now". */
  secondsAway: number;
};

/**
 * Pick the next valid break point at or after `currentOffset`.
 *
 * - The boundary must be at least `minLeadTime` away so we have time to plan
 *   the fade.
 * - The chosen boundary is the earliest such one, unless the previous break is
 *   closer than `minGapBetweenBreaks` (in which case we skip to the next).
 * - When `wrapAtEnd` is set, the end of the broadcast is treated as a boundary
 *   and the schedule wraps around to the start.
 */
export function findBreakPoint(
  schedule: StationSchedule,
  candidates: number[],
  currentOffset: number,
  lastBreakAt: number,
  options: SchedulerOptions,
): BreakPoint | null {
  const total = schedule.totalSeconds;
  if (total <= 0 || candidates.length === 0) return null;

  const offset = ((currentOffset % total) + total) % total;
  const soonest = offset + options.minLeadTime;
  const earliestAllowed = Math.max(soonest, lastBreakAt + options.minGapBetweenBreaks);

  // Find the first candidate strictly after `earliestAllowed`.
  const boundary = candidates.find((candidate) => candidate > earliestAllowed);
  if (boundary === undefined) return null;

  // Map the boundary back to the song that ends at (or nearest before) it.
  const songIndex = nearestEndingSongIndex(schedule, boundary, total);

  return {
    fadeStart: boundary - options.fadeSeconds,
    boundary,
    songIndex,
    secondsAway: boundary - offset,
  };
}

/** Song that ends nearest to (but at or before) a boundary timestamp. */
function nearestEndingSongIndex(schedule: StationSchedule, boundary: number, total: number): number {
  let bestIndex = 0;
  let bestDelta = Number.POSITIVE_INFINITY;
  schedule.songs.forEach((song, index) => {
    const end = song.end % total;
    const delta = Math.abs(end - boundary);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestIndex = index;
    }
  });
  return bestIndex;
}

/**
 * Validate that an imported schedule's reported broadcast length actually matches
 * the local MP3s we intend to play. When they disagree (a different rip, a
 * trimmed file, or a per-song folder), insertion would land in the middle of a
 * song, so the scheduler must fall back to uninterrupted playback.
 *
 * @returns the resolved duration to schedule against, or null when invalid.
 */
export function resolveValidDuration(
  schedule: StationSchedule,
  actualDuration: number,
  options: SchedulerOptions,
): number | null {
  if (!schedule.valid || schedule.reportedSeconds <= 0) return null;
  if (!Number.isFinite(actualDuration) || actualDuration <= 0) return null;

  const reported = schedule.reportedSeconds;
  const drift = Math.abs(reported - actualDuration);
  const withinRelative = drift / actualDuration <= options.durationTolerance;
  const withinAbsolute = drift <= Math.max(8, actualDuration * options.durationTolerance);

  if (!withinRelative && !withinAbsolute) return null;

  // Schedule against the real file length so wraps and boundaries stay in range.
  return actualDuration;
}
