/* Supabase backend: one table per collection, per-record upserts, realtime, offline queue. */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Backend, RecordWrite } from './backend';
import type { CollectionName, Collections, ID, Snapshot, Tables, Workspace } from './types';
import { COLLECTIONS } from './types';
import { emptyTables } from './store';

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
export const cloudConfigured = !!(URL && KEY);
export const supabase: SupabaseClient | null = cloudConfigured ? createClient(URL!, KEY!, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } }) : null;

export const TABLE: Record<CollectionName, string> = {
  members: 'members', clients: 'clients', contacts: 'contacts', projects: 'projects', milestones: 'milestones', tasks: 'tasks',
  checklist: 'checklist_items', invoices: 'invoices', invoiceItems: 'invoice_items', payments: 'payments', transactions: 'transactions',
  subscriptions: 'subscriptions', portalLinks: 'portal_links', templates: 'templates', activity: 'activity',
};
const COL_BY_TABLE = Object.fromEntries(Object.entries(TABLE).map(([k, v]) => [v, k])) as Record<string, CollectionName>;
const MONEY: CollectionName[] = ['invoices', 'invoiceItems', 'payments', 'transactions', 'subscriptions', 'portalLinks'];

const toSnake = (s: string) => s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

export async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function toRow(col: CollectionName, rec: Record<string, unknown>, workspaceId: ID) {
  const row: Record<string, unknown> = { workspace_id: workspaceId };
  for (const [k, v] of Object.entries(rec)) row[toSnake(k)] = v;
  if (col === 'portalLinks') {
    const token = String(rec.token ?? '');
    if (token) row.token_hash = await sha256Hex(token);
    delete row.token; // only the fingerprint leaves the browser
  }
  return row;
}

function fromRow(col: CollectionName, row: Record<string, unknown>) {
  const rec: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'workspace_id' || k === 'user_id' || k === 'token_hash' || k === 'last_reminder_at' || k === 'digest') continue;
    rec[toCamel(k)] = typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) && ['qty', 'tax_rate', 'advance_pct', 'amount_minor', 'rate_minor', 'budget_minor'].includes(k) ? Number(v) : v;
  }
  if (col === 'portalLinks') rec.token = '';
  return rec as unknown as Collections[CollectionName];
}

const WS_FIELDS: (keyof Workspace)[] = ['name', 'ownerName', 'email', 'address', 'website', 'currency', 'cycleStartDay', 'taxDefault', 'invoicePrefix', 'monthlyTargetMinor', 'logo', 'digestTime', 'autoReminders', 'weekStartsOn', 'fxUsd', 'fxUpdatedAt', 'theme', 'onboarded'];
function wsFromRow(row: Record<string, unknown>): Workspace {
  const ws: Record<string, unknown> = { id: row.id };
  for (const f of WS_FIELDS) ws[f] = row[toSnake(f)];
  ws.digestTime = String(row.digest_time ?? '08:30').slice(0, 5);
  ws.taxDefault = Number(row.tax_default ?? 0);
  ws.fxUsd = Number(row.fx_usd ?? 0);
  ws.monthlyTargetMinor = Number(row.monthly_target_minor ?? 0);
  return ws as unknown as Workspace;
}
function wsToRow(ws: Workspace) {
  const row: Record<string, unknown> = {};
  for (const f of WS_FIELDS) row[toSnake(f)] = ws[f];
  return row;
}

const CACHE = (ws: ID) => `chakra-cloud-cache-${ws}`;
const QUEUE = (ws: ID) => `chakra-cloud-queue-${ws}`;

