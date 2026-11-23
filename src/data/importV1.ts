/* Maps a Chakra Studio OS v1 backup (version 1 JSON blob) into v2 tables. */
import type { Client, Collections, CollectionName, ID, Priority, Snapshot, Stage, TaskStatus, Tables, Workspace } from './types';
import { defaultWorkspace, emptyTables, uid } from './store';
import { toMinor } from '@/lib/money';
import { today } from '@/lib/dates';

type V1 = Record<string, unknown> & { version: number; settings?: Record<string, unknown> };
type Obj = Record<string, unknown>;

const str = (v: unknown, d = '') => (typeof v === 'string' ? v : v == null ? d : String(v));
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const date = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Obj[]) : []);

const STAGE_MAP: Record<string, { stage: Stage; onHold?: boolean }> = {
  Planning: { stage: 'Planning' }, 'In Progress': { stage: 'In progress' }, 'In Review': { stage: 'Review' },
  'On Hold': { stage: 'In progress', onHold: true }, Delivered: { stage: 'Delivered' }, 'Portfolio Queue': { stage: 'Delivered' },
  Archived: { stage: 'Archived' }, Lead: { stage: 'Lead' },
};
const TASK_MAP: Record<string, TaskStatus> = { Backlog: 'To do', 'In Progress': 'Doing', Review: 'Review', Done: 'Done' };

export interface ImportReport {
  counts: Partial<Record<CollectionName, number>>;
  invoiceTotalMinor: number;
  incomeMinor: number;
  expenseMinor: number;
  warnings: string[];
}

export function isV1(json: unknown): json is V1 {
  return !!json && typeof json === 'object' && (json as V1).version === 1 && Array.isArray((json as V1).projects);
}

