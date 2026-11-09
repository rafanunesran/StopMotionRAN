/* Armazenamento local (IndexedDB) dos projetos e quadros.
 * projects: { id, owner, ownerName, ownerClass, title, fps, frames: [frameId...], width, height, createdAt, updatedAt }
 * frames:   { id, projectId, blob }
 */
(function () {
  'use strict';

  const DB_NAME = 'stopmotion-ran';
  const DB_VERSION = 1;
  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('projects')) {
          const s = db.createObjectStore('projects', { keyPath: 'id' });
          s.createIndex('owner', 'owner', { unique: false });
        }
        if (!db.objectStoreNames.contains('frames')) {
          const f = db.createObjectStore('frames', { keyPath: 'id' });
          f.createIndex('projectId', 'projectId', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }

  function reqP(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function txDone(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transação abortada'));
    });
  }

  async function store(name, mode) {
    const db = await open();
    return db.transaction(name, mode).objectStore(name);
  }

  const DB = {
    async listProjects(owner) {
      const s = await store('projects', 'readonly');
      const all = await reqP(s.index('owner').getAll(owner));
      return all.sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async getProject(id) {
      const s = await store('projects', 'readonly');
      return reqP(s.get(id));
    },
    async putProject(p) {
      const s = await store('projects', 'readwrite');
      return reqP(s.put(p));
    },
    async deleteProject(id) {
      const db = await open();
      const tx = db.transaction(['projects', 'frames'], 'readwrite');
      tx.objectStore('projects').delete(id);
      const idx = tx.objectStore('frames').index('projectId');
      const keys = await reqP(idx.getAllKeys(id));
      keys.forEach((k) => tx.objectStore('frames').delete(k));
      return txDone(tx);
    },
    async getFrame(id) {
      const s = await store('frames', 'readonly');
      return reqP(s.get(id));
    },
    async putFrame(f) {
      const s = await store('frames', 'readwrite');
      return reqP(s.put(f));
    },
    async deleteFrame(id) {
      const s = await store('frames', 'readwrite');
      return reqP(s.delete(id));
    },
    async listFrameIds(projectId) {
      const s = await store('frames', 'readonly');
      return reqP(s.index('projectId').getAllKeys(projectId));
    },
  };

  window.DB = DB;
})();
