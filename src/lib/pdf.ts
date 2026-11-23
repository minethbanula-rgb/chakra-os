/* PDF export (invoices, reports) built with jsPDF: real vector text, A4, downloads as a .pdf file. */
import { jsPDF } from 'jspdf';
import type { Invoice, Tables, Workspace } from '@/data/types';
import { displayStatus, itemsOf, paymentsOf, totalsFor, invoiceMath, live, byCategory, totalsIn } from './domain';
import { formatDate, inRange, today, type Range } from './dates';

const M = 18; // margin, mm
const W = 210;
const INK: [number, number, number] = [17, 17, 19];
const MUTED: [number, number, number] = [110, 110, 118];
const LINE: [number, number, number] = [228, 228, 231];
const FILL: [number, number, number] = [244, 244, 245];

/** "USD 1,250.00" — currency codes always render in the built-in PDF fonts (₹, ₨ etc. may not). */
export function pdfMoney(minor: number, currency: string) {
  const n = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(minor) / 100);
  return `${minor < 0 ? '-' : ''}${currency} ${n}`;
}

/** jsPDF draws PNG/JPEG; SVG/WebP logos are rasterised first. Returns null if the image can't be read. */
export async function logoForPdf(src: string | null): Promise<{ data: string; w: number; h: number } | null> {
  if (!src) return null;
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
    await img.decode();
    const w = img.naturalWidth || 256;
    const h = img.naturalHeight || 256;
    const scale = Math.min(1, 600 / Math.max(w, h)) * 2;
    const c = document.createElement('canvas');
    c.width = Math.round(w * scale);
    c.height = Math.round(h * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return { data: c.toDataURL('image/png'), w, h };
  } catch {
    return null;
  }
}

function text(doc: jsPDF, s: string, x: number, y: number, o: { size?: number; bold?: boolean; color?: [number, number, number]; align?: 'left' | 'right' | 'center' } = {}) {
  doc.setFont('helvetica', o.bold ? 'bold' : 'normal');
  doc.setFontSize(o.size ?? 10);
  doc.setTextColor(...(o.color ?? INK));
  doc.text(s, x, y, { align: o.align ?? 'left' });
}

function rule(doc: jsPDF, y: number, x1 = M, x2 = W - M) {
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.25);
  doc.line(x1, y, x2, y);
}

function footer(doc: jsPDF, label: string) {
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    text(doc, label, M, 289, { size: 8, color: MUTED });
    text(doc, `Page ${p} of ${pages}`, W - M, 289, { size: 8, color: MUTED, align: 'right' });
  }
}

interface Col { label: string; width: number; align?: 'left' | 'right' }
/** Simple table with wrapping first column and page breaks. Returns the y after the table. */
function table(doc: jsPDF, y: number, cols: Col[], rows: string[][], opts: { bottom?: number } = {}) {
  const bottom = opts.bottom ?? 272;
  const header = () => {
    doc.setFillColor(...FILL);
    doc.rect(M, y - 5, W - 2 * M, 8, 'F');
    let x = M + 3;
    for (const c of cols) {
      text(doc, c.label.toUpperCase(), c.align === 'right' ? x + c.width - 6 : x, y, { size: 7.5, bold: true, color: MUTED, align: c.align });
      x += c.width;
    }
    y += 8;
  };
  header();
  for (const r of rows) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    const lines = doc.splitTextToSize(r[0] || '-', cols[0].width - 6) as string[];
    const block = (Math.max(1, lines.length) - 1) * 4.6; // extra height of wrapped lines
    if (y + block + 4 > bottom) { doc.addPage(); y = M + 6; header(); }
    let x = M + 3;
    cols.forEach((c, i) => {
      if (i === 0) { lines.forEach((ln, k) => text(doc, ln, x, y + k * 4.6, { size: 9.5 })); }
      else text(doc, r[i] ?? '', c.align === 'right' ? x + c.width - 6 : x, y, { size: 9.5, align: c.align });
      x += c.width;
    });
    rule(doc, y + block + 3);       // hairline under the row's last text line
    y += block + 9;                 // next baseline sits clear below the line
  }
  return y - 2;
}

/* ---------- Invoice ---------- */

