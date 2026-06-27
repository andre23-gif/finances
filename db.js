// db.js — contrat stable pour toute l'app (IndexedDB)

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

      if (!db.objectStoreNames.contains(STORES.MOVEMENTS)) {
        const s = db.createObjectStore(STORES.MOVEMENTS, { keyPath: 'id' });
        s.createIndex('financialMonth', 'financialMonth', { unique: false });
        s.createIndex('account', 'account', { unique: false });
        s.createIndex('type', 'type', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.RECURRING)) {
        const s = db.createObjectStore(STORES.RECURRING, { keyPath: 'id' });
        s.createIndex('active', 'active', { unique: false });
        s.createIndex('account', 'account', { unique: false });
      }

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

/* ==================== Opérations unitaires ==================== */

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

/* ==================== Opérations atomiques (batch) ==================== */

/**
 * Insère plusieurs enregistrements dans un même store en UNE SEULE transaction.
 * Atomique : soit tous les items passent, soit aucun (rollback automatique).
 *
 * @param {string} storeName
 * @param {Array}  items  - objets à insérer (add — échoue si id déjà présent)
 */
export async function addMany(storeName, items) {
  if (!items.length) return;
  const db = await openDB();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);

  return new Promise((resolve, reject) => {
    let lastError = null;
    items.forEach(item => {
      const r = store.add(item);
      r.onerror = () => { lastError = r.error; };
    });
    tx.oncomplete = () => resolve(true);
    tx.onerror   = () => reject(lastError || tx.error);
    tx.onabort   = () => reject(lastError || tx.error);
  });
}

/**
 * Insère ou remplace plusieurs enregistrements en UNE SEULE transaction.
 * Atomique : soit tous les items passent, soit aucun.
 * Contrairement à addMany, ne plante pas si un id existe déjà (put = upsert).
 *
 * @param {string} storeName
 * @param {Array}  items  - objets à insérer/mettre à jour
 */
export async function putMany(storeName, items) {
  if (!items.length) return;
  const db = await openDB();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);

  return new Promise((resolve, reject) => {
    let lastError = null;
    items.forEach(item => {
      const r = store.put(item);
      r.onerror = () => { lastError = r.error; };
    });
    tx.oncomplete = () => resolve(true);
    tx.onerror   = () => reject(lastError || tx.error);
    tx.onabort   = () => reject(lastError || tx.error);
  });
}

/**
 * Vide entièrement un store puis réinsère les items fournis,
 * le tout en UNE SEULE transaction atomique.
 * Utilisé par l'import JSON pour garantir que la base n'est jamais
 * à moitié vidée / à moitié remplie en cas d'erreur.
 *
 * @param {string} storeName
 * @param {Array}  items  - nouveaux enregistrements
 */
export async function replaceAll(storeName, items) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);

  return new Promise((resolve, reject) => {
    store.clear();
    items.forEach(item => store.put(item));
    tx.oncomplete = () => resolve(true);
    tx.onerror   = () => reject(tx.error);
    tx.onabort   = () => reject(tx.error);
  });
}
