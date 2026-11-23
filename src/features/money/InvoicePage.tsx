import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, Calculator, Copy, Download, GripVertical, ListOrdered, Mail, NotebookPen, Plus, Printer, Send, Trash2, Wallet } from 'lucide-react';
import { useLive, useRecord, useTables, useWorkspace } from '@/data/hooks';
import { deleteInvoice, deletePayment, duplicateInvoice, recordPayment, sendInvoice, voidInvoice } from '@/data/actions';
import { createRecord, removeRecord, updateRecord } from '@/data/store';
import { formatDate, today } from '@/lib/dates';
import { displayStatus, itemsOf, paymentsOf, totalsFor } from '@/lib/domain';
import { formatMoney, fromMinor, toMinor, CURRENCIES } from '@/lib/money';
import { Button, EmptyState, Field, IconButton, InlineInput, InlineTextarea, Input, Modal, Panel, Select, StatusBadge, cx, toast, useConfirm } from '@/components/ui';
import { invoiceEmail } from '@/features/notify';
import { downloadInvoicePdf } from '@/lib/pdf-lazy';

export function InvoicePage() {
  const { id } = useParams();
  const inv = useRecord('invoices', id);
  const tables = useTables();
  const clients = useLive('clients');
  const projects = useLive('projects');
  const nav = useNavigate();
  const ws = useWorkspace();
  const confirm = useConfirm();
  const [payOpen, setPayOpen] = React.useState(false);

  if (!inv || inv.deletedAt) return <EmptyState title="Invoice not found" action={<Link to="/money/invoices"><Button>Back to invoices</Button></Link>} />;
  const set = (patch: Partial<typeof inv>) => updateRecord('invoices', inv.id, patch);
  const items = itemsOf(tables, inv.id);
  const payments = paymentsOf(tables, inv.id);
  const t = totalsFor(tables, inv);
  const status = displayStatus(inv);
  const locked = inv.status === 'Paid' || inv.status === 'Void';
  const money = (m: number) => formatMoney(m, inv.currency);

  const pdf = async () => {
    try { await downloadInvoicePdf(inv, tables, ws); toast(`${inv.number}.pdf downloaded`); }
    catch (e) { toast(`Could not create the PDF: ${(e as Error).message}`, { tone: 'danger' }); }
  };
  const send = async () => {
    if (!inv.clientId) return toast('Choose a client first', { tone: 'danger' });
    if (t.total <= 0) return toast('Add at least one line with an amount', { tone: 'danger' });
    await pdf();
    sendInvoice(inv.id);
    window.open(invoiceEmail({ ...inv }, 'send'), '_self');
    toast(`${inv.number} marked as sent. The PDF is in your downloads — attach it to the email.`, { undo: true });
  };

  return (
    <div>
      <div className="no-print">
        <Link to="/money/invoices" className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink"><ArrowLeft size={14} />Invoices</Link>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="text-[26px] font-semibold tracking-tight">{inv.number}</h1>
            <StatusBadge status={status} />
          </div>
          <div className="flex flex-wrap gap-2">
            <IconButton label="Print" onClick={() => window.print()}><Printer size={16} /></IconButton>
            <Button onClick={pdf}><Download size={15} />Download PDF</Button>
            {inv.status === 'Draft' && <Button variant="primary" onClick={send}><Send size={15} />Send</Button>}
            {(inv.status === 'Sent' || inv.status === 'Partially paid') && <>
              {status === 'Overdue' && <a href={invoiceEmail(inv, 'reminder')}><Button><Mail size={15} />Send reminder</Button></a>}
              <Button variant="primary" onClick={() => setPayOpen(true)}><Wallet size={15} />Record payment</Button>
            </>}
          </div>
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-4">
            <Panel>
              <div className="grid gap-3 p-4 sm:grid-cols-2">
                <Field label="Client"><Select disabled={locked} value={inv.clientId ?? ''} onChange={(e) => set({ clientId: e.target.value || null })} options={[{ value: '', label: 'Choose client…' }, ...clients.map((c) => ({ value: c.id, label: c.name }))]} /></Field>
                <Field label="Project"><Select disabled={locked} value={inv.projectId ?? ''} onChange={(e) => set({ projectId: e.target.value || null })} options={[{ value: '', label: 'No project' }, ...projects.filter((p) => !inv.clientId || p.clientId === inv.clientId || p.id === inv.projectId).map((p) => ({ value: p.id, label: p.name }))]} /></Field>
                <Field label="Invoice number"><InlineInput disabled={locked} value={inv.number} onCommit={(v) => v.trim() && set({ number: v.trim() })} /></Field>
                <Field label="Currency"><Select disabled={locked || payments.length > 0} value={inv.currency} onChange={(e) => set({ currency: e.target.value })} options={[...new Set([inv.currency, ...CURRENCIES])]} /></Field>
                <Field label="Issued"><Input disabled={locked} type="date" value={inv.issuedOn} onChange={(e) => e.target.value && set({ issuedOn: e.target.value })} /></Field>
                <Field label="Due"><Input disabled={locked} type="date" value={inv.dueOn} onChange={(e) => e.target.value && set({ dueOn: e.target.value })} /></Field>
              </div>
            </Panel>

            <Panel icon={<ListOrdered />} title="Line items">
              <div className="divide-y divide-line">
                <div className="hidden grid-cols-[minmax(0,1fr)_80px_120px_110px_36px] gap-2 px-4 py-2 text-xs text-muted sm:grid"><span className="pl-6">Description</span><span>Qty</span><span>Rate</span><span className="text-right">Amount</span><span /></div>
                {items.map((it) => (
                  <div key={it.id} className="grid grid-cols-[minmax(0,1fr)_36px] items-center gap-2 px-4 py-2 sm:grid-cols-[minmax(0,1fr)_80px_120px_110px_36px]">
                    <div className="flex items-center gap-1"><GripVertical size={14} className="shrink-0 text-faint" /><InlineInput disabled={locked} aria-label="Description" value={it.description} onCommit={(v) => updateRecord('invoiceItems', it.id, { description: v })} placeholder="Description" /></div>
                    <IconButton className="sm:order-last" label="Remove line" disabled={locked} onClick={() => removeRecord('invoiceItems', it.id, 'Remove line')}><Trash2 size={15} /></IconButton>
                    <div className="col-span-2 grid grid-cols-3 gap-2 sm:col-span-1 sm:contents">
                      <InlineInput disabled={locked} aria-label="Quantity" inputMode="decimal" value={String(it.qty)} onCommit={(v) => updateRecord('invoiceItems', it.id, { qty: Number(v) || 0 })} />
                      <InlineInput disabled={locked} aria-label="Rate" inputMode="decimal" value={it.rateMinor ? String(fromMinor(it.rateMinor)) : ''} placeholder="0" onCommit={(v) => updateRecord('invoiceItems', it.id, { rateMinor: toMinor(v || 0) })} />
                      <div className="tabular self-center text-right text-sm">{money(Math.round(it.qty * it.rateMinor))}</div>
                    </div>
                  </div>
                ))}
              </div>
              {!locked && <div className="border-t border-line p-3"><Button size="sm" variant="ghost" onClick={() => createRecord('invoiceItems', { invoiceId: inv.id, description: '', qty: 1, rateMinor: 0, position: items.length })}><Plus size={14} />Add line</Button></div>}
            </Panel>

            <Panel icon={<NotebookPen />} title="Notes to client"><div className="p-4"><InlineTextarea disabled={locked} value={inv.notes} onCommit={(v) => set({ notes: v })} placeholder="Payment details, thank-you note…" /></div></Panel>
          </div>

          <div className="grid gap-4">
            <Panel icon={<Calculator />} title="Summary">
              <div className="grid gap-2 p-4 text-sm">
                <Row label="Subtotal" value={money(t.subtotal)} />
                <div className="flex items-center justify-between gap-3"><span className="text-muted">Tax %</span><InlineInput disabled={locked} aria-label="Tax rate" inputMode="decimal" value={String(inv.taxRate)} onCommit={(v) => set({ taxRate: Math.max(0, Number(v) || 0) })} className="!h-8 !w-20 text-right" /></div>
                <Row label="Tax" value={money(t.tax)} />
                <Row label="Total" value={money(t.total)} strong />
                <div className="mt-2 flex items-center justify-between gap-3 border-t border-line pt-3"><span className="text-muted">Advance %</span><InlineInput disabled={locked} aria-label="Advance percent" inputMode="decimal" value={String(inv.advancePct)} onCommit={(v) => set({ advancePct: Math.min(100, Math.max(0, Number(v) || 0)) })} className="!h-8 !w-20 text-right" /></div>
                {inv.advancePct > 0 && <Row label="Advance requested" value={money(t.advance)} />}
                <div className="mt-2 border-t border-line pt-3" />
                <Row label="Paid" value={money(t.paid)} />
                <Row label="Balance due" value={money(t.balance)} strong tone={status === 'Overdue' ? 'bad' : undefined} />
              </div>
            </Panel>
            <Panel title="Payments" action={!locked && inv.status !== 'Draft' ? <Button size="sm" variant="ghost" onClick={() => setPayOpen(true)}><Plus size={14} />Add</Button> : undefined}>
              {payments.length ? (
                <div className="divide-y divide-line">
                  {payments.map((p) => (
                    <div key={p.id} className="group flex items-center gap-3 px-4 py-2.5 text-sm">
                      <div className="min-w-0 flex-1"><div className="tabular font-medium">{money(p.amountMinor)}</div><div className="text-xs text-muted">{formatDate(p.paidOn)} · {p.method}</div></div>
                      <IconButton label="Delete payment" className="opacity-0 group-hover:opacity-100" onClick={() => { deletePayment(p.id); toast('Payment and its income entry removed', { undo: true }); }}><Trash2 size={14} /></IconButton>
                    </div>
                  ))}
                </div>
              ) : <p className="px-4 py-4 text-[13px] text-muted">{inv.status === 'Draft' ? 'Send the invoice, then record payments here. Each payment adds an income entry.' : 'No payments yet.'}</p>}
            </Panel>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => { const c = duplicateInvoice(inv.id); if (c) nav(`/money/invoices/${c.id}`); }}><Copy size={14} />Duplicate</Button>
              {inv.status === 'Draft'
                ? <Button size="sm" variant="danger" onClick={() => confirm.ask('Delete draft?', `${inv.number} will be deleted.`, 'Delete', () => { deleteInvoice(inv.id); nav('/money/invoices'); toast('Draft deleted', { undo: true }); })}><Trash2 size={14} />Delete</Button>
                : inv.status !== 'Void' && <Button size="sm" variant="danger" onClick={() => confirm.ask('Void invoice?', 'Sent invoices are voided rather than deleted, so numbering stays intact. Recorded payments stay on file.', 'Void invoice', () => voidInvoice(inv.id))}><Ban size={14} />Void</Button>}
            </div>
          </div>
        </div>
      </div>

      <InvoicePaper />
      <PaymentModal open={payOpen} onClose={() => setPayOpen(false)} invoiceId={inv.id} balance={t.balance} advance={t.advance} currency={inv.currency} paidSoFar={t.paid} />
      {confirm.node}
    </div>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: 'bad' }) {
  return <div className="flex items-center justify-between gap-3"><span className={strong ? 'font-medium' : 'text-muted'}>{label}</span><span className={cx('tabular', strong && 'text-base font-semibold', tone === 'bad' && 'text-bad')}>{value}</span></div>;
}

