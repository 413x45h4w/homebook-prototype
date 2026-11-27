const DB_NAME = 'homebook.audio';
const STORE = 'clips';

export interface StoredClip {
  blob: Blob;
  mimeType: string;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open audio storage.'));
  });
}

export async function saveClip(id: string, blob: Blob, mimeType: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put({ blob, mimeType } satisfies StoredClip, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not save the recording.'));
  });
  db.close();
}

export async function loadClip(id: string): Promise<StoredClip | null> {
  const db = await openDb();
  const clip = await new Promise<StoredClip | null>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(id);
    request.onsuccess = () => resolve((request.result as StoredClip | undefined) ?? null);
    request.onerror = () => reject(request.error ?? new Error('Could not read the recording.'));
  });
  db.close();
  return clip;
}

export async function clearClips(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not clear recordings.'));
  });
  db.close();
}
