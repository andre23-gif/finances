// db.js
const DB_NAME = 'suivi-financier';
const DB_VERSION = 2;

const STORE_MOVEMENTS = 'movements';
const STORE_RECURRING = 'recurring';
const STORE_FLAGS = 'flags';

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      // movements
      if (!db.objectStoreNames.contains(STORE_MOVEMENTS)) {
        const s = db.createObjectStore(STORE_MOVEMENTS, { keyPath: 'id' });
        s.createIndex('financialMonth', 'financialMonth', { unique: false });
        s.createIndex('account', 'account', { unique: false });
        s.createIndex('type', 'type', { unique: false });
      } else {
        const s = e.target.transaction.objectStore(STORE_MOVEMENTS);
        if (!s.indexNames.contains('financialMonth')) s.createIndex('financialMonth', 'financialMonth', { unique: false });
        if (!s.indexNames.contains('account')) s.createIndex('account', 'account', { unique: false });
        if (!s.indexNames.contains('type')) s.createIndex('type', 'type', { unique: false });
      }

      // recurring
      if (!db.objectStoreNames.contains(STORE_RECURRING)) {
        const s = db.createObjectStore(STORE_RECURRING, { keyPath: 'id' });
        s.createIndex('active', 'active', { unique: false });
        s.createIndex('account', 'account', { unique: false });
      } else {
        const s = e.target.transaction.objectStore(STORE_RECURRING);
        if (!s.indexNames.contains('active')) s.createIndex('active', 'active', { unique: false });
        if (!s.indexNames.contains('account')) s.createIndex('account', 'account', { unique: false });
      }

      // flags
      if (!db.objectStoreNames.contains(STORE_FLAGS)) {
        db.createObjectStore(STORE_FLAGS, { keyPath: 'financialMonth' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  return dbPromise;
}

async function store(name, mode = 'readonly') {
  const db = await openDB();
  return db.transaction(name, mode).objectStore(name);
}

export async function addItem(storeName, value) {
  const s = await store(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const r = s.add(value);
    r.onsuccess = () => resolve(true);
    r.onerror = () => reject(r.error);
  });
}

export async function putItem(storeName, value) {
  const s = await store(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const r = s.put(value);
    r.onsuccess = () => resolve(true);
    r.onerror = () => reject(r.error);
  });
}

export async function deleteItem(storeName, key) {
  const s = await store(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const r = s.delete(key);
    r.onsuccess = () => resolve(true);
    r.onerror = () => reject(r.error);
  });
}

export async function getAll(storeName) {
  const s = await store(storeName, 'readonly');
  return new Promise((resolve, reject) => {
    const r = s.getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}

export async function getByIndex(storeName, indexName, value) {
  const s = await store(storeName, 'readonly');
  const idx = s.index(indexName);
  return new Promise((resolve, reject) => {
    const r = idx.getAll(value);
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = () => reject(r.error);
  });
}

export const STORES = { STORE_MOVEMENTS, STORE_RECURRING, STORE_FLAGS };
