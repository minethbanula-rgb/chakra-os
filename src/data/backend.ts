import type { CollectionName, Collections, ID, Snapshot, Workspace } from './types';
import { COLLECTIONS } from './types';

export interface RecordWrite { col: CollectionName; rec: Collections[CollectionName] }

/** Where data lives. The store is the same in local and cloud mode. */
export interface Backend {
  kind: 'local' | 'cloud';
  load(): Promise<Snapshot | null>;
  saveRecords(writes: RecordWrite[]): Promise<void>;
  saveWorkspace(ws: Workspace): Promise<void>;
  saveMeta(meta: { meId: ID | null }): Promise<void>;
  replaceAll(snap: Snapshot): Promise<void>;
  subscribe?(onRecord: (col: CollectionName, rec: Collections[CollectionName]) => void, onWorkspace: (ws: Workspace) => void): () => void;
}

export const LOCAL_KEY = 'chakra-studio-os-v2';

/** Browser-only storage. Saves are debounced; other tabs pick up changes. */
export function localBackend(storage: Storage = localStorage): Backend {
  let snap: Snapshot | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    if (!snap) return;
    try {
      storage.setItem(LOCAL_KEY, JSON.stringify(snap));
    } catch {
      window.dispatchEvent(new CustomEvent('chakra:toast', { detail: { text: 'Browser storage is full. Export a backup from Settings.', tone: 'danger' } }));
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(flush, 250);
  };
  if (typeof window !== 'undefined') window.addEventListener('beforeunload', flush);

  return {
    kind: 'local',
    async load() {
      const raw = storage.getItem(LOCAL_KEY);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as Snapshot;
        if (parsed.schema !== 2) return null;
        for (const c of COLLECTIONS) parsed.tables[c] ??= {} as never;
        snap = parsed;
        return parsed;
      } catch {
        return null;
      }
    },
    async saveRecords(writes) {
      if (!snap) return;
      for (const w of writes) (snap.tables[w.col] as Record<ID, unknown>)[w.rec.id] = w.rec;
      schedule();
    },
    async saveWorkspace(ws) {
      if (!snap) return;
      snap.workspace = ws;
      schedule();
    },
    async saveMeta(meta) {
      if (!snap) return;
      snap.meId = meta.meId;
      schedule();
    },
    async replaceAll(next) {
      snap = structuredClone(next);
      flush();
    },
    subscribe(onRecord, onWorkspace) {
      const handler = (e: StorageEvent) => {
        if (e.key !== LOCAL_KEY || !e.newValue) return;
        const next = JSON.parse(e.newValue) as Snapshot;
        snap = next;
        onWorkspace(next.workspace);
        for (const c of COLLECTIONS) for (const rec of Object.values(next.tables[c] ?? {})) onRecord(c, rec as Collections[CollectionName]);
      };
      window.addEventListener('storage', handler);
      return () => window.removeEventListener('storage', handler);
    },
  };
}