export function importV1(json: V1): { snapshot: Snapshot; report: ImportReport } {
  const t: Tables = emptyTables();
  const ts = new Date().toISOString();
  const warnings: string[] = [];
  // All ids are fresh UUIDs (v1 used short ids like "p0"); links are remapped below.
  const put = <K extends CollectionName>(col: K, rec: Omit<Collections[K], 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>) => {
    const full = { createdAt: ts, updatedAt: ts, deletedAt: null, ...rec, id: uid() } as unknown as Collections[K];
    (t[col] as Record<ID, Collections[K]>)[full.id] = full;
    return full;
  };
  const s = (json.settings ?? {}) as Obj;
  const currency = str(s.currency, 'USD');

  const ws: Workspace = {
    ...defaultWorkspace(),
    name: str(s.brand) || str(s.studio, 'My Studio'),
    ownerName: str(s.owner), email: str(s.email), address: str(s.address), website: str(s.website),
    currency, cycleStartDay: Math.min(31, Math.max(1, num(s.cycleStartDay) || 1)), taxDefault: num(s.tax),
    invoicePrefix: str(s.prefix, 'INV-'), monthlyTargetMinor: toMinor(num(s.target) / 12 || 0),
    logo: str(s.appLogo) || str(s.invoiceLogo) || null, fxUsd: num(s.fx) || 300, onboarded: true,
  };
  // v1 "target" was an annual figure on Insights; keep it as monthly target = annual / 12.

  // Members (v1 users) — matched by display name for task assignees / project owners.
  const memberByName = new Map<string, ID>();
  for (const u of arr(json.users)) {
    const m = put('members', { name: str(u.name, 'Teammate'), email: str(u.email), role: memberByName.size === 0 ? 'owner' : 'member', title: str(u.role), status: 'Active' });
    memberByName.set(m.name.toLowerCase(), m.id);
    memberByName.set(m.name.split(' ')[0].toLowerCase(), m.id);
  }
  const memberFor = (name: unknown): ID | null => {
    const n = str(name).toLowerCase();
    if (!n) return null;
    if (memberByName.has(n)) return memberByName.get(n)!;
    const m = put('members', { name: str(name), email: '', role: 'member', title: '', status: 'Active' });
    memberByName.set(n, m.id);
    warnings.push(`Created team member “${str(name)}” from a task or project assignee.`);
    return m.id;
  };

  // Clients by name (v1 linked projects/invoices by client name).
  const clientByName = new Map<string, Client>();
  for (const c of arr(json.clients)) {
    const status = str(c.status);
    const client = put('clients', {
      name: str(c.name, 'Client'), status: status === 'Inactive' ? 'Paused' : status === 'Blacklisted' ? 'Former' : 'Active',
      industry: str(c.industry), website: str(c.website), location: str(c.location), notes: str(c.notes), flagged: status === 'Blacklisted',
    });
    clientByName.set(client.name.toLowerCase(), client);
    if (str(c.contact) || str(c.email) || str(c.phone)) put('contacts', { clientId: client.id, name: str(c.contact), email: str(c.email), phone: str(c.phone), isPrimary: true });
  }
  const clientFor = (name: unknown): ID | null => {
    const n = str(name).trim();
    if (!n) return null;
    const hit = clientByName.get(n.toLowerCase());
    if (hit) return hit.id;
    const c = put('clients', { name: n, status: 'Active', industry: '', website: '', location: '', notes: '', flagged: false });
    clientByName.set(n.toLowerCase(), c);
    return c.id;
  };

  const projectIds = new Map<string, ID>();
  for (const p of arr(json.projects)) {
    const map = STAGE_MAP[str(p.status)] ?? { stage: 'Planning' as Stage };
    const proj = put('projects', {
      clientId: clientFor(p.client), name: str(p.name, 'Project'), stage: map.stage, onHold: !!map.onHold,
      startOn: null, dueOn: date(p.due), budgetMinor: toMinor(num(p.budget)), description: str(p.description), driveUrl: str(p.driveUrl).startsWith('https://') ? str(p.driveUrl) : '',
      ownerId: p.owner ? memberFor(p.owner) : null,
    });
    projectIds.set(str(p.id), proj.id);
    arr(p.milestones).forEach((m, i) => put('milestones', {
      projectId: proj.id, title: str(m.title, 'Milestone'), dueOn: date(m.date), status: m.state === 'Complete' ? 'Complete' : m.state === 'In Progress' ? 'In progress' : 'Planned',
      clientVisible: true, position: i, completedAt: m.state === 'Complete' ? ts : null,
    }));
  }

  arr(json.tasks).forEach((x, i) => {
    const task = put('tasks', {
      projectId: projectIds.get(str(x.project)) ?? null, title: str(x.title, 'Task'), notes: str(x.description) === 'Keep the next step clear and move the project forward.' ? '' : str(x.description),
      status: TASK_MAP[str(x.status)] ?? 'To do', priority: (['Low', 'Medium', 'High'].includes(str(x.priority)) ? str(x.priority) : 'Medium') as Priority,
      dueOn: date(x.due), assigneeId: memberFor(x.assignee), position: i, recurrence: 'none', completedAt: str(x.status) === 'Done' ? ts : null,
    });
    arr(x.checklist).forEach((c, j) => put('checklist', { taskId: task.id, text: str(c.text), done: !!c.done, position: j }));
  });

  let invoiceTotal = 0;
  for (const inv of arr(json.invoices)) {
    const items = arr(inv.items);
    const subtotal = items.reduce((a, it) => a + Math.round(num(it.qty) * toMinor(num(it.rate))), 0);
    const total = subtotal + Math.round((subtotal * num(inv.tax)) / 100);
    invoiceTotal += total;
    const advancePct = inv.advanceMode === 'percent' ? num(inv.advanceValue) : inv.advanceMode === 'amount' && total ? Math.round((toMinor(num(inv.advanceValue)) / total) * 1000) / 10 : 0;
    const status = str(inv.status);
    const rec = put('invoices', {
      clientId: clientFor(inv.client), projectId: projectIds.get(str(inv.project)) ?? null,
      number: str(inv.number, 'INV'), issuedOn: date(inv.issued) ?? today(), dueOn: date(inv.due) ?? date(inv.issued) ?? today(),
      status: status === 'Paid' ? 'Paid' : status === 'Sent' || status === 'Overdue' ? 'Sent' : status === 'Void' || status === 'Cancelled' ? 'Void' : 'Draft',
      currency, taxRate: num(inv.tax), advancePct, notes: str(inv.notes), sentAt: null,
    });
    items.forEach((it, i) => put('invoiceItems', { invoiceId: rec.id, description: str(it.description), qty: num(it.qty) || 1, rateMinor: toMinor(num(it.rate)), position: i }));
    if (status === 'Paid') {
      // v1 never recorded payments; record one so balances are right, but no income entry (v1 income was entered by hand).
      put('payments', { invoiceId: rec.id, amountMinor: total, paidOn: date(inv.due) ?? today(), method: 'Imported from v1' });
    }
  }

  let income = 0, expense = 0;
  for (const x of arr(json.transactions)) {
    const type = str(x.type) === 'Expense' ? 'Expense' : 'Income';
    const amountMinor = toMinor(num(x.amount));
    if (type === 'Income') income += amountMinor; else expense += amountMinor;
    put('transactions', { type, title: str(x.title), amountMinor, currency, occurredOn: date(x.date) ?? today(), category: str(x.category, 'Other'), invoiceId: null, paymentId: null, subscriptionId: null });
  }

  for (const x of arr(json.subscriptions)) {
    put('subscriptions', {
      name: str(x.name), amountMinor: toMinor(num(x.amount)), currency: 'USD', cycle: 'monthly', renewsOn: date(x.renewal) ?? today(),
      autoRenew: x.auto !== false, remindDays: num(x.reminder) || 3, website: str(x.website), status: str(x.status) === 'Paused' ? 'Paused' : 'Active',
    });
  }

  for (const tpl of arr(json.templates)) {
    // v1 templates were invoice templates; keep them as invoice notes in activity so nothing is lost.
    put('activity', { entity: 'invoices', entityId: uid(), text: `Imported v1 invoice template “${str(tpl.name, 'Template')}”`, actorId: null });
  }
  if (arr(json.meetings).length) warnings.push(`${arr(json.meetings).length} retired meeting records were not imported (kept in your v1 backup file).`);

  const counts: ImportReport['counts'] = {};
  for (const k of Object.keys(t) as CollectionName[]) counts[k] = Object.keys(t[k]).length;
  const firstOwner = Object.values(t.members)[0];
  return {
    snapshot: { schema: 2, workspace: ws, tables: t, meId: firstOwner?.id ?? null },
    report: { counts, invoiceTotalMinor: invoiceTotal, incomeMinor: income, expenseMinor: expense, warnings },
  };
}
