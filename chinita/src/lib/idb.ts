import { openDB } from "idb";
import type { IDBPDatabase } from "idb";

const DB_NAME = "eyebot";
const DB_VERSION = 1;

let _db: IDBPDatabase | null = null;

async function getDB(): Promise<IDBPDatabase> {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("qcache")) db.createObjectStore("qcache");
      if (!db.objectStoreNames.contains("syncQueue")) {
        db.createObjectStore("syncQueue", { autoIncrement: true });
      }
    },
  });
  return _db;
}

export const idbStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const db = await getDB();
      const val = await db.get("qcache", key);
      return val ?? null;
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      const db = await getDB();
      await db.put("qcache", value, key);
    } catch {}
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      const db = await getDB();
      await db.delete("qcache", key);
    } catch {}
  },
};

export async function queueSyncPayload(payload: unknown): Promise<void> {
  try {
    const db = await getDB();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.add("syncQueue" as any, payload);
  } catch {}
}
