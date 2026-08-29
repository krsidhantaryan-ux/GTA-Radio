import { stations } from './stations';
import type { LocalTrack } from './types';
import { rememberLibrary } from './db';

const audioPattern = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus|webm)$/i;
const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function matchStation(path: string) {
  const value = normalise(path);
  return stations.slice(0, -1).find(station => station.aliases.some(alias => value.includes(normalise(alias))));
}

export async function importFiles(files: File[]) {
  const tracks = new Map<string, LocalTrack[]>();
  const metadata: { path: string; stationId: string; name: string; size: number; modified: number }[] = [];
  files.filter(file => audioPattern.test(file.name)).forEach((file, index) => {
    const path = file.webkitRelativePath || file.name;
    const station = matchStation(path);
    if (!station) return;
    const track = { id: `${path}:${file.lastModified}:${index}`, stationId: station.id, name: file.name, path, file };
    const list = tracks.get(station.id) ?? [];
    list.push(track);
    tracks.set(station.id, list);
    metadata.push({ path, stationId: station.id, name: file.name, size: file.size, modified: file.lastModified });
  });
  tracks.forEach(list => list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })));
  await rememberLibrary(metadata);
  return { tracks, matched: metadata.length };
}

export function displayTrackName(name: string) {
  return name.replace(/\.[^.]+$/, '').replace(/^\d+[\s._-]*/, '').replace(/[_-]+/g, ' ');
}
