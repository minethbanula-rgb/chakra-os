import * as React from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { BarChart3, Download, FileText, PieChart, Plus, Receipt, RefreshCw, Tags, Trash2, Users, Wallet } from 'lucide-react';
import type { Subscription, Transaction, TxType } from '@/data/types';
import { useLive, useTables, useWorkspace } from '@/data/hooks';
import { createInvoice, logSubscriptionCharge, refreshFx, subscriptionInStudioCurrency } from '@/data/actions';
import { createRecord, removeRecord, updateRecord } from '@/data/store';
import { addDays, daysBetween, formatDate, inRange, relativeDay, today, type Range } from '@/lib/dates';
import { buckets, byCategory, displayStatus, outstandingMinor, periodRange, totalsFor, totalsIn, type Period, live } from '@/lib/domain';
import { formatMoney, fromMinor, toMinor, CURRENCIES } from '@/lib/money';
import { Badge, Button, Checkbox, EmptyState, Field, Input, PageHeader, Panel, Segmented, Select, Sheet, Stat, StatusBadge, cx, toast } from '@/components/ui';

export function MoneyTabs() {
  const tab = (to: string, label: string, end = false) => (
    <NavLink to={to} end={end} className={({ isActive }) => cx('relative h-10 shrink-0 px-1 text-sm font-medium', isActive ? 'text-ink after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-accent after:shadow-[0_0_10px_var(--c-accent)]' : 'text-muted hover:text-ink')}>{label}</NavLink>
  );
  return (
    <div className="-mx-4 mb-5 flex gap-6 overflow-x-auto border-b border-line px-4 md:mx-0 md:px-0">
      {tab('/money', 'Overview', true)}{tab('/money/invoices', 'Invoices')}{tab('/money/expenses', 'Income & expenses')}{tab('/money/subscriptions', 'Subscriptions')}{tab('/money/reports', 'Reports')}
    </div>
  );
}

function NewInvoiceButton() {
  const nav = useNavigate();
  return <Button variant="primary" onClick={() => { const inv = createInvoice(); nav(`/money/invoices/${inv.id}`); }}><Plus size={16} />New invoice</Button>;
}

const PERIOD_KEY = 'chakra-period';
export function usePeriod() {
  const [p, setP] = React.useState<Period>(() => (localStorage.getItem(PERIOD_KEY) as Period) || 'cycle');
  React.useEffect(() => localStorage.setItem(PERIOD_KEY, p), [p]);
  return [p, setP] as const;
}

/* ---------- Overview ---------- */

