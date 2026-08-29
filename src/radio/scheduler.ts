import type { RadioEngine } from '../audio/RadioEngine';
import { deriveBreakCandidates, findBreakPoint, resolveValidDuration, type BreakPoint } from './boundaries';
import { pickAdvertisement, rememberAd } from './commercials';
import type {
  CommercialRange,
  CueSheet,
  SchedulerOptions,
  SongMarker,
  StationSchedule,
} from './types';
import { DEFAULT_SCHEDULER_OPTIONS } from './types';

export type SchedulerCallbacks = {
  /** Fired just as a commercial break begins (after the fade-out starts). */
  onBreakStart?: (ad: CommercialRange, song: SongMarker) => void;
  /** Fired when the station timeline has resumed after a break. */
  onBreakEnd?: (resumeAt: number) => void;
  /** Fired when the scheduler can't run (missing ads, invalid data, etc.). */
  onError?: (message: string) => void;
};

export type SchedulerInput = {
  engine: RadioEngine;
  schedule: StationSchedule;
  /** Resolved broadcast duration (usually the actual MP3 length). */
  durationSeconds: number;
  /** Object URL for the commercials recording. */
  adUrl: string;
  cue: CueSheet;
  callbacks?: SchedulerCallbacks;
  options?: Partial<SchedulerOptions>;
};

/**
 * The broadcast scheduler.
 *
 * It watches the running station timeline, waits for a song boundary, fades the
 * music out, plays a random advertisement range (without repeating the last few
 * spots), then fades the music back in at the position the station would have
 * reached had the break not happened — i.e. the station clock keeps running
 * through the commercial.
 */
export class BroadcastScheduler {
  private engine: RadioEngine;
  private schedule: StationSchedule;
  private total: number;
  private adUrl: string;
  private cue: CueSheet;
  private callbacks: SchedulerCallbacks;
  private options: SchedulerOptions;

  private candidates: number[] = [];
  private lastBreakAt = Number.NEGATIVE_INFINITY;
  /** The next break we have chosen and are waiting to execute (committed). */
  private pendingPlan?: BreakPoint;
  private phase: 'idle' | 'running' | 'breaking' = 'idle';
  private pollTimer: number | null = null;
  private breakTimers: number[] = [];

  private adElement?: HTMLAudioElement;
  private adGain?: GainNode;

  constructor(input: SchedulerInput) {
    this.engine = input.engine;
    this.schedule = input.schedule;
    this.total = input.durationSeconds;
    this.adUrl = input.adUrl;
    this.cue = input.cue;
    this.callbacks = input.callbacks ?? {};
    this.options = { ...DEFAULT_SCHEDULER_OPTIONS, ...input.options };
  }

  /** Whether a schedule is safe to interrupt at all. */
  static validate(schedule: StationSchedule, durationSeconds: number, options: SchedulerOptions): boolean {
    return resolveValidDuration(schedule, durationSeconds, options) !== null;
  }

  /** Attempt to begin scheduling. Returns true when the scheduler is running. */
  start(): boolean {
    if (this.phase !== 'idle') return this.phase === 'running';
    if (this.cue.ranges.length === 0) {
      this.callbacks.onError?.('No commercial ranges available to schedule.');
      return false;
    }
    if (this.total <= 0 || !this.schedule.valid) {
      this.callbacks.onError?.('Broadcast schedule is not usable for this station.');
      return false;
    }

    // The ad needs the engine's Web Audio graph to fade against the music.
    if (!this.ensureAdElement()) {
      this.callbacks.onError?.('The audio engine is not ready for ad breaks.');
      return false;
    }

    // Build break boundaries against the real file length so wraps stay in range.
    const resolved = { ...this.schedule, totalSeconds: this.total };
    this.candidates = deriveBreakCandidates(resolved, this.options);
    this.lastBreakAt = Number.NEGATIVE_INFINITY;
    this.pendingPlan = undefined;
    this.phase = 'running';

    this.pollTimer = window.setInterval(() => this.tick(), 250);
    this.tick();
    return true;
  }

  stop(): void {
    if (this.pollTimer !== null) window.clearInterval(this.pollTimer);
    this.pollTimer = null;
    this.clearBreakTimers();
    this.phase = 'idle';
    this.candidates = [];
    this.pendingPlan = undefined;
    this.lastBreakAt = Number.NEGATIVE_INFINITY;
    // Return the station to a normal play state if we paused it mid-break.
    this.adElement?.pause();
    this.engine.setMusicGain(1);
  }

  destroy(): void {
    this.stop();
    if (this.adElement) this.adElement.removeAttribute('src');
  }

  // --- break lifecycle -----------------------------------------------------

