export type Station = {
  id: string;
  name: string;
  short: string;
  mark: string;
  color: string;
  genre: string;
  aliases: string[];
  logo?: string;
};

export type LocalTrack = {
  id: string;
  stationId: string;
  name: string;
  path: string;
  file: File;
};

export type PersistedStation = {
  id: string;
  selectedAt: number;
  duration?: number;
};
