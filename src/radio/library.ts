import bundles from '../data/radiostations.json';
import { importRadioMetadata, indexSchedules } from './metadata';
import { detectSilenceRanges, buildCueSheet, parseDefinedRanges } from './commercials';
import type { CueSheet, StationSchedule } from './types';

/**
 * Default song timestamps bundled from `jtaomas/GTA-V-Radio` (MIT licensed).
 * Normalised once and reused so the scheduler works without any extra import.
 */
const defaultSchedules: StationSchedule[] = importRadioMetadata(bundles);

export function getDefaultSchedules(): StationSchedule[] {
  return defaultSchedules;
}

export function indexDefaultSchedules(): Map<string, StationSchedule> {
  return indexSchedules(defaultSchedules);
}

/**
 * Load a file's duration without ever uploading it. Object URL is revoked
 * immediately after the metadata (duration) has been read.
 */
export function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = 'metadata';
    let settled = false;
    const done = (duration: number) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(duration);
    };
    const fail = () => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      reject(new Error('Could not read audio duration'));
    };
    audio.addEventListener('loadedmetadata', () => done(Number.isFinite(audio.duration) ? audio.duration : 0));
    audio.addEventListener('error', fail);
    audio.src = url;
  });
}

/**
 * Build a cue sheet for the commercials recording. When detection succeeds it
 * proposes ranges from silence gaps; a `definedRaw` (optional) lets the user
 * supply ranges by hand, which take precedence.
 */
export async function buildCommercialCueSheet(
  file: File,
  definedRaw?: unknown,
): Promise<CueSheet> {
  const duration = await getAudioDuration(file);
  const detected = await detectInFile(file);
  const defined = parseDefinedRanges(definedRaw, duration);
  const ranges = defined.length > 0 ? defined : detected;
  return buildCueSheet(file.name, duration, file.size, ranges);
}

/**
 * Decode the commercials file and run silence-gap detection.
 * Very large files are skipped (memory), leaving detection to the browser's
 * decode would risk a tab crash; defined ranges still work in that case.
 */
async function detectInFile(file: File): Promise<import('./types').CommercialRange[]> {
  // Roughly 5 minutes of 44.1kHz stereo float is ~100MB in memory; steer clear.
  if (file.size > 120 * 1024 * 1024) return [];
  try {
    // Use an OfflineAudioContext so no playback / user gesture is required.
    const ctor: typeof OfflineAudioContext = (window as unknown as {
      OfflineAudioContext?: typeof OfflineAudioContext;
    }).OfflineAudioContext ?? OfflineAudioContext;
    const arrayBuffer = await file.arrayBuffer();
    const ctx = new ctor(1, 1, 44100);
    const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    return detectSilenceRanges(buffer);
  } catch {
    // Detection is best-effort; if the format can't be decoded the cue sheet is
    // built from whatever ranges the user defines (or left empty).
    return [];
  }
}