async function fetchAll(sb: SupabaseClient, table: string, ws: ID) {
  const out: Record<string, unknown>[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select('*').eq('workspace_id', ws).range(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export function cloudBackend(workspaceId: ID, userId: ID, role: 'owner' | 'admin' | 'member', client: SupabaseClient | null = supabase): Backend {
  const sb = client!;
  const collections = role === 'member' ? COLLECTIONS.filter((c) => !MONEY.includes(c)) : COLLECTIONS;
  let queue: RecordWrite[] = JSON.parse(localStorage.getItem(QUEUE(workspaceId)) || '[]');
  let cache: Snapshot | null = null;
  const saveQueue = () => localStorage.setItem(QUEUE(workspaceId), JSON.stringify(queue));
  const saveCache = () => { if (cache) try { localStorage.setItem(CACHE(workspaceId), JSON.stringify(cache)); } catch { /* quota */ } };

  async function push(writes: RecordWrite[]) {
    // Last write per record wins; tables go in dependency order.
    const latest = new Map<string, RecordWrite>();
    for (const w of writes) latest.set(`${w.col}:${w.rec.id}`, w);
    for (const col of COLLECTIONS) {
      const rows = await Promise.all([...latest.values()].filter((w) => w.col === col).map((w) => toRow(col, w.rec as unknown as Record<string, unknown>, workspaceId)));
      if (!rows.length) continue;
      const { error } = await sb.from(TABLE[col]).upsert(rows, { onConflict: 'id' });
      if (error) throw new Error(error.message);
    }
  }

  async function flushQueue() {
    if (!queue.length || !navigator.onLine) return;
    const pending = queue;
    try {
      await push(pending);
      queue = queue.slice(pending.length);
      saveQueue();
    } catch { /* keep for next try */ }
  }
  window.addEventListener('online', () => void flushQueue());
  setInterval(() => void flushQueue(), 30_000);

  return {
    kind: 'cloud',
    async load() {
      try {
        const { data: wsRow, error } = await sb.from('workspaces').select('*').eq('id', workspaceId).single();
        if (error) throw error;
        const tables = emptyTables();
        await Promise.all(collections.map(async (col) => {
          const rows = await fetchAll(sb, TABLE[col], workspaceId);
          const map = tables[col] as Record<ID, Collections[CollectionName]>;
          for (const r of rows) map[String(r.id)] = fromRow(col, r);
        }));
        const me = Object.values(tables.members).find((m) => (m as unknown as { userId?: string }).userId === userId);
        const { data: meRow } = await sb.from('members').select('id').eq('workspace_id', workspaceId).eq('user_id', userId).is('deleted_at', null).maybeSingle();
        cache = { schema: 2, workspace: wsFromRow(wsRow), tables, meId: (meRow?.id as string) ?? me?.id ?? null };
        // Re-apply writes that never reached the server.
        for (const w of queue) (cache.tables[w.col] as Record<ID, unknown>)[w.rec.id] = w.rec;
        saveCache();
        void flushQueue();
        return cache;
      } catch (e) {
        const raw = localStorage.getItem(CACHE(workspaceId));
        if (raw) { cache = JSON.parse(raw) as Snapshot; return cache; }
        throw e;
      }
    },
    async saveRecords(writes) {
      if (cache) { for (const w of writes) (cache.tables[w.col] as Record<ID, unknown>)[w.rec.id] = w.rec; saveCache(); }
      try {
        if (!navigator.onLine) throw new Error('offline');
        await flushQueue();
        await push(writes);
      } catch (e) {
        queue.push(...writes);
        saveQueue();
        if ((e as Error).message === 'offline' || !navigator.onLine) throw new Error('You are offline. Changes will sync when you reconnect.');
        throw e;
      }
    },
    async saveWorkspace(ws) {
      if (cache) { cache.workspace = ws; saveCache(); }
      const { error } = await sb.from('workspaces').update(wsToRow(ws)).eq('id', workspaceId);
      if (error) throw new Error(error.message);
    },
    async saveMeta() { /* meId comes from the signed-in account */ },
    async replaceAll(snap) {
      // Upload a whole snapshot (local data or a v1 import). Members are linked by email, never removed.
      const tables: Tables = snap.tables;
      const writes: RecordWrite[] = [];
      const { data: existingMembers } = await sb.from('members').select('id,email').eq('workspace_id', workspaceId).is('deleted_at', null);
      const memberIdMap = new Map<string, string>();
      for (const m of Object.values(tables.members)) {
        const hit = existingMembers?.find((x) => x.email && x.email === m.email.toLowerCase());
        if (hit) memberIdMap.set(m.id, hit.id as string);
        else writes.push({ col: 'members', rec: { ...m, email: m.email.toLowerCase() } });
      }
      const remap = (id: unknown) => (typeof id === 'string' && memberIdMap.has(id) ? memberIdMap.get(id)! : id);
      for (const col of collections) {
        if (col === 'members') continue;
        for (const rec of Object.values(tables[col])) {
          const r = { ...(rec as unknown as Record<string, unknown>) };
          if ('assigneeId' in r) r.assigneeId = remap(r.assigneeId);
          if ('ownerId' in r) r.ownerId = remap(r.ownerId);
          if ('actorId' in r) r.actorId = remap(r.actorId);
          writes.push({ col, rec: r as unknown as Collections[CollectionName] });
        }
      }
      await push(writes);
      await sb.from('workspaces').update(wsToRow({ ...snap.workspace, onboarded: true })).eq('id', workspaceId);
      // Soft-delete records that are not in the snapshot (except people).
      const now = new Date().toISOString();
      for (const col of collections) {
        if (col === 'members') continue;
        const keep = new Set(Object.keys(tables[col]));
        const rows = await fetchAll(sb, TABLE[col], workspaceId);
        const gone = rows.filter((r) => !keep.has(String(r.id)) && !r.deleted_at).map((r) => String(r.id));
        for (let i = 0; i < gone.length; i += 200) await sb.from(TABLE[col]).update({ deleted_at: now }).in('id', gone.slice(i, i + 200));
      }
    },
    subscribe(onRecord, onWorkspace) {
      // Each subscription gets its own channel; any earlier one for this studio is closed first,
      // because Supabase refuses new listeners on a channel that is already subscribed.
      for (const old of sb.getChannels()) if (old.topic.startsWith(`realtime:ws-${workspaceId}`)) void sb.removeChannel(old);
      const ch = sb.channel(`ws-${workspaceId}-${Math.random().toString(36).slice(2, 10)}`);
      for (const col of collections) {
        ch.on('postgres_changes', { event: '*', schema: 'public', table: TABLE[col], filter: `workspace_id=eq.${workspaceId}` }, (p) => {
          const row = p.new as Record<string, unknown>;
          if (!row?.id) return;
          const c = COL_BY_TABLE[p.table];
          // Keep the token we already hold for portal links created in this session.
          const rec = fromRow(c, row);
          if (c === 'portalLinks' && cache) {
            const held = cache.tables.portalLinks[String(row.id)];
            if (held?.token) (rec as unknown as { token: string }).token = held.token;
          }
          onRecord(c, rec);
        });
      }
      ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'workspaces', filter: `id=eq.${workspaceId}` }, (p) => onWorkspace(wsFromRow(p.new as Record<string, unknown>)));
      ch.subscribe();
      return () => void sb.removeChannel(ch);
    },
  };
}

/** Public portal data for a token (cloud mode). */
export async function fetchPortal(token: string) {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('portal_view', { token });
  if (error) throw error;
  return data as PortalData | null;
}

export interface PortalData {
  studio: { name: string; logo: string | null; email: string; website: string };
  client: { name: string };
  projects: { name: string; stage: string; onHold: boolean; startOn: string | null; dueOn: string | null; driveUrl: string | null; milestones: { title: string; dueOn: string | null; status: string }[]; tasksDone: number; tasksTotal: number }[];
}
