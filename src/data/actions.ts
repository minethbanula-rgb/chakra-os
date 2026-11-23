import type { ID, ISODate, Invoice, Milestone, Project, Subscription, Task, TaskStatus, Template, Minor, Draft } from './types';
import { batch, createRecord, removeRecord, updateRecord, updateWorkspace, useStore, uid } from './store';
import { addDays, addMonths, parseISODate, today } from '@/lib/dates';
import { checklistOf, itemsOf, live, milestonesOf, nextInvoiceNumber, nextOccurrence, paymentsOf, statusFromPayments, totalsFor, invoiceMath } from '@/lib/domain';

const S = () => useStore.getState();

export function logActivity(text: string, entity: Draft<'activity'>['entity'], entityId: ID) {
  createRecord('activity', { text, entity, entityId, actorId: S().meId });
}

/* ---------- Tasks ---------- */

export function addTask(d: Partial<Draft<'tasks'>> & { title: string }): Task {
  const siblings = live(S().tables.tasks).filter((t) => t.status === (d.status ?? 'To do'));
  return createRecord('tasks', {
    projectId: null, notes: '', status: 'To do', priority: 'Medium', dueOn: null, assigneeId: S().meId,
    recurrence: 'none', completedAt: null, position: siblings.length ? Math.max(...siblings.map((t) => t.position)) + 1 : 0,
    ...d,
  }, `Add “${d.title}”`);
}

export function setTaskStatus(id: ID, status: TaskStatus) {
  const t = S().tables.tasks[id];
  if (!t || t.status === status) return;
  batch(status === 'Done' ? `Complete “${t.title}”` : `Move “${t.title}”`, () => {
    updateRecord('tasks', id, { status, completedAt: status === 'Done' ? new Date().toISOString() : null });
    if (status === 'Done') {
      for (const c of checklistOf(S().tables, id)) if (!c.done) updateRecord('checklist', c.id, { done: true });
      const next = nextOccurrence(t);
      if (next) {
        const copy = addTask({ title: t.title, projectId: t.projectId, notes: t.notes, priority: t.priority, assigneeId: t.assigneeId, recurrence: t.recurrence, dueOn: next });
        for (const c of checklistOf(S().tables, id)) createRecord('checklist', { taskId: copy.id, text: c.text, done: false, position: c.position });
      }
      if (t.projectId) logActivity(`Completed “${t.title}”`, 'tasks', id);
    }
  });
}

export function snoozeTask(id: ID, to: ISODate) {
  const t = S().tables.tasks[id];
  if (t) updateRecord('tasks', id, { dueOn: to }, `Snooze “${t.title}”`);
}

export function toggleChecklist(itemId: ID) {
  const c = S().tables.checklist[itemId];
  if (!c) return;
  batch('Update checklist', () => {
    updateRecord('checklist', itemId, { done: !c.done });
    const task = S().tables.tasks[c.taskId];
    if (c.done && task?.status === 'Done') updateRecord('tasks', task.id, { status: 'Doing', completedAt: null });
  });
}

export function addChecklistItem(taskId: ID, text: string) {
  const pos = checklistOf(S().tables, taskId).length;
  createRecord('checklist', { taskId, text, done: false, position: pos });
}

export function deleteTask(id: ID) {
  const t = S().tables.tasks[id];
  if (!t) return;
  batch(`Delete “${t.title}”`, () => {
    for (const c of checklistOf(S().tables, id)) removeRecord('checklist', c.id);
    removeRecord('tasks', id);
  });
}

/** Reorder within / across board columns. */
export function moveTask(id: ID, status: TaskStatus, beforeId: ID | null) {
  const tasks = live(S().tables.tasks).filter((t) => t.status === status && t.id !== id).sort((a, b) => a.position - b.position);
  const idx = beforeId ? tasks.findIndex((t) => t.id === beforeId) : tasks.length;
  const prev = tasks[idx - 1]?.position ?? (tasks[0]?.position ?? 0) - 1;
  const next = tasks[idx]?.position ?? prev + 2;
  batch('Move task', () => {
    updateRecord('tasks', id, { position: (prev + next) / 2 });
    setTaskStatus(id, status);
  });
}

/* ---------- Projects ---------- */

export function createProject(d: Partial<Draft<'projects'>> & { name: string }, template?: Template | null): Project {
  return batch(`Create “${d.name}”`, () => {
    const start = d.startOn ?? today();
    const p = createRecord('projects', {
      clientId: null, stage: 'Planning', onHold: false, startOn: start, dueOn: null, budgetMinor: 0, description: '',
      driveUrl: '', ownerId: S().meId, ...d,
    });
    if (template) {
      template.milestones.forEach((m, i) => createRecord('milestones', { projectId: p.id, title: m.title, dueOn: addDays(start, m.offsetDays), status: 'Planned', clientVisible: true, position: i, completedAt: null }));
      template.tasks.forEach((t, i) => createRecord('tasks', { projectId: p.id, title: t.title, notes: '', status: 'To do', priority: t.priority ?? 'Medium', dueOn: addDays(start, t.offsetDays), assigneeId: S().meId, position: i, recurrence: 'none', completedAt: null }));
      const last = Math.max(0, ...template.milestones.map((m) => m.offsetDays), ...template.tasks.map((t) => t.offsetDays));
      if (!d.dueOn) updateRecord('projects', p.id, { dueOn: addDays(start, last) });
    }
    logActivity(`Created project ${d.name}`, 'projects', p.id);
    return S().tables.projects[p.id];
  });
}

