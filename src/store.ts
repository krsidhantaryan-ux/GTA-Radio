import { create } from 'zustand';
import type { CueSheet, StationSchedule } from './radio/types';
import type { LocalTrack } from './types';

type RadioState = {
  selected: number;
  playingStationId?: string;
  tracks: Map<string, LocalTrack[]>;
  status: string;
  /** Normalised song timestamps for stations that have them, keyed by station id. */
  schedules: Map<string, StationSchedule>;
  /** Cue sheet from `GTA V Radio Commercials.mp3` (ranges + recency). */
  cue?: CueSheet;
  /** Whether broadcast scheduling / ad breaks are enabled. */
  advertising: boolean;
  /** Name of the commercials file currently loaded (for the UI). */
  commercialsName: string;
  /** Human-readable scheduler status line. */
  scheduleStatus: string;
  select: (index: number, count: number) => void;
  setTracks: (tracks: Map<string, LocalTrack[]>, matched: number) => void;
  setPlaying: (stationId?: string) => void;
  setSchedules: (schedules: StationSchedule[]) => void;
  setCue: (cue?: CueSheet) => void;
  setAdvertising: (enabled: boolean) => void;
  setCommercialsName: (name: string) => void;
  setScheduleStatus: (status: string) => void;
};

const initialSelected = Number(localStorage.getItem('radio:selected') || 0);
const initialAdvertising = localStorage.getItem('radio:advertising') === '1';

export const useRadioStore = create<RadioState>((set) => ({
  selected: initialSelected,
  tracks: new Map(),
  status: 'No audio loaded · files stay on your device',
  schedules: new Map(),
  cue: undefined,
  advertising: initialAdvertising,
  commercialsName: '',
  scheduleStatus: 'No advertisements loaded',
  select: (index, count) => set(() => {
    const selected = (index + count) % count;
    localStorage.setItem('radio:selected', String(selected));
    return { selected };
  }),
  setTracks: (tracks, matched) => set({
    tracks,
    status: `${matched} audio file${matched === 1 ? '' : 's'} matched across ${tracks.size} station${tracks.size === 1 ? '' : 's'}`
  }),
  setPlaying: (playingStationId) => set({ playingStationId }),
  setSchedules: (schedules) => {
    const map = new Map<string, StationSchedule>();
    for (const schedule of schedules) {
      const existing = map.get(schedule.stationId);
      if (!existing || schedule.songs.length > existing.songs.length) map.set(schedule.stationId, schedule);
    }
    set({
      schedules: map,
      scheduleStatus: `${map.size} station${map.size === 1 ? '' : 's'} ready for ad breaks`
    });
  },
  setCue: (cue) => set({
    cue,
    commercialsName: cue?.name ?? '',
    scheduleStatus: cue
      ? `${cue.ranges.length} advertisement${cue.ranges.length === 1 ? '' : 's'} in “${cue.name}”`
      : 'No advertisements loaded'
  }),
  setAdvertising: (enabled) => {
    localStorage.setItem('radio:advertising', enabled ? '1' : '0');
    set({ advertising: enabled });
  },
  setCommercialsName: (name) => set({ commercialsName: name }),
  setScheduleStatus: (status) => set({ scheduleStatus: status })
}));