export async function invoicePdf(inv: Invoice, t: Tables, ws: Workspace): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setProperties({ title: `${inv.number} — ${ws.name}`, author: ws.name, creator: 'Chakra Studio OS' });
  const items = itemsOf(t, inv.id);
  const payments = paymentsOf(t, inv.id);
  const m = invoiceMath(inv, items, payments);
  const client = inv.clientId ? t.clients[inv.clientId] : null;
  const contacts = client ? live(t.contacts).filter((c) => c.clientId === client.id) : [];
  const contact = contacts.find((c) => c.isPrimary) ?? contacts[0];
  const project = inv.projectId ? t.projects[inv.projectId] : null;
  const money = (n: number) => pdfMoney(n, inv.currency);

  // Header: logo + studio on the left, title on the right
  let y = M + 2;
  const logo = await logoForPdf(ws.logo);
  if (logo) {
    const ratio = logo.w / logo.h;
    const w = Math.min(44, ratio * 14);
    doc.addImage(logo.data, 'PNG', M, y - 2, w, w / ratio);
    y += 18;
  }
  text(doc, ws.name, M, y, { size: 13, bold: true });
  let ly = y + 5.5;
  for (const line of [ws.address, ws.email, ws.website].filter(Boolean)) { text(doc, line, M, ly, { size: 9, color: MUTED }); ly += 4.5; }

  text(doc, 'Invoice', W - M, M + 8, { size: 24, bold: true, align: 'right' });
  const meta: [string, string][] = [
    ['Number', inv.number], ['Issued', formatDate(inv.issuedOn, { year: true })], ['Due', formatDate(inv.dueOn, { year: true })],
    ...(project ? [['Project', project.name] as [string, string]] : []),
  ];
  let my = M + 17;
  for (const [k, v] of meta) {
    text(doc, k, W - M - 52, my, { size: 9, color: MUTED });
    text(doc, v, W - M, my, { size: 9, align: 'right' });
    my += 5;
  }
  const status = displayStatus(inv);
  if (status !== 'Draft') {
    text(doc, status.toUpperCase(), W - M, my + 1.5, { size: 8, bold: true, align: 'right', color: status === 'Paid' ? [31, 138, 91] : status === 'Overdue' ? [194, 65, 45] : MUTED });
    my += 5;
  }

  y = Math.max(ly, my) + 8;
  rule(doc, y);
  y += 8;
  text(doc, 'BILL TO', M, y, { size: 7.5, bold: true, color: MUTED });
  y += 5.5;
  text(doc, client?.name ?? '—', M, y, { size: 11, bold: true });
  y += 5;
  for (const line of [contact?.name, contact?.email, client?.location].filter(Boolean) as string[]) { text(doc, line, M, y, { size: 9, color: MUTED }); y += 4.5; }
  y += 8;

  // Line items
  const cols: Col[] = [{ label: 'Description', width: 98 }, { label: 'Qty', width: 18, align: 'right' }, { label: 'Rate', width: 29, align: 'right' }, { label: 'Amount', width: 29, align: 'right' }];
  y = table(doc, y, cols, items.map((it) => [it.description, String(it.qty), money(it.rateMinor), money(Math.round(it.qty * it.rateMinor))]), { bottom: 250 });

  // Totals
  if (y > 230) { doc.addPage(); y = M + 6; }
  y += 4;
  const tx = W - M - 72;
  const row = (label: string, value: string, bold = false, color?: [number, number, number]) => {
    text(doc, label, tx, y, { size: bold ? 10.5 : 9.5, bold, color: bold ? INK : MUTED });
    text(doc, value, W - M, y, { size: bold ? 10.5 : 9.5, bold, align: 'right', color });
    y += bold ? 7 : 5.5;
  };
  row('Subtotal', money(m.subtotal));
  if (inv.taxRate) row(`Tax (${inv.taxRate}%)`, money(m.tax));
  rule(doc, y - 3, tx, W - M);
  y += 1.5;
  row('Total', money(m.total), true);
  if (inv.advancePct > 0) row(`Advance requested (${inv.advancePct}%)`, money(m.advance));
  if (m.paid > 0) {
    row('Paid', `-${money(m.paid)}`);
    row('Balance due', money(m.balance), true, m.balance > 0 && status === 'Overdue' ? [194, 65, 45] : undefined);
  }

  if (inv.notes) {
    y += 6;
    if (y > 255) { doc.addPage(); y = M + 6; }
    text(doc, 'NOTES', M, y, { size: 7.5, bold: true, color: MUTED });
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    for (const ln of doc.splitTextToSize(inv.notes, W - 2 * M) as string[]) { text(doc, ln, M, y, { size: 9.5 }); y += 4.6; }
  }

  footer(doc, `${ws.name} · ${inv.number}`);
  return doc;
}