export function MoneyOverview() {
  const ws = useWorkspace();
  const tables = useTables();
  const txs = useLive('transactions');
  const [period, setPeriod] = usePeriod();
  const r = periodRange(period, ws);
  const cur = totalsIn(txs, r);
  // Compare with the same number of elapsed days in the previous period.
  const elapsed = Math.max(0, daysBetween(r.start, today() < r.end ? today() : r.end));
  const prevR = periodRange(period, ws, addDays(r.start, -1));
  const prev = totalsIn(txs, { start: prevR.start, end: addDays(prevR.start, elapsed) < prevR.end ? addDays(prevR.start, elapsed) : prevR.end });
  const delta = (a: number, b: number) => (b ? `${a >= b ? '+' : ''}${Math.round(((a - b) / Math.abs(b)) * 100)}% vs ${prevR.label}` : `No data for ${prevR.label}`);
  const outstanding = outstandingMinor(tables);
  const bks = buckets(txs, period, r);
  const cats = byCategory(txs, r, 'Expense');

  return (
    <>
      <PageHeader title="Money" action={<NewInvoiceButton />} />
      <MoneyTabs />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Segmented value={period} onChange={setPeriod} options={[{ value: 'cycle', label: ws.cycleStartDay === 1 ? 'Month' : 'Cycle' }, { value: 'quarter', label: 'Quarter' }, { value: 'year', label: 'Year' }]} />
        <span className="text-[13px] text-muted">{r.label} · to date</span>
      </div>
      <div className="grid gap-4">
        <Panel>
          <div className="grid grid-cols-2 divide-line max-sm:[&>*:nth-child(-n+2)]:border-b sm:grid-cols-4 sm:divide-x">
            <Stat label="Income" value={formatMoney(cur.income, ws.currency)} note={delta(cur.income, prev.income)} />
            <Stat label="Expenses" value={formatMoney(cur.expense, ws.currency)} note={delta(cur.expense, prev.expense)} />
            <Stat label="Net" value={formatMoney(cur.net, ws.currency)} tone={cur.net < 0 ? 'bad' : undefined} note={period === 'cycle' && ws.monthlyTargetMinor ? `Target ${formatMoney(ws.monthlyTargetMinor, ws.currency)} income` : undefined} />
            <Stat label="Outstanding" value={formatMoney(outstanding, ws.currency)} note="Sent, not yet paid" tone={outstanding ? 'bad' : undefined} />
          </div>
        </Panel>
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Panel icon={<BarChart3 />} title="Income and expenses">
            <BarChart data={bks} currency={ws.currency} target={period === 'cycle' ? 0 : 0} />
          </Panel>
          <Panel icon={<PieChart />} title="Where money went">
            {cats.length ? (
              <div className="grid gap-3 p-4">
                {cats.map((c) => (
                  <div key={c.name}>
                    <div className="mb-1 flex justify-between text-[13px]"><span>{c.name}</span><span className="tabular text-muted">{formatMoney(c.amount, ws.currency)}</span></div>
                    <div className="h-1.5 rounded-full bg-subtle"><div className="progress-glow h-full rounded-full" style={{ width: `${(c.amount / cats[0].amount) * 100}%` }} /></div>
                  </div>
                ))}
              </div>
            ) : <EmptyState title="No expenses in this period" />}
          </Panel>
        </div>
      </div>
    </>
  );
}

