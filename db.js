// db.js — contrat stable pour toute l’app (IndexedDB)

const DB_NAME = 'suivi-financier';
const DB_VERSION = 1;

export const STORES = {
  MOVEMENTS: 'movements',
  RECURRING: 'recurring',
  FLAGS: 'flags'
};

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      // Store: movements
      if (!db.objectStoreNames.contains(STORES.MOVEMENTS)) {
        const s = db.createObjectStore(STORES.MOVEMENTS, { keyPath: 'id' });
        s.createIndex('financialMonth', 'financialMonth', { unique: false });
        s.createIndex('account', 'account', { unique: false });
        s.createIndex('type', 'type', { unique: false });
      }

      // Store: recurring (templates)
      if (!db.objectStoreNames.contains(STORES.RECURRING)) {
        const s = db.createObjectStore(STORES.RECURRING, { keyPath: 'id' });
        s.createIndex('active', 'active', { unique: false });
        s.createIndex('account', 'account', { unique: false });
      }

      // Store: flags (anti-doublon par mois budgétaire)
      if (!db.objectStoreNames.contains(STORES.FLAGS)) {
        db.createObjectStore(STORES.FLAGS, { keyPath: 'financialMonth' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

async function getStore(storeName, mode = 'readonly') {
  const db = await openDB();
  return db.transaction(storeName, mode).objectStore(storeName);
}

export async function add(storeName, value) {
  const s = await getStore(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const r = s.add(value);
    r.onsuccess = () => resolve(true);
    r.onerror = () => reject(r.error);
  });
}

export async function put(storeName, value) {
  const s = await getStore(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const r = s.put(value);
    r.onsuccess = () => resolve(true);
    r.onerror = () => reject(r.error);
  });
}

export async function del(storeName, key) {
  const s = await getStore(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const r = s.delete(key);
    r.onsuccess = () => resolve(true);
    r.onerror = () => reject(r.error);
  });
}

export async function all(storeName) {
  const s = await getStore(storeName, 'readonly');
  return new Promise((resolve, reject) => {
    const r = s.getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}

export async function byIndex(storeName, indexName, value) {
  const s = await getStore(storeName, 'readonly');
  const idx = s.index(indexName);
  return new Promise((resolve, reject) => {
    const r = idx.getAll(value);
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}