export async function downloadInvoicePdf(inv: Invoice, t: Tables, ws: Workspace) {
  const doc = await invoicePdf(inv, t, ws);
  doc.save(`${inv.number}${inv.clientId && t.clients[inv.clientId] ? ` - ${t.clients[inv.clientId].name}` : ''}.pdf`.replace(/[\\/:*?"<>|]/g, '-'));
}

/* ---------- Report ---------- */

export async function reportPdf(t: Tables, ws: Workspace, r: Range): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setProperties({ title: `Report ${r.start} – ${r.end} — ${ws.name}`, author: ws.name, creator: 'Chakra Studio OS' });
  const txs = live(t.transactions);
  const money = (n: number) => pdfMoney(n, ws.currency);
  let y = M + 2;
  const logo = await logoForPdf(ws.logo);
  if (logo) {
    const ratio = logo.w / logo.h;
    const w = Math.min(40, ratio * 12);
    doc.addImage(logo.data, 'PNG', M, y - 2, w, w / ratio);
    y += 16;
  }
  text(doc, 'Financial report', M, y + 4, { size: 20, bold: true });
  text(doc, `${ws.name} · ${formatDate(r.start, { year: true })} – ${formatDate(r.end, { year: true })}`, M, y + 11, { size: 10, color: MUTED });
  text(doc, `Generated ${formatDate(today(), { year: true })}`, W - M, y + 11, { size: 8.5, color: MUTED, align: 'right' });
  y += 22;

  const totals = totalsIn(txs, r);
  const boxW = (W - 2 * M - 8) / 3;
  ([['Income', totals.income], ['Expenses', totals.expense], ['Net', totals.net]] as [string, number][]).forEach(([k, v], i) => {
    const x = M + i * (boxW + 4);
    doc.setFillColor(...FILL);
    doc.roundedRect(x, y, boxW, 20, 2, 2, 'F');
    text(doc, k, x + 4, y + 7, { size: 8.5, color: MUTED });
    text(doc, money(v), x + 4, y + 15, { size: 12.5, bold: true, color: k === 'Net' && v < 0 ? [194, 65, 45] : INK });
  });
  y += 30;

  const section = (title: string) => { if (y > 250) { doc.addPage(); y = M + 6; } text(doc, title, M, y, { size: 11.5, bold: true }); y += 7; };

  const inR = txs.filter((x) => inRange(x.occurredOn, r) && x.occurredOn <= today());
  const byClient = new Map<string, number>();
  for (const x of inR) {
    if (x.type !== 'Income' || !x.invoiceId) continue;
    const inv = t.invoices[x.invoiceId];
    const name = inv?.clientId ? t.clients[inv.clientId]?.name ?? 'Unknown' : 'No client';
    byClient.set(name, (byClient.get(name) ?? 0) + x.amountMinor);
  }
  section('Income by client');
  y = byClient.size
    ? table(doc, y, [{ label: 'Client', width: 130 }, { label: 'Amount', width: 44, align: 'right' }], [...byClient.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, money(v)]))
    : (text(doc, 'No invoice payments in this period.', M, y, { size: 9.5, color: MUTED }), y + 8);
  y += 4;

  section('Expenses by category');
  const cats = byCategory(txs, r, 'Expense');
  y = cats.length
    ? table(doc, y, [{ label: 'Category', width: 130 }, { label: 'Amount', width: 44, align: 'right' }], cats.map((c) => [c.name, money(c.amount)]))
    : (text(doc, 'No expenses in this period.', M, y, { size: 9.5, color: MUTED }), y + 8);
  y += 4;

  const unpaid = live(t.invoices).filter((i) => i.status === 'Sent' || i.status === 'Partially paid');
  section('Unpaid invoices');
  y = unpaid.length
    ? table(doc, y, [{ label: 'Invoice · client', width: 96 }, { label: 'Due', width: 34 }, { label: 'Balance', width: 44, align: 'right' }],
      unpaid.map((i) => [`${i.number} · ${i.clientId ? t.clients[i.clientId]?.name ?? '' : ''}`, formatDate(i.dueOn, { year: true }), pdfMoney(totalsFor(t, i).balance, i.currency)]))
    : (text(doc, 'Everything is paid.', M, y, { size: 9.5, color: MUTED }), y + 8);
  y += 4;

  section('All entries');
  y = inR.length
    ? table(doc, y, [{ label: 'Description', width: 76 }, { label: 'Date', width: 26 }, { label: 'Category', width: 34 }, { label: 'Amount', width: 38, align: 'right' }],
      inR.sort((a, b) => a.occurredOn.localeCompare(b.occurredOn)).map((x) => [x.title || x.category, formatDate(x.occurredOn, { year: true }), x.category, `${x.type === 'Expense' ? '-' : ''}${money(x.amountMinor)}`]))
    : (text(doc, 'No entries in this period.', M, y, { size: 9.5, color: MUTED }), y + 8);

  footer(doc, `${ws.name} · Financial report`);
  return doc;
}

export async function downloadReportPdf(t: Tables, ws: Workspace, r: Range) {
  const doc = await reportPdf(t, ws, r);
  doc.save(`${ws.name.replace(/[\\/:*?"<>|]/g, '-')} report ${r.start} to ${r.end}.pdf`);
}
