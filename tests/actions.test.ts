import { describe, it, expect, beforeEach } from 'vitest';
import { initStore, useStore, undo, replaceSnapshot } from '@/data/store';
import { localBackend } from '@/data/backend';
import { addTask, setTaskStatus, createInvoice, recordPayment, deletePayment, sendInvoice, createProject, enablePortal, portalLinkFor, toggleChecklist, addChecklistItem } from '@/data/actions';
import { sampleSnapshot, templateDrafts } from '@/data/sample';
import { live, totalsFor } from '@/lib/domain';
import { setClock, today } from '@/lib/dates';
import type { Template } from '@/data/types';

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear(), key: () => null, length: 0 } as Storage; };
const S = () => useStore.getState();

beforeEach(async () => {
  setClock(() => new Date('2026-11-23T09:00:00'));
  await initStore(localBackend(mem()));
  await replaceSnapshot(sampleSnapshot());
});

describe('store actions', () => {
  it('completing a recurring task schedules the next one; undo reverts both', () => {
    const t = addTask({ title: 'Weekly report', dueOn: today(), recurrence: 'weekly' });
    const before = live(S().tables.tasks).length;
    setTaskStatus(t.id, 'Done');
    expect(S().tables.tasks[t.id].status).toBe('Done');
    const next = live(S().tables.tasks).find((x) => x.title === 'Weekly report' && x.status === 'To do');
    expect(next?.dueOn).toBe('2026-11-30');
    expect(live(S().tables.tasks).length).toBe(before + 1);
    undo();
    expect(S().tables.tasks[t.id].status).toBe('To do');
    expect(live(S().tables.tasks).length).toBe(before);
  });

  it('unchecking a step reopens a done task', () => {
    const t = addTask({ title: 'Steps' });
    addChecklistItem(t.id, 'one');
    setTaskStatus(t.id, 'Done');
    const item = live(S().tables.checklist).find((c) => c.taskId === t.id)!;
    expect(item.done).toBe(true);
    toggleChecklist(item.id);
    expect(S().tables.tasks[t.id].status).toBe('Doing');
  });

  it('payments create income, move status and can be removed', () => {
    const p = createProject({ name: 'Paid project', budgetMinor: 100000 });
    const inv = createInvoice({ projectId: p.id });
    sendInvoice(inv.id);
    const total = totalsFor(S().tables, S().tables.invoices[inv.id]).total;
    expect(total).toBe(100000);
    recordPayment(inv.id, 40000, today(), 'Bank transfer');
    expect(S().tables.invoices[inv.id].status).toBe('Partially paid');
    recordPayment(inv.id, 60000, today(), 'Bank transfer');
    expect(S().tables.invoices[inv.id].status).toBe('Paid');
    const income = live(S().tables.transactions).filter((x) => x.invoiceId === inv.id);
    expect(income.map((x) => x.amountMinor).sort()).toEqual([40000, 60000]);
    deletePayment(live(S().tables.payments).find((x) => x.invoiceId === inv.id && x.amountMinor === 60000)!.id);
    expect(S().tables.invoices[inv.id].status).toBe('Partially paid');
    expect(live(S().tables.transactions).filter((x) => x.invoiceId === inv.id)).toHaveLength(1);
  });

  it('templates date milestones and tasks from the start date', () => {
    const tpl = { ...templateDrafts()[0], id: 'x', createdAt: '', updatedAt: '', deletedAt: null } as Template;
    const p = createProject({ name: 'From template', startOn: '2026-12-01' }, tpl);
    const ms = live(S().tables.milestones).filter((m) => m.projectId === p.id);
    expect(ms).toHaveLength(4);
    expect(ms.find((m) => m.title.startsWith('Discovery'))?.dueOn).toBe('2026-12-08');
    expect(S().tables.projects[p.id].dueOn).toBe('2027-01-15');
  });

  it('portal links rotate', () => {
    const client = live(S().tables.clients)[0];
    enablePortal(client.id);
    const first = portalLinkFor(client.id)!.token;
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    enablePortal(client.id, true);
    expect(portalLinkFor(client.id)!.token).not.toBe(first);
  });
});
