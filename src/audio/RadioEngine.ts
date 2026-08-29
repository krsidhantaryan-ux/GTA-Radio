import type { LocalTrack } from '../types';

/** Two-channel Web Audio player. Alternating channels allows gapless-feeling fades. */
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
}
