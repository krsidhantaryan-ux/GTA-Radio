/**
 * Broadcast-scheduler domain types.
 *
 * The scheduler works against a single "station broadcast" audio file (one long
 * recording per station, exactly like the GTA V radio streams reproduced by
 * `jtaomas/GTA-V-Radio`). The `radiostations.json` metadata describes which song
 * occupies which time range of that recording; the scheduler uses those ranges
 * to know where songs begin and end so it can insert commercial breaks at song
 * boundaries without ever desyncing the station's own clock.
 */

/** One song (or talk-show segment) inside a station broadcast recording. */
export type SongMarker = {
  /** Stable index within the schedule. */
  index: number;
  /** Show title (or talk-show segment name). */
  title: string;
  /** Artist, when the metadata provides one (talk segments are null). */
  artist: string | null;
  /** Start offset in the broadcast, seconds. */
  start: number;
  /** End offset in the broadcast, seconds. */
  end: number;
  /** end - start, seconds. */
  duration: number;
  /** True when this marker is a talk/radio-show block rather than a song. */
  isTalk: boolean;
};

/** Normalised per-station schedule produced from imported metadata. */
export type StationSchedule = {
  /** Local station id the metadata was matched to (see `matchMetadataStation`). */
  stationId: string;
  /** Original station name taken from the imported metadata. */
  sourceName: string;
  /** Total broadcast length reported by the metadata, seconds. */
  reportedSeconds: number;
  /** Resolved broadcast length used for scheduling, seconds (see validation). */
  totalSeconds: number;
  /** Whether the metadata could be parsed into usable markers. */
  valid: boolean;
  /** Human-readable reason when `valid` is false. */
  invalidReason?: string;
  /** Sorted song markers. */
  songs: SongMarker[];
};

/** One playable advertisement range inside the commercials recording. */
export type CommercialRange = {
  id: string;
  label: string;
  /** Start offset in the commercials file, seconds. */
  start: number;
  /** End offset in the commercials file, seconds. */
  end: number;
  /** end - start, seconds. */
  duration: number;
  /** How the range was produced: silence detection or user defined. */
  source: 'detected' | 'defined';
};

/** Cue sheet for `GTA V Radio Commercials.mp3`. */
export type CueSheet = {
  /** Public name of commercials file. */
  name: string;
  /** Size in bytes, used to detect whether a re-selected file matches. */
  size: number;
  /** Total duration of the commercials file, seconds. */
  duration: number;
  /** The advertisement ranges (ordered by start). */
  ranges: CommercialRange[];
  /** Range ids used most recently, so the same ad is not played twice in a row. */
  recentIds: string[];
  /** Unix ms when the cue sheet was built. */
  builtAt: number;
};

/** Which stage of a broadcast break the station timeline is in. */
export type BroadcastPhase = 'song' | 'ad' | 'off';

/** An ad slot chosen to interrupt the current song, expressed in broadcast time. */
export type BreakPlan = {
  /** Absolute broadcast offset at which we begin fading out, seconds. */
  fadeStart: number;
  /** Broadcast offset (song boundary) where the music pauses, seconds. */
  boundary: number;
  /** Song marker that is ending at `boundary`. */
  songIndex: number;
  /** Offset we resume the broadcast at once the ad has played, seconds. */
  resumeAt: number;
  /** The advertisement range selected for this break. */
  ad: CommercialRange;
};

/** Tuning knobs for the scheduler. Safe defaults supplied by the app. */
export type SchedulerOptions = {
  /** Minimum lead time between "now" and the fade start, seconds. */
  minLeadTime: number;
  /** How long the fade-out / fade-in ramps last, seconds. */
  fadeSeconds: number;
  /** Minimum gap between the end of one commercial and the next break, seconds. */
  minGapBetweenBreaks: number;
  /** Longest advertisement we ever schedule, seconds (safety cap). */
  maxAdDuration: number;
  /** Tolerance used to accept a metadata/across-file duration match. */
  durationTolerance: number;
  /** When a break lands this close to the end of the broadcast it wraps around. */
  wrapAtEnd: boolean;
};

export const DEFAULT_SCHEDULER_OPTIONS: SchedulerOptions = {
  minLeadTime: 8,
  fadeSeconds: 3,
  minGapBetweenBreaks: 120,
  maxAdDuration: 90,
  durationTolerance: 0.04,
  wrapAtEnd: true,
};