export function deleteProject(id: ID) {
  const p = S().tables.projects[id];
  if (!p) return;
  batch(`Delete “${p.name}”`, () => {
    for (const t of live(S().tables.tasks).filter((t) => t.projectId === id)) deleteTask(t.id);
    for (const m of milestonesOf(S().tables, id)) removeRecord('milestones', m.id);
    removeRecord('projects', id);
  });
}

export function addMilestone(projectId: ID, title: string, dueOn: ISODate | null): Milestone {
  return createRecord('milestones', { projectId, title, dueOn, status: 'Planned', clientVisible: true, position: milestonesOf(S().tables, projectId).length, completedAt: null }, `Add milestone “${title}”`);
}

export function setMilestoneStatus(id: ID, status: Milestone['status']) {
  const m = S().tables.milestones[id];
  if (!m) return;
  batch(`Milestone “${m.title}”`, () => {
    updateRecord('milestones', id, { status, completedAt: status === 'Complete' ? new Date().toISOString() : null });
    if (status === 'Complete') logActivity(`Milestone complete: ${m.title}`, 'milestones', id);
  });
}

/* ---------- Clients ---------- */

export function deleteClient(id: ID) {
  const c = S().tables.clients[id];
  if (!c) return;
  batch(`Delete “${c.name}”`, () => {
    for (const x of live(S().tables.contacts).filter((x) => x.clientId === id)) removeRecord('contacts', x.id);
    for (const l of live(S().tables.portalLinks).filter((l) => l.clientId === id)) removeRecord('portalLinks', l.id);
    removeRecord('clients', id);
  });
}

