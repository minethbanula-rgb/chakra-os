import type {
  ID, ISODate, Invoice, InvoiceDisplayStatus, InvoiceItem, Payment, Project, Subscription, Task, Tables,
  Transaction, Milestone, Workspace, Minor,
} from '@/data/types';
import { OPEN_STAGES } from '@/data/types';
import { addDays, cycleRange, daysBetween, inRange, quarterRange, today, weekRange, yearRange, type Range, addMonths, parseISODate, toISODate } from './dates';
import { pctOf } from './money';

export const live = <T extends { deletedAt?: string | null }>(rec: Record<ID, T>): T[] =>
  Object.values(rec).filter((r) => !r.deletedAt);

/* ---------- Invoices ---------- */

export const itemsOf = (t: Tables, invoiceId: ID): InvoiceItem[] =>
  live(t.invoiceItems).filter((i) => i.invoiceId === invoiceId).sort((a, b) => a.position - b.position);
export const paymentsOf = (t: Tables, invoiceId: ID): Payment[] =>
  live(t.payments).filter((p) => p.invoiceId === invoiceId).sort((a, b) => a.paidOn.localeCompare(b.paidOn));

export function invoiceMath(inv: Pick<Invoice, 'taxRate' | 'advancePct'>, items: Pick<InvoiceItem, 'qty' | 'rateMinor'>[], payments: Pick<Payment, 'amountMinor'>[] = []) {
  const subtotal = items.reduce((s, i) => s + Math.round((Number(i.qty) || 0) * i.rateMinor), 0);
  const tax = pctOf(subtotal, inv.taxRate || 0);
  const total = subtotal + tax;
  const paid = payments.reduce((s, p) => s + p.amountMinor, 0);
  const advance = pctOf(total, inv.advancePct || 0);
  return { subtotal, tax, total, paid, balance: Math.max(0, total - paid), advance };
}

export function totalsFor(t: Tables, inv: Invoice) {
  return invoiceMath(inv, itemsOf(t, inv.id), paymentsOf(t, inv.id));
}

/** Status the UI shows: stored status, or Overdue when sent, unpaid and past due. */
export function displayStatus(inv: Invoice, on: ISODate = today()): InvoiceDisplayStatus {
  if ((inv.status === 'Sent' || inv.status === 'Partially paid') && inv.dueOn < on) return 'Overdue';
  return inv.status;
}

/** Status after payments change. Draft and Void are left alone. */
export function statusFromPayments(inv: Invoice, total: Minor, paid: Minor): Invoice['status'] {
  if (inv.status === 'Void' || inv.status === 'Draft') return paid > 0 ? (paid >= total ? 'Paid' : 'Partially paid') : inv.status;
  if (paid <= 0) return 'Sent';
  return paid >= total ? 'Paid' : 'Partially paid';
}

export function nextInvoiceNumber(t: Tables, prefix: string, on: ISODate = today()): string {
  const year = on.slice(0, 4);
  const base = `${prefix}${year}-`;
  const max = live(t.invoices)
    .map((i) => (i.number.startsWith(base) ? Number(i.number.slice(base.length)) : 0))
    .filter(Number.isFinite)
    .reduce((a, b) => Math.max(a, b), 0);
  return `${base}${String(max + 1).padStart(3, '0')}`;
}

export function outstandingMinor(t: Tables): Minor {
  return live(t.invoices)
    .filter((i) => i.status === 'Sent' || i.status === 'Partially paid')
    .reduce((s, i) => s + totalsFor(t, i).balance, 0);
}

/* ---------- Projects & tasks ---------- */

export const isOpenProject = (p: Project) => OPEN_STAGES.includes(p.stage);
export const tasksOf = (t: Tables, projectId: ID) => live(t.tasks).filter((x) => x.projectId === projectId);
export const milestonesOf = (t: Tables, projectId: ID) =>
  live(t.milestones).filter((m) => m.projectId === projectId).sort((a, b) => (a.dueOn ?? '9').localeCompare(b.dueOn ?? '9') || a.position - b.position);