function PaymentModal({ open, onClose, invoiceId, balance, advance, paidSoFar, currency }: { open: boolean; onClose: () => void; invoiceId: string; balance: number; advance: number; paidSoFar: number; currency: string }) {
  const [amount, setAmount] = React.useState('');
  const [date, setDate] = React.useState(today());
  const [method, setMethod] = React.useState('Bank transfer');
  React.useEffect(() => { if (open) { setAmount(String(fromMinor(advance && !paidSoFar ? advance : balance))); setDate(today()); } }, [open, balance, advance, paidSoFar]);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const m = toMinor(amount);
    if (m <= 0) return toast('Enter an amount above zero', { tone: 'danger' });
    if (m > balance) return toast(`That is more than the ${formatMoney(balance, currency)} balance`, { tone: 'danger' });
    recordPayment(invoiceId, m, date, method);
    toast(m === balance ? 'Paid in full. Income recorded.' : 'Payment recorded. Income added.', { undo: true });
    onClose();
  };
  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title="Record payment"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" form="pay-form">Record payment</Button></>}>
      <form id="pay-form" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label={`Amount (${currency})`} hint={`Balance ${formatMoney(balance, currency)}${advance && !paidSoFar ? ` · advance ${formatMoney(advance, currency)}` : ''}`}><Input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Date received"><Input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Method" className="sm:col-span-2"><Select value={method} onChange={(e) => setMethod(e.target.value)} options={['Bank transfer', 'Card', 'Cash', 'PayPal', 'Wise', 'Cheque', 'Other']} /></Field>
      </form>
    </Modal>
  );
}

