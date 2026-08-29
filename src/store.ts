import { create } from 'zustand';
import type { LocalTrack } from './types';

type RadioState = {
  selected: number;
  playingStationId?: string;
  tracks: Map<string, LocalTrack[]>;
  status: string;
  select: (index: number, count: number) => void;
  setTracks: (tracks: Map<string, LocalTrack[]>, matched: number) => void;
  setPlaying: (stationId?: string) => void;
};

const initialSelected = Number(localStorage.getItem('radio:selected') || 0);

export const useRadioStore = create<RadioState>((set) => ({
  selected: initialSelected,
  tracks: new Map(),
  status: 'No audio loaded · files stay on your device',
  select: (index, count) => set(() => {
    const selected = (index + count) % count;
    localStorage.setItem('radio:selected', String(selected));
    return { selected };
  }),
  setTracks: (tracks, matched) => set({
    tracks,
    status: `${matched} audio file${matched === 1 ? '' : 's'} matched across ${tracks.size} station${tracks.size === 1 ? '' : 's'}`
  }),
  setPlaying: (playingStationId) => set({ playingStationId })
}));
