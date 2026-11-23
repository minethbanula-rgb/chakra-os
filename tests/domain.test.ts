import { describe, it, expect, beforeEach } from 'vitest';
import { cycleRange, setClock, addMonths, today } from '@/lib/dates';
import { invoiceMath, displayStatus, statusFromPayments, todayBuckets, nextOccurrence, buckets, totalsIn } from '@/lib/domain';
import { toMinor, formatMoney } from '@/lib/money';
import { parseQuickAdd } from '@/lib/quickadd';
import { importV1 } from '@/data/importV1';
import { sampleSnapshot } from '@/data/sample';
import legacy from './legacy-v1.json';
import type { Invoice, Task, Member, Project, Transaction } from '@/data/types';

const fixed = (iso: string) => setClock(() => new Date(`${iso}T09:00:00`));
beforeEach(() => fixed('2026-11-23'));

describe('dates', () => {
  it('cycle starting on the 25th spans 25th → 24th', () => {
    expect(cycleRange(25, '2026-11-23')).toMatchObject({ start: '2026-10-25', end: '2026-11-24' });
    expect(cycleRange(25, '2026-11-25')).toMatchObject({ start: '2026-11-25', end: '2026-12-24' });
  });
  it('clamps start day in short months', () => {
    expect(cycleRange(31, '2026-02-15')).toMatchObject({ start: '2026-01-31', end: '2026-02-27' });
    expect(cycleRange(31, '2026-02-28')).toMatchObject({ start: '2026-02-28', end: '2026-03-30' });
  });
  it('calendar month when start day is 1', () => {
    expect(cycleRange(1, '2026-11-23')).toMatchObject({ start: '2026-11-01', end: '2026-11-30', label: 'Nov 2026' });
  });
  it('addMonths clamps', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-02-28', 1, 31)).toBe('2026-03-31');
  });
});

describe('money', () => {
  it('stores integer minor units', () => {
    expect(toMinor('1,250.50')).toBe(125050);
    expect(toMinor(0.1 + 0.2)).toBe(30);
    expect(formatMoney(125050, 'USD')).toBe('$1,250.50');
    expect(formatMoney(900000, 'USD')).toBe('$9,000');
  });
  it('invoice totals, tax, advance, balance', () => {
    const m = invoiceMath({ taxRate: 8.5, advancePct: 40 }, [{ qty: 1, rateMinor: 250000 }, { qty: 2, rateMinor: 100000 }], [{ amountMinor: 100000 }]);
    expect(m).toEqual({ subtotal: 450000, tax: 38250, total: 488250, paid: 100000, balance: 388250, advance: 195300 });
  });
  it('overdue is computed; payments drive status', () => {
    const inv = { status: 'Sent', dueOn: '2026-11-20' } as Invoice;
    expect(displayStatus(inv)).toBe('Overdue');
    expect(statusFromPayments(inv, 1000, 400)).toBe('Partially paid');
    expect(statusFromPayments(inv, 1000, 1000)).toBe('Paid');
    expect(statusFromPayments(inv, 1000, 0)).toBe('Sent');
  });
  it('excludes future transactions from totals and buckets', () => {
    const tx = (amount: number, on: string, type: 'Income' | 'Expense' = 'Income') => ({ amountMinor: amount, occurredOn: on, type }) as Transaction;
    const txs = [tx(100, '2026-11-02'), tx(50, '2026-11-20', 'Expense'), tx(999, '2026-11-28')];
    expect(totalsIn(txs, { start: '2026-11-01', end: '2026-11-30' })).toEqual({ income: 100, expense: 50, net: 50 });
    const b = buckets(txs, 'cycle', cycleRange(1));
    expect(b.reduce((s, x) => s + x.income, 0)).toBe(100);
  });
});

describe('tasks', () => {
  const task = (dueOn: string | null, status: Task['status'] = 'To do') => ({ id: dueOn ?? 'x', dueOn, status, priority: 'Medium', position: 0 }) as Task;
  it('buckets Today', () => {
    const b = todayBuckets([task('2026-11-20'), task('2026-11-23'), task('2026-11-26'), task('2026-12-20'), task(null), task('2026-11-23', 'Done')], { weekStartsOn: 1 });
    expect([b.overdue.length, b.today.length, b.week.length, b.later.length, b.noDate.length]).toEqual([1, 1, 1, 1, 1]);
  });
  it('recurring tasks roll forward past today', () => {
    expect(nextOccurrence({ ...task('2026-11-10'), recurrence: 'weekly' } as Task)).toBe('2026-11-24');
    expect(nextOccurrence({ ...task('2026-11-23'), recurrence: 'monthly' } as Task)).toBe('2026-12-23');
  });
});

describe('quick add', () => {
  const members = [{ id: 'm1', name: 'Kaweesha Perera' }] as Member[];
  const projects = [{ id: 'p1', name: 'Nova brand identity' }, { id: 'p2', name: 'Lumi website' }] as Project[];
  it('parses project, date, priority and assignee', () => {
    const r = parseQuickAdd('Logo revisions for Nova fri high @Kaweesha', { projects, members, on: '2026-11-23' });
    expect(r).toMatchObject({ title: 'Logo revisions', projectId: 'p1', dueOn: '2026-11-27', priority: 'High', assigneeId: 'm1' });
  });
  it('handles tomorrow and #project', () => {
    const r = parseQuickAdd('send invoice #lumi tomorrow', { projects, members, on: '2026-11-23' });
    expect(r).toMatchObject({ title: 'Send invoice', projectId: 'p2', dueOn: '2026-11-24' });
  });
  it('leaves plain titles alone', () => {
    expect(parseQuickAdd('Call the printer', { projects, members }).title).toBe('Call the printer');
  });
});

describe('v1 import', () => {
  it('maps the legacy fixture into tables', () => {
    const { snapshot, report } = importV1(legacy as never);
    const p = Object.values(snapshot.tables.projects)[0];
    expect(p).toMatchObject({ name: 'Historical project', stage: 'In progress', onHold: true, budgetMinor: 10000 });
    const t = Object.values(snapshot.tables.tasks)[0];
    expect(t).toMatchObject({ status: 'To do', projectId: p.id, priority: 'High' });
    expect(Object.values(snapshot.tables.checklist)[0]).toMatchObject({ text: 'Retained step', done: true });
    expect(snapshot.workspace).toMatchObject({ currency: 'USD', invoicePrefix: 'INV-', taxDefault: 8.5 });
    expect(report.counts.projects).toBe(1);
  });
  it('sample studio is consistent', () => {
    const s = sampleSnapshot();
    expect(Object.keys(s.tables.projects).length).toBeGreaterThan(4);
    expect(today()).toBe('2026-11-23');
  });
});