/** Printable invoice. Hidden on screen; shown when printing / saving as PDF. */
function InvoicePaper() {
  const { id } = useParams();
  const tables = useTables();
  const ws = useWorkspace();
  const inv = id ? tables.invoices[id] : null;
  if (!inv) return null;
  const items = itemsOf(tables, inv.id);
  const t = totalsFor(tables, inv);
  const client = inv.clientId ? tables.clients[inv.clientId] : null;
  const contact = client ? Object.values(tables.contacts).find((c) => c.clientId === client.id && c.isPrimary && !c.deletedAt) : null;
  const money = (m: number) => formatMoney(m, inv.currency);
  return (
    <div className="print-only print-area text-[12px] text-black">
      <div className="mb-10 flex items-start justify-between">
        <div>
          {ws.logo && <img src={ws.logo} alt="" className="mb-3 max-h-14 max-w-40 object-contain" />}
          <div className="text-lg font-semibold">{ws.name}</div>
          <div className="whitespace-pre-line text-neutral-600">{[ws.address, ws.email, ws.website].filter(Boolean).join('\n')}</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tracking-tight">INVOICE</div>
          <div className="mt-1">{inv.number}</div>
          <div className="text-neutral-600">Issued {formatDate(inv.issuedOn, { year: true })}</div>
          <div className="text-neutral-600">Due {formatDate(inv.dueOn, { year: true })}</div>
        </div>
      </div>
      <div className="mb-8">
        <div className="text-[10px] uppercase tracking-wider text-neutral-500">Bill to</div>
        <div className="font-medium">{client?.name}</div>
        {contact && <div className="text-neutral-600">{[contact.name, contact.email].filter(Boolean).join(' · ')}</div>}
      </div>
      <table className="w-full">
        <thead><tr className="border-b border-neutral-300 text-left text-[10px] uppercase tracking-wider text-neutral-500"><th className="py-2">Description</th><th className="w-16 text-right">Qty</th><th className="w-28 text-right">Rate</th><th className="w-28 text-right">Amount</th></tr></thead>
        <tbody>{items.map((it) => <tr key={it.id} className="border-b border-neutral-200"><td className="py-2.5">{it.description}</td><td className="text-right">{it.qty}</td><td className="text-right">{money(it.rateMinor)}</td><td className="text-right">{money(Math.round(it.qty * it.rateMinor))}</td></tr>)}</tbody>
      </table>
      <div className="ml-auto mt-6 grid w-64 gap-1.5">
        <div className="flex justify-between"><span>Subtotal</span><span>{money(t.subtotal)}</span></div>
        {inv.taxRate > 0 && <div className="flex justify-between"><span>Tax ({inv.taxRate}%)</span><span>{money(t.tax)}</span></div>}
        <div className="flex justify-between border-t border-neutral-300 pt-1.5 text-[14px] font-semibold"><span>Total</span><span>{money(t.total)}</span></div>
        {inv.advancePct > 0 && <div className="flex justify-between text-neutral-600"><span>Advance requested ({inv.advancePct}%)</span><span>{money(t.advance)}</span></div>}
        {t.paid > 0 && <div className="flex justify-between text-neutral-600"><span>Paid</span><span>−{money(t.paid)}</span></div>}
        {t.paid > 0 && <div className="flex justify-between font-semibold"><span>Balance due</span><span>{money(t.balance)}</span></div>}
      </div>
      {inv.notes && <div className="mt-10 whitespace-pre-line text-neutral-700">{inv.notes}</div>}
    </div>
  );
}
