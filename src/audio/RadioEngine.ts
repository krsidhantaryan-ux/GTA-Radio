import type { LocalTrack } from '../types';

/**
 * Two-channel Web Audio player. Alternating channels allows gapless-feeling
 * fades between tracks. The other channels are kept in sync so a queued
 * crossfade never causes a silent gap.
 *
 * The public surface deliberately exposes low-level timeline + gain controls so
 * the broadcast scheduler (see `src/radio/scheduler.ts`) can pause the station,
 * fade it, and pop an advertisement in without changing the engine's clock.
 */
export class RadioEngine {
  private context?: AudioContext;
  private channels: HTMLAudioElement[] = [new Audio(), new Audio()];
  private gains: GainNode[] = [];
  private active = 0;
  private objectUrls = new Set<string>();
  private endedHandler?: () => void;

  constructor() {
    this.channels.forEach(channel => {
      channel.preload = 'metadata';
      channel.addEventListener('ended', () => this.endedHandler?.());
    });
  }

  onEnded(handler: () => void) { this.endedHandler = handler; }

  private async initialise() {
    if (!this.context) {
      this.context = new AudioContext();
      this.gains = this.channels.map(channel => {
        const source = this.context!.createMediaElementSource(channel);
        const gain = this.context!.createGain();
        source.connect(gain).connect(this.context!.destination);
        return gain;
      });
    }
    if (this.context.state === 'suspended') await this.context.resume();
  }

  async tune(track: LocalTrack, liveOffset = 0) {
    await this.initialise();
    const previous = this.active;
    const next = previous === 0 ? 1 : 0;
    const url = URL.createObjectURL(track.file);
    this.objectUrls.add(url);
    const player = this.channels[next];
    player.src = url;
    player.load();
    await new Promise<void>((resolve, reject) => {
      const ready = () => { cleanup(); resolve(); };
      const fail = () => { cleanup(); reject(new Error('Unsupported or unreadable audio file')); };
      const cleanup = () => { player.removeEventListener('loadedmetadata', ready); player.removeEventListener('error', fail); };
      player.addEventListener('loadedmetadata', ready);
      player.addEventListener('error', fail);
    });
    if (Number.isFinite(player.duration) && player.duration > 0) player.currentTime = liveOffset % player.duration;
    const now = this.context!.currentTime;
    this.gains[next].gain.setValueAtTime(0, now);
    this.gains[next].gain.linearRampToValueAtTime(1, now + .24);
    this.gains[previous].gain.cancelScheduledValues(now);
    this.gains[previous].gain.setValueAtTime(this.gains[previous].gain.value, now);
    this.gains[previous].gain.linearRampToValueAtTime(0, now + .18);
    await player.play();
    window.setTimeout(() => this.channels[previous].pause(), 260);
    this.active = next;
  }

  stop() {
    this.channels.forEach(channel => channel.pause());
  }

  setVolume(volume: number) {
    this.channels.forEach(channel => { channel.volume = Math.max(0, Math.min(1, volume)); });
  }

  destroy() {
    this.stop();
    this.objectUrls.forEach(URL.revokeObjectURL);
    this.objectUrls.clear();
    void this.context?.close();
  }

  // --------------------------------------------------------------------------
  // Broadcast-scheduler control surface
  // --------------------------------------------------------------------------

  /** Underlying Web Audio context (needed to wire an extra ad channel). */
  getContext(): AudioContext | null {
    return this.context ?? null;
  }

  /** The audio element currently carrying the station's timeline. */
  getActiveChannel(): HTMLAudioElement {
    return this.channels[this.active];
  }

  /** The gain node feeding the active channel, used for fades. */
  getActiveGain(): GainNode | null {
    return this.gains[this.active] ?? null;
  }

  /** Current playback position in the station file, seconds. */
  getPosition(): number {
    return this.channels[this.active].currentTime;
  }

  /** Duration of the current station file, seconds (0 before metadata loads). */
  getDuration(): number {
    return this.channels[this.active].duration;
  }

  isActivePlaying(): boolean {
    const channel = this.channels[this.active];
    return !channel.paused && !channel.ended;
  }

  pauseActive(): void {
    this.channels[this.active].pause();
  }

  playActive(): void {
    void this.channels[this.active].play();
  }

  /**
   * Jump the active channel to an absolute position. Positive values wrap into
   * the file duration (so a long broadcast stays seamless, like `liveOffset`).
   */
  seekActive(offset: number): void {
    const channel = this.channels[this.active];
    const duration = channel.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    channel.currentTime = ((offset % duration) + duration) % duration;
  }

  /**
   * Smoothly ramp the active channel's gain to `target` over `seconds`.
   * Safe to call repeatedly (each call cancels prior scheduled values).
   */
  fadeMusic(target: number, seconds: number): void {
    const gain = this.getActiveGain();
    if (!gain || !this.context) return;
    const now = this.context.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(Math.max(0, gain.gain.value), now);
    gain.gain.linearRampToValueAtTime(Math.max(0, Math.min(1, target)), now + seconds);
  }

  /** Hard-set the active gain without ramping (used to avoid a fade on reset). */
  setMusicGain(value: number): void {
    const gain = this.getActiveGain();
    if (!gain || !this.context) return;
    gain.gain.cancelScheduledValues(this.context.currentTime);
    gain.gain.setValueAtTime(Math.max(0, Math.min(1, value)), this.context.currentTime);
  }

  /** True when the context exists and the active channel has real media. */
  isReady(): boolean {
    return this.context !== null && Number.isFinite(this.channels[this.active].duration) && this.channels[this.active].duration > 0;
  }
}