function BarChart({ data, currency }: { data: ReturnType<typeof buckets>; currency: string; target?: number }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]));
  const [hover, setHover] = React.useState<number | null>(null);
  const h = 180;
  if (!data.some((d) => d.income || d.expense)) return <EmptyState title="No income or expenses yet" text="Recorded invoice payments and expenses appear here." />;
  return (
    <div className="p-4">
      <div className="mb-3 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="progress-glow h-2.5 w-2.5 rounded-sm" />Income</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-faint/50" />Expenses</span>
      </div>
      <div className="relative flex items-end gap-2 border-b border-line" style={{ height: h }} role="img" aria-label="Income and expenses by period">
        {data.map((d, i) => (
          <div key={d.key} className="relative flex h-full flex-1 items-end justify-center gap-1" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(hover === i ? null : i)}>
            <div className="w-full max-w-7 rounded-t-md bg-gradient-to-t from-accent-2 to-accent shadow-[0_0_14px_var(--glow)] transition-[height]" style={{ height: `${(d.income / max) * 100}%`, minHeight: d.income ? 2 : 0 }} />
            <div className="w-full max-w-7 rounded-t-md border border-line-strong bg-faint/25 transition-[height]" style={{ height: `${(d.expense / max) * 100}%`, minHeight: d.expense ? 2 : 0 }} />
            {hover === i && (
              <div className="anim-pop absolute bottom-full z-10 mb-2 w-40 rounded-lg border border-line-strong bg-elevated p-2.5 text-xs shadow-pop">
                <div className="mb-1 font-medium">{formatDate(d.start)} – {formatDate(d.end)}</div>
                <div className="flex justify-between"><span className="text-muted">Income</span><span className="tabular">{formatMoney(d.income, currency)}</span></div>
                <div className="flex justify-between"><span className="text-muted">Expenses</span><span className="tabular">{formatMoney(d.expense, currency)}</span></div>
                <div className="mt-1 flex justify-between border-t border-line pt-1 font-medium"><span>Net</span><span className="tabular">{formatMoney(d.income - d.expense, currency)}</span></div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-2">{data.map((d) => <div key={d.key} className="flex-1 text-center text-[11px] text-faint">{d.label}</div>)}</div>
      <details className="mt-3 text-[13px]">
        <summary className="cursor-pointer text-muted">Show exact figures</summary>
        <table className="mt-2 w-full text-xs">
          <thead><tr className="text-left text-muted"><th className="py-1 font-medium">Period</th><th className="text-right font-medium">Income</th><th className="text-right font-medium">Expenses</th><th className="text-right font-medium">Net</th></tr></thead>
          <tbody className="tabular">{data.map((d) => <tr key={d.key} className="border-t border-line"><td className="py-1">{formatDate(d.start)} – {formatDate(d.end)}</td><td className="text-right">{formatMoney(d.income, currency)}</td><td className="text-right">{formatMoney(d.expense, currency)}</td><td className="text-right">{formatMoney(d.income - d.expense, currency)}</td></tr>)}</tbody>
        </table>
      </details>
    </div>
  );
}

/* ---------- Invoices ---------- */

export function Invoices() {
  const invoices = useLive('invoices');
  const tables = useTables();
  const [f, setF] = React.useState<'open' | 'draft' | 'paid' | 'all'>('open');
  const list = invoices
    .filter((i) => f === 'all' || (f === 'open' ? ['Sent', 'Partially paid'].includes(i.status) : f === 'draft' ? i.status === 'Draft' : i.status === 'Paid'))
    .sort((a, b) => b.issuedOn.localeCompare(a.issuedOn) || b.number.localeCompare(a.number));
  return (
    <>
      <PageHeader title="Money" action={<NewInvoiceButton />} />
      <MoneyTabs />
      <Segmented className="mb-4" value={f} onChange={setF} options={[{ value: 'open', label: 'Awaiting payment' }, { value: 'draft', label: 'Drafts' }, { value: 'paid', label: 'Paid' }, { value: 'all', label: 'All' }]} />
      <Panel bodyClass="overflow-x-auto">
        {list.length ? (
          <table className="w-full min-w-[620px] text-sm">
            <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="px-4 py-2.5 font-medium">Invoice</th><th className="px-3 font-medium">Client</th><th className="px-3 font-medium">Due</th><th className="px-3 text-right font-medium">Total</th><th className="px-3 text-right font-medium">Balance</th><th className="px-4 font-medium">Status</th></tr></thead>
            <tbody className="divide-y divide-line">
              {list.map((i) => {
                const t = totalsFor(tables, i);
                const st = displayStatus(i);
                return (
                  <tr key={i.id} className="cursor-pointer hover:bg-subtle" onClick={() => (location.hash = `#/money/invoices/${i.id}`)}>
                    <td className="px-4 py-3 font-medium"><Link to={`/money/invoices/${i.id}`} onClick={(e) => e.stopPropagation()}>{i.number}</Link></td>
                    <td className="px-3">{i.clientId ? tables.clients[i.clientId]?.name : <span className="text-faint">No client</span>}</td>
                    <td className={cx('px-3', st === 'Overdue' ? 'text-bad' : 'text-muted')}>{relativeDay(i.dueOn)}</td>
                    <td className="tabular px-3 text-right">{formatMoney(t.total, i.currency)}</td>
                    <td className="tabular px-3 text-right">{i.status === 'Paid' || i.status === 'Void' ? '—' : formatMoney(t.balance, i.currency)}</td>
                    <td className="px-4"><StatusBadge status={st} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <EmptyState icon={<FileText size={28} />} title={f === 'open' ? 'Nothing awaiting payment' : 'No invoices here'} text="Create invoices from a project to pull in its milestones." action={<NewInvoiceButton />} />}
      </Panel>
    </>
  );
}

/* ---------- Income & expenses ---------- */

const CATEGORIES: Record<TxType, string[]> = {
  Income: ['Client payments', 'Retainers', 'Consulting', 'Other income'],
  Expense: ['Software', 'Freelancers', 'Operations', 'Marketing', 'Equipment', 'Travel', 'Taxes', 'Other'],
};

export function Expenses() {
  const ws = useWorkspace();
  const txs = useLive('transactions');
  const [period, setPeriod] = usePeriod();
  const [type, setType] = React.useState<'all' | TxType>('all');
  const [editing, setEditing] = React.useState<Transaction | 'new' | null>(null);
  const r = periodRange(period, ws);
  const list = txs.filter((x) => inRange(x.occurredOn, r) && (type === 'all' || x.type === type)).sort((a, b) => b.occurredOn.localeCompare(a.occurredOn));
  return (
    <>
      <PageHeader title="Money" action={<Button variant="primary" onClick={() => setEditing('new')}><Plus size={16} />Add entry</Button>} />
      <MoneyTabs />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={type} onChange={setType} options={[{ value: 'all', label: 'All' }, { value: 'Income', label: 'Income' }, { value: 'Expense', label: 'Expenses' }]} />
        <Segmented value={period} onChange={setPeriod} options={[{ value: 'cycle', label: ws.cycleStartDay === 1 ? 'Month' : 'Cycle' }, { value: 'quarter', label: 'Quarter' }, { value: 'year', label: 'Year' }]} />
        <span className="ml-auto text-[13px] text-muted">{r.label}</span>
      </div>
      <Panel>
        {list.length ? (
          <div className="divide-y divide-line">
            {list.map((x) => (
              <button key={x.id} onClick={() => setEditing(x)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-subtle">
                <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-lg', x.type === 'Income' ? 'bg-good-soft text-good' : 'bg-warn-soft text-warn')}>{x.type === 'Income' ? <Wallet size={15} /> : <Receipt size={15} />}</span>
                <div className="min-w-0 flex-1"><div className="truncate text-sm">{x.title || x.category}</div><div className="text-xs text-muted">{formatDate(x.occurredOn)} · {x.category}{x.paymentId ? ' · from invoice' : ''}</div></div>
                <span className={cx('tabular text-sm font-medium', x.type === 'Income' ? 'text-good' : '')}>{x.type === 'Income' ? '+' : '−'}{formatMoney(x.amountMinor, x.currency)}</span>
              </button>
            ))}
          </div>
        ) : <EmptyState title="No entries in this period" text="Invoice payments are added automatically. Add expenses as they happen." action={<Button onClick={() => setEditing('new')}>Add entry</Button>} />}
      </Panel>
      <TransactionSheet value={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function TransactionSheet({ value, onClose }: { value: Transaction | 'new' | null; onClose: () => void }) {
  const ws = useWorkspace();
  const blank = { type: 'Expense' as TxType, title: '', amount: '', occurredOn: today(), category: 'Software' };
  const [f, setF] = React.useState(blank);
  const existing = value && value !== 'new' ? value : null;
  const linked = !!existing?.paymentId;
  React.useEffect(() => {
    if (value === 'new') setF(blank);
    else if (value) setF({ type: value.type, title: value.title, amount: String(fromMinor(value.amountMinor)), occurredOn: value.occurredOn, category: value.category });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const amountMinor = toMinor(f.amount);
    if (amountMinor <= 0) return toast('Enter an amount above zero', { tone: 'danger' });
    if (existing) updateRecord('transactions', existing.id, { type: f.type, title: f.title, amountMinor, occurredOn: f.occurredOn, category: f.category }, 'Edit entry');
    else createRecord('transactions', { type: f.type, title: f.title, amountMinor, currency: ws.currency, occurredOn: f.occurredOn, category: f.category, invoiceId: null, paymentId: null, subscriptionId: null }, 'Add entry');
    toast(existing ? 'Saved' : `${f.type} added`, { undo: true });
    onClose();
  };
  return (
    <Sheet open={!!value} onOpenChange={(o) => !o && onClose()} title={existing ? 'Edit entry' : 'New entry'}
      footer={<>
        {existing && !linked ? <Button variant="danger" size="sm" onClick={() => { removeRecord('transactions', existing.id, 'Delete entry'); toast('Deleted', { undo: true }); onClose(); }}><Trash2 size={14} />Delete</Button> : <span />}
        <Button variant="primary" size="sm" type="submit" form="tx-form" disabled={linked}>Save</Button>
      </>}>
      {linked && <p className="mb-4 rounded-lg bg-info-soft px-3 py-2 text-[13px] text-info">This income came from an invoice payment. Edit or delete the payment on the invoice.</p>}
      <form id="tx-form" onSubmit={save} className="grid gap-3">
        <Segmented value={f.type} onChange={(t) => setF({ ...f, type: t, category: CATEGORIES[t][0] })} options={['Expense', 'Income']} />
        <Field label="Description"><Input autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={f.type === 'Expense' ? 'e.g. Freelance illustrator' : 'e.g. Retainer — Nova'} disabled={linked} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Amount (${ws.currency})`}><Input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} disabled={linked} /></Field>
          <Field label="Date"><Input type="date" value={f.occurredOn} onChange={(e) => setF({ ...f, occurredOn: e.target.value })} disabled={linked} /></Field>
        </div>
        <Field label="Category"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} options={[...new Set([...CATEGORIES[f.type], f.category])]} disabled={linked} /></Field>
      </form>
    </Sheet>
  );
}

/* ---------- Subscriptions ---------- */

export function Subscriptions() {
  const ws = useWorkspace();
  const subs = useLive('subscriptions');
  const [editing, setEditing] = React.useState<Subscription | 'new' | null>(null);
  const active = subs.filter((s) => s.status === 'Active');
  const monthly = active.reduce((s, x) => s + (x.cycle === 'yearly' ? Math.round(subscriptionInStudioCurrency(x) / 12) : subscriptionInStudioCurrency(x)), 0);
  const list = [...subs].sort((a, b) => (a.status === b.status ? a.renewsOn.localeCompare(b.renewsOn) : a.status === 'Active' ? -1 : 1));
  const usesUsd = subs.some((s) => s.currency === 'USD') && ws.currency !== 'USD';
  return (
    <>
      <PageHeader title="Money" action={<Button variant="primary" onClick={() => setEditing('new')}><Plus size={16} />Add subscription</Button>} />
      <MoneyTabs />
      <Panel className="mb-4">
        <div className="grid grid-cols-2 divide-x divide-line sm:grid-cols-3">
          <Stat label="Per month" value={formatMoney(monthly, ws.currency)} note={`${active.length} active`} />
          <Stat label="Per year" value={formatMoney(monthly * 12, ws.currency)} />
          {usesUsd && (
            <div className="col-span-2 flex items-center justify-between gap-2 border-t border-line px-4 py-3 sm:col-span-1 sm:border-t-0">
              <div><div className="text-xs text-muted">USD rate</div><div className="tabular text-sm font-medium">1 USD = {ws.fxUsd} {ws.currency}</div><div className="text-xs text-faint">{ws.fxUpdatedAt ? `Updated ${formatDate(ws.fxUpdatedAt.slice(0, 10))}` : 'Set manually'}</div></div>
              <Button size="sm" onClick={async () => { const r = await refreshFx(); toast(r ? `Rate updated: ${r}` : 'Could not refresh the rate. Your last rate is kept.', r ? {} : { tone: 'danger' }); }}><RefreshCw size={14} />Refresh</Button>
            </div>
          )}
        </div>
      </Panel>
      <Panel>
        {list.length ? (
          <div className="divide-y divide-line">
            {list.map((s) => {
              const days = daysBetween(today(), s.renewsOn);
              return (
                <div key={s.id} className={cx('flex items-center gap-3 px-4 py-3', s.status === 'Paused' && 'opacity-60')}>
                  <button onClick={() => setEditing(s)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <img alt="" src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(s.website)}&sz=64`} className="icon-tile h-8 w-8 shrink-0 p-1" onError={(e) => ((e.target as HTMLImageElement).style.visibility = 'hidden')} />
                    <div className="min-w-0"><div className="truncate text-sm font-medium">{s.name}</div><div className={cx('text-xs', days < 0 ? 'text-bad' : days <= s.remindDays ? 'text-warn' : 'text-muted')}>{s.status === 'Paused' ? 'Paused' : days < 0 ? `Renewal passed ${formatDate(s.renewsOn)} — log it` : `Renews ${relativeDay(s.renewsOn).toLowerCase()}`}</div></div>
                  </button>
                  <span className="tabular text-sm">{formatMoney(s.amountMinor, s.currency)}<span className="text-xs text-faint">/{s.cycle === 'yearly' ? 'yr' : 'mo'}</span></span>
                  {s.status === 'Active' && <Button size="sm" onClick={() => { logSubscriptionCharge(s.id); toast(`Logged ${s.name} as an expense`, { undo: true }); }} title="Add this charge to expenses and move the renewal date">Log charge</Button>}
                </div>
              );
            })}
          </div>
        ) : <EmptyState title="No subscriptions" text="Track the tools you pay for and get a reminder before each renewal." action={<Button onClick={() => setEditing('new')}>Add subscription</Button>} />}
      </Panel>
      <p className="mt-3 text-xs text-faint">Tracking only — renewals here never change your billing with the provider.</p>
      <SubscriptionSheet value={editing} onClose={() => setEditing(null)} />
    </>
  );
}

function SubscriptionSheet({ value, onClose }: { value: Subscription | 'new' | null; onClose: () => void }) {
  const blank = { name: '', amount: '', currency: 'USD', cycle: 'monthly' as Subscription['cycle'], renewsOn: addDays(today(), 30), website: '', remindDays: 3, autoRenew: true, status: 'Active' as Subscription['status'] };
  const [f, setF] = React.useState(blank);
  const existing = value && value !== 'new' ? value : null;
  React.useEffect(() => {
    if (value === 'new') setF(blank);
    else if (value) setF({ name: value.name, amount: String(fromMinor(value.amountMinor)), currency: value.currency, cycle: value.cycle, renewsOn: value.renewsOn, website: value.website, remindDays: value.remindDays, autoRenew: value.autoRenew, status: value.status });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return;
    const rec = { name: f.name.trim(), amountMinor: toMinor(f.amount), currency: f.currency, cycle: f.cycle, renewsOn: f.renewsOn, website: f.website.replace(/^https?:\/\//, '').replace(/\/.*$/, ''), remindDays: Number(f.remindDays) || 0, autoRenew: f.autoRenew, status: f.status };
    if (existing) updateRecord('subscriptions', existing.id, rec, 'Edit subscription');
    else createRecord('subscriptions', rec, 'Add subscription');
    onClose();
  };
  return (
    <Sheet open={!!value} onOpenChange={(o) => !o && onClose()} title={existing ? existing.name : 'New subscription'}
      footer={<>{existing ? <Button variant="danger" size="sm" onClick={() => { removeRecord('subscriptions', existing.id, 'Delete subscription'); toast('Deleted', { undo: true }); onClose(); }}><Trash2 size={14} />Delete</Button> : <span />}<Button variant="primary" size="sm" type="submit" form="sub-form">Save</Button></>}>
      <form id="sub-form" onSubmit={save} className="grid gap-3">
        <Field label="Name"><Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Figma" /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Amount" className="col-span-2"><Input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
          <Field label="Currency"><Select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })} options={CURRENCIES} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Billed"><Select value={f.cycle} onChange={(e) => setF({ ...f, cycle: e.target.value as Subscription['cycle'] })} options={[{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }]} /></Field>
          <Field label="Next renewal"><Input type="date" value={f.renewsOn} onChange={(e) => setF({ ...f, renewsOn: e.target.value })} /></Field>
          <Field label="Remind me (days before)"><Input type="number" min={0} max={30} value={f.remindDays} onChange={(e) => setF({ ...f, remindDays: Number(e.target.value) })} /></Field>
          <Field label="Status"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Subscription['status'] })} options={['Active', 'Paused']} /></Field>
        </div>
        <Field label="Website" hint="Used for the logo"><Input value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} placeholder="figma.com" /></Field>
        <label className="flex items-center gap-2.5 text-sm"><Checkbox checked={f.autoRenew} label="Auto-renews" onChange={(v) => setF({ ...f, autoRenew: v })} />Auto-renews with the provider</label>
      </form>
    </Sheet>
  );
}

/* ---------- Reports ---------- */

export function Reports() {
  const ws = useWorkspace();
  const tables = useTables();
  const txs = useLive('transactions');
  const [period, setPeriod] = usePeriod();
  const r: Range = periodRange(period, ws);
  const inR = txs.filter((x) => inRange(x.occurredOn, r) && x.occurredOn <= today());
  const totals = totalsIn(txs, r);
  const byClient = new Map<string, number>();
  for (const x of inR) {
    if (x.type !== 'Income' || !x.invoiceId) continue;
    const inv = tables.invoices[x.invoiceId];
    const name = inv?.clientId ? tables.clients[inv.clientId]?.name ?? 'Unknown' : 'No client';
    byClient.set(name, (byClient.get(name) ?? 0) + x.amountMinor);
  }
  const clientRows = [...byClient.entries()].sort((a, b) => b[1] - a[1]);
  const expenseRows = byCategory(txs, r, 'Expense');
  const incomeRows = byCategory(txs, r, 'Income');
  const unpaid = live(tables.invoices).filter((i) => i.status === 'Sent' || i.status === 'Partially paid');

  const exportCsv = () => {
    const rows = [['Date', 'Type', 'Description', 'Category', 'Amount', 'Currency', 'Invoice'], ...inR.sort((a, b) => a.occurredOn.localeCompare(b.occurredOn)).map((x) => [x.occurredOn, x.type, x.title, x.category, (x.type === 'Expense' ? -1 : 1) * fromMinor(x.amountMinor), x.currency, x.invoiceId ? tables.invoices[x.invoiceId]?.number ?? '' : ''])];
    const csv = rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `${ws.name.replace(/\W+/g, '-').toLowerCase()}-${r.start}-to-${r.end}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const Table = ({ rows, empty }: { rows: [string, number][]; empty: string }) =>
    rows.length ? (
      <table className="w-full text-sm"><tbody className="divide-y divide-line">{rows.map(([k, v]) => <tr key={k}><td className="px-4 py-2.5">{k}</td><td className="tabular px-4 text-right">{formatMoney(v, ws.currency)}</td></tr>)}</tbody></table>
    ) : <p className="px-4 py-4 text-[13px] text-muted">{empty}</p>;

  return (
    <>
      <PageHeader title="Money" action={<Button onClick={exportCsv}><Download size={16} />Export CSV</Button>} />
      <MoneyTabs />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Segmented value={period} onChange={setPeriod} options={[{ value: 'cycle', label: ws.cycleStartDay === 1 ? 'Month' : 'Cycle' }, { value: 'quarter', label: 'Quarter' }, { value: 'year', label: 'Year' }]} />
        <span className="text-[13px] text-muted">{formatDate(r.start, { year: true })} – {formatDate(r.end, { year: true })}</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel className="md:col-span-2">
          <div className="grid grid-cols-3 divide-x divide-line">
            <Stat label="Income" value={formatMoney(totals.income, ws.currency)} />
            <Stat label="Expenses" value={formatMoney(totals.expense, ws.currency)} />
            <Stat label="Net" value={formatMoney(totals.net, ws.currency)} tone={totals.net < 0 ? 'bad' : 'good'} />
          </div>
        </Panel>
        <Panel icon={<Users />} title="Income by client"><Table rows={clientRows} empty="No invoice payments in this period." /></Panel>
        <Panel icon={<Tags />} title="Expenses by category"><Table rows={expenseRows.map((x) => [x.name, x.amount])} empty="No expenses in this period." /></Panel>
        <Panel icon={<Tags />} title="Income by category"><Table rows={incomeRows.map((x) => [x.name, x.amount])} empty="No income in this period." /></Panel>
        <Panel title={<>Unpaid invoices <Badge className="ml-1">{unpaid.length}</Badge></>}>
          {unpaid.length ? <table className="w-full text-sm"><tbody className="divide-y divide-line">{unpaid.map((i) => <tr key={i.id}><td className="px-4 py-2.5"><Link className="hover:underline" to={`/money/invoices/${i.id}`}>{i.number}</Link><div className="text-xs text-muted">{i.clientId ? tables.clients[i.clientId]?.name : ''}</div></td><td className="px-2"><StatusBadge status={displayStatus(i)} /></td><td className="tabular px-4 text-right">{formatMoney(totalsFor(tables, i).balance, i.currency)}</td></tr>)}</tbody></table> : <p className="px-4 py-4 text-[13px] text-muted">Everything is paid.</p>}
        </Panel>
      </div>
    </>
  );
}