export function makeToken(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function portalLinkFor(clientId: ID) {
  return live(S().tables.portalLinks).find((l) => l.clientId === clientId) ?? null;
}

export function enablePortal(clientId: ID, replace = false) {
  const existing = portalLinkFor(clientId);
  if (existing) updateRecord('portalLinks', existing.id, { enabled: true, ...(replace ? { token: makeToken() } : {}) }, replace ? 'Replace portal link' : 'Enable portal');
  else createRecord('portalLinks', { clientId, token: makeToken(), enabled: true }, 'Enable portal');
}

export function disablePortal(clientId: ID) {
  const l = portalLinkFor(clientId);
  if (l) updateRecord('portalLinks', l.id, { enabled: false }, 'Disable portal');
}

/* ---------- Invoices & money ---------- */

export function createInvoice(opts: { clientId?: ID | null; projectId?: ID | null } = {}): Invoice {
  const s = S();
  const ws = s.workspace;
  const project = opts.projectId ? s.tables.projects[opts.projectId] : null;
  return batch('Create invoice', () => {
    const inv = createRecord('invoices', {
      clientId: opts.clientId ?? project?.clientId ?? null, projectId: project?.id ?? null,
      number: nextInvoiceNumber(s.tables, ws.invoicePrefix), issuedOn: today(), dueOn: addDays(today(), 14),
      status: 'Draft', currency: ws.currency, taxRate: ws.taxDefault, advancePct: 0, notes: 'Thank you for your business.', sentAt: null,
    });
    if (project) {
      const ms = milestonesOf(s.tables, project.id);
      if (ms.length && project.budgetMinor) {
        const each = Math.floor(project.budgetMinor / ms.length);
        ms.forEach((m, i) => createRecord('invoiceItems', { invoiceId: inv.id, description: m.title, qty: 1, rateMinor: i === ms.length - 1 ? project.budgetMinor - each * (ms.length - 1) : each, position: i }));
      } else {
        createRecord('invoiceItems', { invoiceId: inv.id, description: project.name, qty: 1, rateMinor: project.budgetMinor, position: 0 });
      }
    } else {
      createRecord('invoiceItems', { invoiceId: inv.id, description: '', qty: 1, rateMinor: 0, position: 0 });
    }
    return inv;
  });
}

export function duplicateInvoice(id: ID): Invoice | null {
  const s = S();
  const src = s.tables.invoices[id];
  if (!src) return null;
  return batch('Duplicate invoice', () => {
    const inv = createRecord('invoices', { ...src, id: uid(), number: nextInvoiceNumber(s.tables, s.workspace.invoicePrefix), issuedOn: today(), dueOn: addDays(today(), 14), status: 'Draft', sentAt: null } as Draft<'invoices'>);
    itemsOf(s.tables, id).forEach((it) => createRecord('invoiceItems', { invoiceId: inv.id, description: it.description, qty: it.qty, rateMinor: it.rateMinor, position: it.position }));
    return inv;
  });
}

export function sendInvoice(id: ID) {
  const inv = S().tables.invoices[id];
  if (!inv) return;
  batch(`Send ${inv.number}`, () => {
    updateRecord('invoices', id, { status: inv.status === 'Draft' ? 'Sent' : inv.status, sentAt: new Date().toISOString() });
    logActivity(`Sent ${inv.number}`, 'invoices', id);
  });
}

function refreshInvoiceStatus(id: ID) {
  const s = S();
  const inv = s.tables.invoices[id];
  if (!inv) return;
  const { total, paid } = totalsFor(s.tables, inv);
  updateRecord('invoices', id, { status: statusFromPayments(inv, total, paid) });
}

/** Records a payment, the matching income entry, and moves the invoice to Partially paid / Paid. */
export function recordPayment(invoiceId: ID, amountMinor: Minor, paidOn: ISODate, method: string) {
  const s = S();
  const inv = s.tables.invoices[invoiceId];
  if (!inv || amountMinor <= 0) return;
  const client = inv.clientId ? s.tables.clients[inv.clientId]?.name : '';
  batch(`Payment on ${inv.number}`, () => {
    const p = createRecord('payments', { invoiceId, amountMinor, paidOn, method });
    createRecord('transactions', {
      type: 'Income', title: `${inv.number}${client ? ` · ${client}` : ''}`, amountMinor, currency: inv.currency, occurredOn: paidOn,
      category: 'Client payments', invoiceId, paymentId: p.id, subscriptionId: null,
    });
    if (inv.status === 'Draft') updateRecord('invoices', invoiceId, { status: 'Sent', sentAt: inv.sentAt ?? new Date().toISOString() });
    refreshInvoiceStatus(invoiceId);
    logActivity(`Payment received on ${inv.number}`, 'invoices', invoiceId);
  });
}

export function deletePayment(paymentId: ID) {
  const s = S();
  const p = s.tables.payments[paymentId];
  if (!p) return;
  batch('Delete payment', () => {
    for (const tx of live(s.tables.transactions).filter((x) => x.paymentId === paymentId)) removeRecord('transactions', tx.id);
    removeRecord('payments', paymentId);
    refreshInvoiceStatus(p.invoiceId);
  });
}

export function voidInvoice(id: ID) {
  const inv = S().tables.invoices[id];
  if (inv) updateRecord('invoices', id, { status: 'Void' }, `Void ${inv.number}`);
}

export function deleteInvoice(id: ID) {
  const s = S();
  const inv = s.tables.invoices[id];
  if (!inv) return;
  batch(`Delete ${inv.number}`, () => {
    for (const p of paymentsOf(s.tables, id)) deletePayment(p.id);
    for (const it of itemsOf(s.tables, id)) removeRecord('invoiceItems', it.id);
    removeRecord('invoices', id);
  });
}

export function invoiceTotals(id: ID) {
  const s = S();
  const inv = s.tables.invoices[id];
  return inv ? totalsFor(s.tables, inv) : invoiceMath({ taxRate: 0, advancePct: 0 }, []);
}

/** Converts a subscription price to the studio currency (only USD→studio is supported). */
export function subscriptionInStudioCurrency(sub: Subscription): Minor {
  const ws = S().workspace;
  if (sub.currency === ws.currency) return sub.amountMinor;
  if (sub.currency === 'USD' && ws.fxUsd > 0) return Math.round(sub.amountMinor * ws.fxUsd);
  return sub.amountMinor;
}

/** Logs this period's charge as an expense and moves the renewal date forward. */
export function logSubscriptionCharge(id: ID) {
  const s = S();
  const sub = s.tables.subscriptions[id];
  if (!sub) return;
  batch(`Log ${sub.name} charge`, () => {
    createRecord('transactions', {
      type: 'Expense', title: sub.name, amountMinor: subscriptionInStudioCurrency(sub), currency: s.workspace.currency,
      occurredOn: today() < sub.renewsOn ? today() : sub.renewsOn, category: 'Software', invoiceId: null, paymentId: null, subscriptionId: id,
    });
    const day = parseISODate(sub.renewsOn).getDate();
    updateRecord('subscriptions', id, { renewsOn: addMonths(sub.renewsOn, sub.cycle === 'yearly' ? 12 : 1, day) });
  });
}

export async function refreshFx(): Promise<number | null> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!res.ok) return null;
    const json = (await res.json()) as { rates?: Record<string, number> };
    const rate = json.rates?.[S().workspace.currency];
    if (!rate) return null;
    updateWorkspace({ fxUsd: rate, fxUpdatedAt: new Date().toISOString() });
    return rate;
  } catch {
    return null;
  }
}
