import Dexie, { type EntityTable } from 'dexie';
import type { PersistedStation } from './types';

type Setting = { key: string; value: string | number | boolean };
type LibraryEntry = { path: string; stationId: string; name: string; size: number; modified: number };

const db = new Dexie('los-santos-radio') as Dexie & {
  settings: EntityTable<Setting, 'key'>;
  stations: EntityTable<PersistedStation, 'id'>;
  library: EntityTable<LibraryEntry, 'path'>;
};

db.version(1).stores({
  settings: 'key',
  stations: 'id',
  library: 'path, stationId'
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

export { db };
