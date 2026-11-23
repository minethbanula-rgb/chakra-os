import type { Milestone, Invoice } from '@/data/types';
import { useStore } from '@/data/store';
import { live, totalsFor } from '@/lib/domain';
import { formatDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';

export function portalUrl(token: string) {
  const base = `${location.origin}${location.pathname}`;
  return `${base}#/p/${token}`;
}

function primaryContact(clientId: string | null) {
  const t = useStore.getState().tables;
  if (!clientId) return null;
  const contacts = live(t.contacts).filter((c) => c.clientId === clientId);
  return contacts.find((c) => c.isPrimary) ?? contacts[0] ?? null;
}

/** Pre-written client update for a milestone. Sent from the user's own mail app. */
export function milestoneEmail(m: Milestone) {
  const s = useStore.getState();
  const project = s.tables.projects[m.projectId];
  const client = project?.clientId ? s.tables.clients[project.clientId] : null;
  const contact = primaryContact(project?.clientId ?? null);
  const link = live(s.tables.portalLinks).find((l) => l.clientId === client?.id && l.enabled);
  const lines = [
    `Hi ${contact?.name?.split(' ')[0] || 'there'},`,
    '',
    `Quick update on ${project?.name ?? 'your project'}: “${m.title}” is complete.`,
    project?.driveUrl ? `Files and updates: ${project.driveUrl}` : '',
    link ? `You can follow progress any time here: ${portalUrl(link.token)}` : '',
    '',
    'Thanks,',
    s.workspace.ownerName || s.workspace.name,
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '');
  const subject = `${project?.name ?? 'Project'} — ${m.title} complete`;
  return { to: contact?.email ?? '', subject, body: lines.join('\n'), href: `mailto:${encodeURIComponent(contact?.email ?? '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}` };
}

export function invoiceEmail(inv: Invoice, kind: 'send' | 'reminder') {
  const s = useStore.getState();
  const client = inv.clientId ? s.tables.clients[inv.clientId] : null;
  const contact = primaryContact(inv.clientId);
  const { total, balance } = totalsFor(s.tables, inv);
  const subject = kind === 'send' ? `Invoice ${inv.number} from ${s.workspace.name}` : `Reminder: invoice ${inv.number} is due`;
  const body = [
    `Hi ${contact?.name?.split(' ')[0] || client?.name || 'there'},`,
    '',
    kind === 'send'
      ? `Please find invoice ${inv.number} for ${formatMoney(total, inv.currency)} attached, due ${formatDate(inv.dueOn, { year: true })}.`
      : `A friendly reminder that invoice ${inv.number} has ${formatMoney(balance, inv.currency)} outstanding, due ${formatDate(inv.dueOn, { year: true })}.`,
    '',
    'Thank you,',
    s.workspace.ownerName || s.workspace.name,
  ].join('\n');
  return `mailto:${encodeURIComponent(contact?.email ?? '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
