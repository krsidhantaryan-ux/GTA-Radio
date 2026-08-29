import type { CommercialRange, CueSheet } from './types';

/** Options controlling silence-gap detection of ad breaks. */
export type DetectionOptions = {
  /** RMS below this fraction of the peak is treated as silence. */
  silenceThreshold: number;
  /** Window size for RMS analysis, seconds. */
  windowSeconds: number;
  /** Minimum silence length that separates two ads, seconds. */
  minGapSeconds: number;
  /** Minimum ad length to keep, seconds. */
  minAdSeconds: number;
  /** Maximum ad length to keep, seconds. */
  maxAdSeconds: number;
};

export const DEFAULT_DETECTION_OPTIONS: DetectionOptions = {
  silenceThreshold: 0.02,
  windowSeconds: 0.5,
  minGapSeconds: 0.7,
  minAdSeconds: 3,
  maxAdSeconds: 90,
};

/**
 * Detect ad ranges inside a decoded audio buffer by finding silence gaps and
 * treating the regions between them as individual spots. This is the "detects
 * ranges" path; callers can also supply "defined" ranges by hand.
 */
export function detectSilenceRanges(buffer: AudioBuffer, options: DetectionOptions = DEFAULT_DETECTION_OPTIONS): CommercialRange[] {
  const { sampleRate, numberOfChannels, length } = buffer;
  const duration = length / sampleRate;
  if (duration <= 0) return [];

  // Peak amplitude across all channels.
  let peak = 0;
  for (let channel = 0; channel < numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i += 4) {
      const value = Math.abs(data[i]);
      if (value > peak) peak = value;
    }
  }
  if (peak <= 0) return [];
  const threshold = options.silenceThreshold * peak;

  const windowSize = Math.max(1, Math.floor(options.windowSeconds * sampleRate));
  const windowCount = Math.floor(length / windowSize);
  const isSilent: boolean[] = new Array(windowCount).fill(false);

  for (let w = 0; w < windowCount; w++) {
    let sum = 0;
    const start = w * windowSize;
    const end = Math.min(length, start + windowSize);
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = start; i < end; i++) sum += data[i] * data[i];
    }
    const rms = Math.sqrt(sum / (end - start) / numberOfChannels);
    isSilent[w] = rms < threshold;
  }

  // Build the list of "loud" regions separated by silence.
  const regions: { start: number; end: number }[] = [];
  let inRegion = false;
  let regionStart = 0;
  let silentRun = 0;

  for (let w = 0; w < windowCount; w++) {
    if (!isSilent[w]) {
      if (!inRegion) {
        inRegion = true;
        regionStart = w * windowSize;
      }
      silentRun = 0;
    } else {
      silentRun++;
      const silenceSeconds = silentRun * options.windowSeconds;
      if (inRegion && silenceSeconds >= options.minGapSeconds) {
        regions.push({ start: regionStart, end: (w - silentRun + 1) * windowSize });
        inRegion = false;
      }
    }
  }
  if (inRegion) regions.push({ start: regionStart, end: windowCount * windowSize });

  // Convert regions to second-based ranges and filter by length.
  const ranges: CommercialRange[] = [];
  regions.forEach((region, index) => {
    const start = region.start / sampleRate;
    const end = Math.min(duration, region.end / sampleRate);
    const adDuration = end - start;
    if (adDuration < options.minAdSeconds || adDuration > options.maxAdSeconds) return;
    ranges.push({
      id: `ad-${index + 1}`,
      label: `Advertisement ${ranges.length + 1}`,
      start,
      end,
      duration: adDuration,
      source: 'detected',
    });
  });

  return ranges;
}

/** Assign stable ids and labels, sort, and drop ranges outside the file. */
export function buildCueSheet(
  name: string,
  duration: number,
  size: number,
  ranges: CommercialRange[],
  recentIds: string[] = [],
): CueSheet {
  const valid = ranges
    .filter((range) => range.end > range.start && range.start >= 0 && range.end <= duration + 0.01)
    .map((range, index) => ({
      ...range,
      id: `ad-${index + 1}`,
      label: range.label || `Advertisement ${index + 1}`,
      duration: range.end - range.start,
    }))
    .sort((a, b) => a.start - b.start);

  return {
    name,
    size,
    duration,
    ranges: valid,
    recentIds: recentIds.slice(0, 3),
    builtAt: Date.now(),
  };
}

/**
 * Pick an advertisement for the next break, avoiding immediate repetition:
 * the most recently played ads are excluded. Falls back to any ad when only a
 * single spot exists.
 */
export function pickAdvertisement(
  cue: CueSheet,
  excludeIds: string[] = cue.recentIds,
): CommercialRange | null {
  if (cue.ranges.length === 0) return null;
  const pool = cue.ranges.filter(range => !excludeIds.includes(range.id));
  const candidates = pool.length > 0 ? pool : cue.ranges;
  return candidates[Math.floor(Math.random() * candidates.length)] ?? null;
}

/**
 * Fresh cue sheet with the just-played id pushed to the front of the recency
 * list so the same ad won't be chosen immediately again.
 */
export function rememberAd(cue: CueSheet, id: string): CueSheet {
  const recentIds = [id, ...cue.recentIds.filter(existing => existing !== id)].slice(0, 3);
  return { ...cue, recentIds };
}

/**
 * Parse a user-authored cue sheet (a JSON array of `{start,end,label}` or
 * `{start,end,artist,song}`, or a plain object with a `ranges` array) into
 * defined ranges. Used for the "defines ranges" path.
 */
export function parseDefinedRanges(raw: unknown, duration: number): CommercialRange[] {
  let entries: unknown[] = [];
  if (Array.isArray(raw)) entries = raw;
  else if (raw && typeof raw === 'object' && Array.isArray((raw as { ranges?: unknown }).ranges)) {
    entries = (raw as { ranges: unknown[] }).ranges;
  }

  const ranges: CommercialRange[] = [];
  entries.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object') return;
    const item = entry as { start?: unknown; end?: unknown; label?: unknown; song?: unknown; artist?: unknown };
    const start = Number(item.start);
    const end = Number(item.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
    if (start < 0 || end > duration + 0.01) return;
    const label = typeof item.label === 'string' && item.label.trim()
      ? item.label.trim()
      : typeof item.song === 'string' && item.song.trim()
        ? item.song.trim()
        : `Advertisement ${index + 1}`;
    ranges.push({ id: `ad-${index + 1}`, label, start, end, duration: end - start, source: 'defined' });
  });
  return ranges;
}
