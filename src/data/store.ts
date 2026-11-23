import { create } from 'zustand';
import type { Base, CollectionName, Collections, Draft, ID, Snapshot, Tables, Workspace } from './types';
import { COLLECTIONS } from './types';
import type { Backend } from './backend';

export const uid = (): ID =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
const stamp = () => new Date().toISOString();

export function emptyTables(): Tables {
  return Object.fromEntries(COLLECTIONS.map((c) => [c, {}])) as unknown as Tables;
}

export function defaultWorkspace(): Workspace {
  return {
    id: uid(), name: 'My Studio', ownerName: '', email: '', address: '', website: '', currency: 'USD',
    cycleStartDay: 1, taxDefault: 0, invoicePrefix: 'INV-', monthlyTargetMinor: 0, logo: null,
    digestTime: '08:30', autoReminders: false, weekStartsOn: 1, fxUsd: 300, fxUpdatedAt: null, theme: 'dark', onboarded: false,
  };
}

type AnyRec = Collections[CollectionName];
interface Change { col: CollectionName; before: AnyRec | null; after: AnyRec }
interface UndoEntry { label: string; changes: Change[]; workspaceBefore?: Workspace }

export type SyncState = { status: 'idle' | 'saving' | 'error' | 'offline'; message?: string };

interface State extends Snapshot {
  ready: boolean;
  backend: Backend | null;
  sync: SyncState;
  undoStack: UndoEntry[];
  /** Active batch collects changes so a multi-record action undoes as one. */
  _batch: Change[] | null;
}

export const useStore = create<State>(() => ({
  schema: 2,
  workspace: defaultWorkspace(),
  tables: emptyTables(),
  meId: null,
  ready: false,
  backend: null,
  sync: { status: 'idle' },
  undoStack: [],
  _batch: null,
}));

const get = () => useStore.getState();
const set = useStore.setState;

/* ---------- lifecycle ---------- */

export async function initStore(backend: Backend) {
  const loaded = await backend.load();
  const snap: Snapshot = loaded ?? { schema: 2, workspace: defaultWorkspace(), tables: emptyTables(), meId: null };
  if (!loaded) await backend.replaceAll(snap);
  set({ backend, ready: true, ...snap });
  backend.subscribe?.((col, rec) => {
    set((s) => ({ tables: { ...s.tables, [col]: { ...s.tables[col], [rec.id]: rec } } as Tables }));
  }, (ws) => set({ workspace: ws }));
}

export function snapshot(): Snapshot {
  const s = get();
  return { schema: 2, workspace: s.workspace, tables: s.tables, meId: s.meId };
}

export async function replaceSnapshot(snap: Snapshot) {
  set({ workspace: snap.workspace, tables: snap.tables, meId: snap.meId, undoStack: [] });
  await persist(() => get().backend?.replaceAll(snap));
}

/* ---------- persistence ---------- */

let inflight = 0;
async function persist(fn: () => Promise<void> | undefined) {
  inflight++;
  set({ sync: { status: 'saving' } });
  try {
    await fn();
    inflight--;
    if (!inflight) set({ sync: { status: 'idle' } });
  } catch (e) {
    inflight--;
    const message = e instanceof Error ? e.message : String(e);
    set({ sync: { status: navigator.onLine === false ? 'offline' : 'error', message } });
    window.dispatchEvent(new CustomEvent('chakra:toast', { detail: { text: `Not saved: ${message}`, tone: 'danger' } }));
  }
}

function writeRecords(changes: Change[]) {
  set((s) => {
    const tables = { ...s.tables } as Tables;
    for (const c of changes) {
      (tables as Record<string, Record<ID, AnyRec>>)[c.col] = { ...tables[c.col], [c.after.id]: c.after };
    }
    return { tables };
  });
  const b = get().backend;
  if (b) void persist(() => b.saveRecords(changes.map((c) => ({ col: c.col, rec: c.after }))));
}

function record(changes: Change[], label?: string) {
  const s = get();
  if (s._batch) { s._batch.push(...changes); writeRecords(changes); return; }
  writeRecords(changes);
  if (label) set({ undoStack: [...s.undoStack.slice(-19), { label, changes }] });
}

/** Group several mutations so they save together and undo as one step. */
export function batch<T>(label: string, fn: () => T): T {
  const outer = get()._batch;
  if (outer) return fn();
  set({ _batch: [] });
  try {
    return fn();
  } finally {
    const changes = get()._batch ?? [];
    set((s) => ({ _batch: null, undoStack: changes.length ? [...s.undoStack.slice(-19), { label, changes }] : s.undoStack }));
  }
}

/* ---------- generic CRUD ---------- */

export function createRecord<K extends CollectionName>(col: K, draft: Draft<K>, label?: string): Collections[K] {
  const t = stamp();
  const rec = { ...draft, id: draft.id ?? uid(), createdAt: t, updatedAt: t, deletedAt: null } as unknown as Collections[K];
  record([{ col, before: null, after: rec }], label);
  return rec;
}

export function updateRecord<K extends CollectionName>(col: K, id: ID, patch: Partial<Collections[K]>, label?: string) {
  const before = get().tables[col][id] as Collections[K] | undefined;
  if (!before) return;
  const changed = Object.keys(patch).some((k) => (before as unknown as Record<string, unknown>)[k] !== (patch as Record<string, unknown>)[k]);
  if (!changed) return;
  const after = { ...before, ...patch, updatedAt: stamp() } as Collections[K];
  record([{ col, before, after }], label);
}

export function removeRecord(col: CollectionName, id: ID, label?: string) {
  const before = get().tables[col][id];
  if (!before || before.deletedAt) return;
  record([{ col, before, after: { ...before, deletedAt: stamp(), updatedAt: stamp() } as AnyRec }], label);
}

export function restoreRecord(col: CollectionName, id: ID) {
  const before = get().tables[col][id];
  if (!before) return;
  record([{ col, before, after: { ...before, deletedAt: null, updatedAt: stamp() } as AnyRec }], 'Restore');
}

export function updateWorkspace(patch: Partial<Workspace>) {
  const ws = { ...get().workspace, ...patch };
  set({ workspace: ws });
  const b = get().backend;
  if (b) void persist(() => b.saveWorkspace(ws));
}

export function setMe(id: ID | null) {
  set({ meId: id });
  const b = get().backend;
  if (b) void persist(() => b.saveMeta({ meId: id }));
}

export function undo(): string | null {
  const s = get();
  const last = s.undoStack.at(-1);
  if (!last) return null;
  set({ undoStack: s.undoStack.slice(0, -1) });
  const t = stamp();
  const reverts: Change[] = [...last.changes].reverse().map((c) => {
    const current = get().tables[c.col][c.after.id] ?? c.after;
    const restored = c.before
      ? ({ ...c.before, updatedAt: t } as AnyRec)
      : ({ ...current, deletedAt: t, updatedAt: t } as AnyRec);
    return { col: c.col, before: current, after: restored };
  });
  writeRecords(reverts);
  return last.label;
}

export type { Base };
