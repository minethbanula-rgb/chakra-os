// Loads the PDF builder (jsPDF) only when someone exports, keeping the main bundle small.
import type { Invoice, Tables, Workspace } from '@/data/types';
import type { Range } from './dates';

export async function downloadInvoicePdf(inv: Invoice, t: Tables, ws: Workspace) {
  return (await import('./pdf')).downloadInvoicePdf(inv, t, ws);
}
export async function downloadReportPdf(t: Tables, ws: Workspace, r: Range) {
  return (await import('./pdf')).downloadReportPdf(t, ws, r);
}
