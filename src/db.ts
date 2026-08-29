import Dexie, { type EntityTable } from 'dexie';
import type { PersistedStation } from './types';

type Setting = { key: string; value: string | number | boolean };
type LibraryEntry = { path: string; stationId: string; name: string; size: number; modified: number };
/** JSON-serialisable metadata records for the broadcast scheduler. */
type SchedulerEntry = { key: string; json: string };

const db = new Dexie('los-santos-radio') as Dexie & {
  settings: EntityTable<Setting, 'key'>;
  stations: EntityTable<PersistedStation, 'id'>;
  library: EntityTable<LibraryEntry, 'path'>;
  scheduler: EntityTable<SchedulerEntry, 'key'>;
};

db.version(1).stores({
  settings: 'key',
  stations: 'id',
  library: 'path, stationId'
});

db.version(2).stores({
  settings: 'key',
  stations: 'id',
  library: 'path, stationId',
  scheduler: 'key'
});

export async function rememberLibrary(entries: LibraryEntry[]) {
  await db.transaction('rw', db.library, async () => {
    await db.library.clear();
    await db.library.bulkPut(entries);
  });
}

export async function saveSetting(key: string, value: Setting['value']) {
  await db.settings.put({ key, value });
}

export async function loadSetting<T>(key: string): Promise<T | undefined> {
  const entry = await db.settings.get(key);
  return entry?.value as T | undefined;
}

/** Persist a scheduler metadata record (e.g. the imported station timestamps). */
export async function saveSchedulerEntry(key: string, json: string) {
  await db.scheduler.put({ key, json });
}

export async function loadSchedulerEntries(): Promise<SchedulerEntry[]> {
  return db.scheduler.toArray();
}

export async function clearSchedulerEntries() {
  await db.scheduler.clear();
}

export { db };