/** Progress = tasks done ÷ tasks; falls back to milestones when a project has no tasks. */
export function projectProgress(t: Tables, projectId: ID) {
  const tasks = tasksOf(t, projectId);
  if (tasks.length) {
    const done = tasks.filter((x) => x.status === 'Done').length;
    return { done, total: tasks.length, pct: Math.round((done / tasks.length) * 100), unit: 'tasks' as const };
  }
  const ms = milestonesOf(t, projectId);
  const done = ms.filter((m) => m.status === 'Complete').length;
  return { done, total: ms.length, pct: ms.length ? Math.round((done / ms.length) * 100) : 0, unit: 'milestones' as const };
}

export function checklistOf(t: Tables, taskId: ID) {
  return live(t.checklist).filter((c) => c.taskId === taskId).sort((a, b) => a.position - b.position);
}

export const isOverdue = (task: Pick<Task, 'dueOn' | 'status'>, on = today()) => !!task.dueOn && task.dueOn < on && task.status !== 'Done';

const PRIORITY_RANK = { High: 0, Medium: 1, Low: 2 } as const;
export const byDueThenPriority = (a: Task, b: Task) =>
  (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999') || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.position - b.position;

/** The next due date for a recurring task once the current one is completed. */
export function nextOccurrence(task: Task, from: ISODate = today()): ISODate | null {
  const base = task.dueOn && task.dueOn > from ? task.dueOn : task.dueOn ?? from;
  switch (task.recurrence) {
    case 'daily': { let d = addDays(base, 1); while (d <= from) d = addDays(d, 1); return d; }
    case 'weekly': { let d = addDays(base, 7); while (d <= from) d = addDays(d, 7); return d; }
    case 'monthly': { let d = addMonths(base, 1); while (d <= from) d = addMonths(d, 1); return d; }
    default: return null;
  }
}

/* ---------- Today ---------- */

export interface TodayBuckets {
  overdue: Task[];
  today: Task[];
  week: Task[];
  later: Task[];
  noDate: Task[];
}

export function todayBuckets(tasks: Task[], ws: Pick<Workspace, 'weekStartsOn'>, on = today()): TodayBuckets {
  const week = weekRange(on, ws.weekStartsOn);
  const weekEnd = week.end < addDays(on, 6) ? addDays(on, 6) : week.end;
  const open = tasks.filter((t) => t.status !== 'Done').sort(byDueThenPriority);
  return {
    overdue: open.filter((t) => t.dueOn && t.dueOn < on),
    today: open.filter((t) => t.dueOn === on),
    week: open.filter((t) => t.dueOn && t.dueOn > on && t.dueOn <= weekEnd),
    later: open.filter((t) => t.dueOn && t.dueOn > weekEnd),
    noDate: open.filter((t) => !t.dueOn),
  };
}

export interface Alert {
  id: string;
  tone: 'danger' | 'warning' | 'info';
  text: string;
  href: string;
}

export function moneyAlerts(t: Tables, _ws: Workspace, on = today()): Alert[] {
  const alerts: Alert[] = [];
  for (const inv of live(t.invoices)) {
    if (inv.status !== 'Sent' && inv.status !== 'Partially paid') continue;
    const { balance } = totalsFor(t, inv);
    const client = inv.clientId ? t.clients[inv.clientId]?.name : 'No client';
    const diff = daysBetween(on, inv.dueOn);
    if (diff < 0) alerts.push({ id: inv.id, tone: 'danger', text: `${inv.number} · ${client} is ${-diff} day${diff === -1 ? '' : 's'} overdue`, href: `/money/invoices/${inv.id}` });
    else if (diff <= 3) alerts.push({ id: inv.id, tone: 'warning', text: `${inv.number} · ${client} due ${diff === 0 ? 'today' : `in ${diff} day${diff === 1 ? '' : 's'}`}`, href: `/money/invoices/${inv.id}` });
    void balance;
  }
  for (const s of live(t.subscriptions)) {
    if (s.status !== 'Active') continue;
    const diff = daysBetween(on, s.renewsOn);
    if (diff >= 0 && diff <= Math.max(3, s.remindDays)) alerts.push({ id: s.id, tone: 'info', text: `${s.name} renews ${diff === 0 ? 'today' : `in ${diff} day${diff === 1 ? '' : 's'}`}`, href: '/money/subscriptions' });
  }
  return alerts;
}

export function milestonesDue(t: Tables, on = today(), days = 7): (Milestone & { project: Project })[] {
  const end = addDays(on, days);
  return live(t.milestones)
    .filter((m) => m.status !== 'Complete' && m.dueOn && m.dueOn <= end)
    .map((m) => ({ ...m, project: t.projects[m.projectId] }))
    .filter((m) => m.project && !m.project.deletedAt && isOpenProject(m.project))
    .sort((a, b) => (a.dueOn ?? '').localeCompare(b.dueOn ?? ''));
}

/** Subscription renewal dates roll forward once passed (tracking only; no billing). */
export function rolledRenewal(s: Subscription, on = today()): ISODate {
  let d = s.renewsOn;
  const day = parseISODate(s.renewsOn).getDate();
  while (d < on) d = s.cycle === 'yearly' ? addMonths(d, 12, day) : addMonths(d, 1, day);
  return d;
}

/* ---------- Reporting ---------- */

export type Period = 'cycle' | 'quarter' | 'year';
export function periodRange(p: Period, ws: Workspace, on = today()): Range {
  return p === 'cycle' ? cycleRange(ws.cycleStartDay, on) : p === 'quarter' ? quarterRange(on) : yearRange(on);
}

export function totalsIn(txs: Transaction[], r: Pick<Range, 'start' | 'end'>, on = today()) {
  const end = r.end < on ? r.end : on; // future-dated entries are excluded
  let income = 0, expense = 0;
  for (const x of txs) {
    if (!inRange(x.occurredOn, { start: r.start, end })) continue;
    if (x.type === 'Income') income += x.amountMinor; else expense += x.amountMinor;
  }
  return { income, expense, net: income - expense };
}

export interface Bucket { key: string; label: string; start: ISODate; end: ISODate; income: number; expense: number }

/** Weekly buckets for a cycle, monthly buckets for quarter or year. */
export function buckets(txs: Transaction[], p: Period, r: Range, on = today()): Bucket[] {
  const out: Bucket[] = [];
  if (p === 'cycle') {
    let s = r.start;
    let i = 1;
    while (s <= r.end) {
      const e = addDays(s, 6) > r.end ? r.end : addDays(s, 6);
      out.push({ key: s, label: `Wk ${i++}`, start: s, end: e, income: 0, expense: 0 });
      s = addDays(e, 1);
    }
  } else {
    let s = r.start;
    while (s <= r.end) {
      const d = parseISODate(s);
      const e = toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0, 12));
      out.push({ key: s, label: d.toLocaleDateString('en-US', { month: 'short' }), start: s, end: e, income: 0, expense: 0 });
      s = addDays(e, 1);
    }
  }
  for (const x of txs) {
    if (x.occurredOn > on) continue;
    const b = out.find((b) => x.occurredOn >= b.start && x.occurredOn <= b.end);
    if (!b) continue;
    if (x.type === 'Income') b.income += x.amountMinor; else b.expense += x.amountMinor;
  }
  return out;
}

export function byCategory(txs: Transaction[], r: Pick<Range, 'start' | 'end'>, type: Transaction['type'], on = today()) {
  const m = new Map<string, number>();
  for (const x of txs) if (x.type === type && inRange(x.occurredOn, r) && x.occurredOn <= on) m.set(x.category || 'Other', (m.get(x.category || 'Other') ?? 0) + x.amountMinor);
  return [...m.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
}
