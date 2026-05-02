const DB = 'suivi-financier';
const V = 1;

const STORES = ['movements', 'recurring', 'flags'];
let db;

export function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, V);
    r.onupgradeneeded = e => {
      const d = e.target.result;
      d.createObjectStore(STORES[0], { keyPath: 'id' }).createIndex('financialMonth', 'financialMonth');
      d.createObjectStore(STORES[1], { keyPath: 'id' });
      d.createObjectStore(STORES[2], { keyPath: 'financialMonth' });
    };
    r.onsuccess = () => (db = r.result, res(db));
    r.onerror = () => rej(r.error);
  });
}

export const add = (s, v) => db.transaction(s, 'readwrite').objectStore(s).add(v);
export const all = s => new Promise(r => {
  const q = db.transaction(s).objectStore(s).getAll();
  q.onsuccess = () => r(q.result);
});