  private tick(): void {
    if (this.phase !== 'running') return;
    if (!this.engine.isReady() || !this.engine.isActivePlaying()) return;

    const pos = this.engine.getPosition();
    // When the playback clock wraps past the previous break (long broadcasts
    // loop), reset the break spacing so ad breaks resume in the new loop.
    if (this.lastBreakAt > 0 && pos < this.lastBreakAt) {
      this.lastBreakAt = Number.NEGATIVE_INFINITY;
      this.pendingPlan = undefined;
    }

    // Pick (and commit to) a break only when we don't already have one planned,
    // so a boundary isn't re-derived and lost the moment we near its fade.
    if (!this.pendingPlan) {
      const plan = findBreakPoint(
        { ...this.schedule, totalSeconds: this.total },
        this.candidates,
        pos,
        this.lastBreakAt,
        this.options,
      );
      if (!plan) return;
      this.pendingPlan = plan;
    }

    // If the chosen boundary has already passed (e.g. a seek), discard the plan
    // and let the next tick choose the next future boundary.
    if (pos >= this.pendingPlan.boundary) {
      this.pendingPlan = undefined;
      return;
    }

    // Only begin once we actually reach the fade-out window.
    if (pos < this.pendingPlan.fadeStart) return;

    const plan = this.pendingPlan;
    this.pendingPlan = undefined;
    this.beginBreak(plan);
  }

  private beginBreak(point: BreakPoint): void {
    if (this.phase !== 'running') return;
    this.phase = 'breaking';
    this.pendingPlan = undefined;
    this.clearBreakTimers();

    // Choose an advertisement now, avoiding whatever just played. Cap it to a
    // sensible length so no single spot can silence the station for minutes.
    const adPool = this.cue.ranges.filter(range => range.duration <= this.options.maxAdDuration);
    const ad = pickAdvertisement({ ...this.cue, ranges: adPool }, this.cue.recentIds);
    if (!ad) {
      this.abortBreak('No advertisement is available to schedule.');
      return;
    }

    const fade = this.options.fadeSeconds;
    // Ramp to silence over the time remaining until the boundary so the music is
    // fully out the instant we pause, avoiding a click from an early pause.
    const remaining = Math.max(0, point.boundary - this.engine.getPosition());
    this.engine.fadeMusic(0, Math.max(0.1, Math.min(fade, remaining)));

    const boundaryDelay = Math.max(0, remaining * 1000);
    const song = this.schedule.songs[point.songIndex] ?? {
      index: point.songIndex,
      title: this.schedule.sourceName,
      artist: null,
      start: 0,
      end: this.total,
      duration: this.total,
      isTalk: false,
    };
    this.callbacks.onBreakStart?.(ad, song);

    // At the boundary: pause the music and drop the ad in.
    this.breakTimers.push(window.setTimeout(() => {
      if (this.phase !== 'breaking') return;
      this.engine.pauseActive();
      this.engine.seekActive(point.boundary);
      this.startAd(ad, point.boundary);
    }, boundaryDelay));
  }

  private startAd(ad: CommercialRange, boundary: number): void {
    const element = this.adElement;
    const gain = this.adGain;
    const ctx = this.engine.getContext();
    if (!element || !gain || !ctx) {
      this.abortBreak('Advertisement could not be initialised.');
      return;
    }

    const fade = this.options.fadeSeconds;
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + fade);

    try {
      element.currentTime = ad.start;
      void element.play();
    } catch {
      this.abortBreak('Advertisement could not be played.');
      return;
    }

    const adMillis = ad.duration * 1000;
    // Fade the ad out just before it ends, then resume the station.
    const fadeOutAt = Math.max(0, adMillis - fade * 1000);
    this.breakTimers.push(window.setTimeout(() => {
      if (this.phase !== 'breaking') return;
      const gNow = ctx.currentTime;
      gain.gain.cancelScheduledValues(gNow);
      gain.gain.setValueAtTime(gain.gain.value, gNow);
      gain.gain.linearRampToValueAtTime(0, gNow + fade);
    }, fadeOutAt));

    this.breakTimers.push(window.setTimeout(() => {
      if (this.phase !== 'breaking') return;
      element.pause();
      this.resumeStation(boundary, ad);
    }, adMillis));
  }

  private resumeStation(boundary: number, ad: CommercialRange): void {
    const fade = this.options.fadeSeconds;
    const resumeAt = (boundary + ad.duration) % this.total;

    this.engine.seekActive(resumeAt);
    this.engine.setMusicGain(0);
    this.engine.playActive();
    this.engine.fadeMusic(1, fade);

    this.cue = rememberAd(this.cue, ad.id);
    this.lastBreakAt = boundary;
    this.phase = 'running';
    this.callbacks.onBreakEnd?.(resumeAt);
  }

  private abortBreak(message: string): void {
    this.clearBreakTimers();
    // Put the station back where it would have been and keep playing.
    this.engine.setMusicGain(1);
    this.engine.playActive();
    this.phase = 'idle';
    this.callbacks.onError?.(message);
  }

  // --- wiring --------------------------------------------------------------

  private ensureAdElement(): boolean {
    if (this.adElement && this.adGain) return true;
    const ctx = this.engine.getContext();
    if (!ctx) return false;
    const element = new Audio();
    element.preload = 'auto';
    element.src = this.adUrl;
    const source = ctx.createMediaElementSource(element);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    source.connect(gain).connect(ctx.destination);
    this.adElement = element;
    this.adGain = gain;
    return true;
  }

  private clearBreakTimers(): void {
    this.breakTimers.forEach(timer => window.clearTimeout(timer));
    this.breakTimers = [];
  }

  // --- read-only access for the UI ----------------------------------------

  getCue(): CueSheet {
    return this.cue;
  }

  getPhase(): 'idle' | 'running' | 'breaking' {
    return this.phase;
  }
}
