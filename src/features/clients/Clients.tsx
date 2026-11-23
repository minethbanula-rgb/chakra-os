import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Contact, Copy, ExternalLink, FileText, FolderKanban, Globe, Link2Off, NotebookPen, Plus, Receipt, RefreshCw, Search, SlidersHorizontal, Star, Trash2, Users } from 'lucide-react';
import type { ClientStatus } from '@/data/types';
import { CLIENT_STATUSES } from '@/data/types';
import { useLive, useRecord, useTables, useWorkspace, openNewClient, openNewProject } from '@/data/hooks';
import { createInvoice, deleteClient, disablePortal, enablePortal, portalLinkFor } from '@/data/actions';
import { createRecord, removeRecord, updateRecord } from '@/data/store';
import { formatDate } from '@/lib/dates';
import { displayStatus, isOpenProject, live, projectProgress, totalsFor } from '@/lib/domain';
import { formatMoney } from '@/lib/money';
import { Badge, Button, Checkbox, EmptyState, Field, IconButton, InlineInput, InlineTextarea, Input, PageHeader, Panel, Progress, Segmented, Select, Stat, StatusBadge, toast, useConfirm } from '@/components/ui';
import { portalUrl } from '@/features/notify';
import { SiteIcon } from '@/components/SiteIcon';
import { useStore } from '@/data/store';

export function Clients() {
  const clients = useLive('clients');
  const tables = useTables();
  const ws = useWorkspace();
  const nav = useNavigate();
  const [q, setQ] = React.useState('');
  const [filter, setFilter] = React.useState<'Active' | 'All'>('Active');
  const outstandingFor = (id: string) => live(tables.invoices).filter((i) => i.clientId === id && (i.status === 'Sent' || i.status === 'Partially paid')).reduce((s, i) => s + totalsFor(tables, i).balance, 0);
  const list = clients
    .filter((c) => filter === 'All' || c.status === 'Active')
    .filter((c) => !q || `${c.name} ${c.industry}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <>
      <PageHeader title="Clients" action={<Button variant="primary" onClick={openNewClient}><Plus size={16} />New client</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={filter} onChange={setFilter} options={['Active', 'All']} />
        <div className="relative ml-auto w-full sm:w-64">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter clients" className="pl-9" />
        </div>
      </div>
      {!clients.length ? (
        <Panel><EmptyState icon={<Users size={28} />} title="No clients yet" text="Only the company name is needed to start." action={<Button variant="primary" onClick={openNewClient}>Add client</Button>} /></Panel>
      ) : (
        <Panel>
          <div className="divide-y divide-line">
            {list.map((c) => {
              const open = live(tables.projects).filter((p) => p.clientId === c.id && isOpenProject(p)).length;
              const owed = outstandingFor(c.id);
              const contact = live(tables.contacts).find((x) => x.clientId === c.id && x.isPrimary);
              return (
                <button key={c.id} onClick={() => nav(`/clients/${c.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-subtle">
                  <SiteIcon name={c.name} website={c.website} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{c.name}{c.flagged && <span className="ml-2 text-xs text-bad">flagged</span>}</div>
                    <div className="truncate text-xs text-muted">{[contact?.name, c.industry].filter(Boolean).join(' · ') || 'No contact yet'}</div>
                  </div>
                  <div className="hidden text-right text-xs text-muted sm:block">{open} open project{open === 1 ? '' : 's'}</div>
                  <div className="w-28 text-right">{owed ? <span className="tabular text-sm font-medium">{formatMoney(owed, ws.currency)}</span> : <span className="text-xs text-faint">Nothing owed</span>}</div>
                  {c.status !== 'Active' && <StatusBadge status={c.status} />}
                </button>
              );
            })}
            {!list.length && <EmptyState title="No clients match" />}
          </div>
        </Panel>
      )}
    </>
  );
}

export function ClientPage() {
  const { id } = useParams();
  const c = useRecord('clients', id);
  const tables = useTables();
  const ws = useWorkspace();
  const nav = useNavigate();
  const confirm = useConfirm();
  if (!c || c.deletedAt) return <EmptyState title="Client not found" action={<Link to="/clients"><Button>Back to clients</Button></Link>} />;
  const set = (patch: Partial<typeof c>) => updateRecord('clients', c.id, patch);
  const projects = live(tables.projects).filter((p) => p.clientId === c.id);
  const invoices = live(tables.invoices).filter((i) => i.clientId === c.id).sort((a, b) => b.issuedOn.localeCompare(a.issuedOn));
  const billed = invoices.filter((i) => i.status !== 'Void').reduce((s, i) => s + totalsFor(tables, i).total, 0);
  const paid = invoices.reduce((s, i) => s + totalsFor(tables, i).paid, 0);
  const owed = invoices.filter((i) => i.status === 'Sent' || i.status === 'Partially paid').reduce((s, i) => s + totalsFor(tables, i).balance, 0);

  return (
    <div>
      <Link to="/clients" className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink"><ArrowLeft size={14} />Clients</Link>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <SiteIcon name={c.name} website={c.website} size={48} />
        <div className="min-w-0 flex-1">
          <InlineInput aria-label="Company name" value={c.name} onCommit={(v) => v.trim() && set({ name: v.trim() })} className="!h-auto !border-transparent !bg-transparent !px-0 !py-0 text-[24px] font-semibold tracking-tight hover:!border-line focus:!px-2" />
          <div className="text-[13px] text-muted">{[c.industry, c.location].filter(Boolean).join(' · ') || 'Add details below'}</div>
        </div>
        <Button onClick={() => openNewProject(c.id)}><Plus size={15} />Project</Button>
        <Button onClick={() => { const inv = createInvoice({ clientId: c.id }); nav(`/money/invoices/${inv.id}`); }}><FileText size={15} />Invoice</Button>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-4">
          <Panel>
            <div className="grid grid-cols-3 divide-x divide-line">
              <Stat label="Billed" value={formatMoney(billed, ws.currency)} />
              <Stat label="Paid" value={formatMoney(paid, ws.currency)} />
              <Stat label="Owed" value={formatMoney(owed, ws.currency)} tone={owed ? 'bad' : undefined} />
            </div>
          </Panel>
          <Panel icon={<FolderKanban />} title="Projects">
            {projects.length ? (
              <div className="divide-y divide-line">
                {projects.map((p) => {
                  const prog = projectProgress(tables, p.id);
                  return (
                    <Link key={p.id} to={`/work/p/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-subtle">
                      <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{p.name}</div><div className="text-xs text-muted">{p.dueOn ? `Due ${formatDate(p.dueOn)}` : 'No due date'}</div></div>
                      {prog.total > 0 && <div className="hidden w-28 sm:block"><Progress value={prog.pct} /></div>}
                      <StatusBadge status={p.stage} />
                    </Link>
                  );
                })}
              </div>
            ) : <EmptyState title="No projects yet" action={<Button size="sm" onClick={() => openNewProject(c.id)}>New project</Button>} />}
          </Panel>
          <Panel icon={<Receipt />} title="Invoices">
            {invoices.length ? (
              <div className="divide-y divide-line">
                {invoices.map((i) => (
                  <Link key={i.id} to={`/money/invoices/${i.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-subtle">
                    <div className="min-w-0 flex-1"><div className="text-sm font-medium">{i.number}</div><div className="text-xs text-muted">Due {formatDate(i.dueOn)}</div></div>
                    <span className="tabular text-sm">{formatMoney(totalsFor(tables, i).total, i.currency)}</span>
                    <StatusBadge status={displayStatus(i)} />
                  </Link>
                ))}
              </div>
            ) : <EmptyState title="No invoices yet" />}
          </Panel>
          <Panel icon={<NotebookPen />} title="Notes"><div className="p-4"><InlineTextarea aria-label="Notes" value={c.notes} onCommit={(v) => set({ notes: v })} placeholder="Preferences, billing quirks, next steps. Private to your team." /></div></Panel>
        </div>

        <div className="grid gap-4">
          <PortalPanel clientId={c.id} />
          <Contacts clientId={c.id} />
          <Panel icon={<SlidersHorizontal />} title="Details">
            <div className="grid gap-3 p-4">
              <Field label="Status"><Select value={c.status} onChange={(e) => set({ status: e.target.value as ClientStatus })} options={[...CLIENT_STATUSES]} /></Field>
              <Field label="Industry"><InlineInput value={c.industry} onCommit={(v) => set({ industry: v })} /></Field>
              <Field label="Website"><InlineInput value={c.website} onCommit={(v) => set({ website: v })} /></Field>
              <Field label="Location"><InlineInput value={c.location} onCommit={(v) => set({ location: v })} /></Field>
              <label className="flex items-center gap-2.5 text-sm"><Checkbox checked={c.flagged} label="Flag client" onChange={(v) => set({ flagged: v })} />Flag (private warning for the team)</label>
              <Button variant="danger" size="sm" className="justify-self-start" onClick={() => confirm.ask('Delete client?', `${c.name} and its contacts and portal link will be deleted. Projects and invoices are kept.`, 'Delete', () => { deleteClient(c.id); nav('/clients'); toast('Client deleted', { undo: true }); })}><Trash2 size={14} />Delete client</Button>
            </div>
          </Panel>
        </div>
      </div>
      {confirm.node}
    </div>
  );
}

function Contacts({ clientId }: { clientId: string }) {
  const contacts = useLive('contacts').filter((c) => c.clientId === clientId);
  const [adding, setAdding] = React.useState(false);
  const [f, setF] = React.useState({ name: '', email: '', phone: '' });
  return (
    <Panel icon={<Contact />} title="Contacts" action={<Button size="sm" variant="ghost" onClick={() => setAdding(!adding)}><Plus size={14} />Add</Button>}>
      <div className="divide-y divide-line">
        {contacts.map((x) => (
          <div key={x.id} className="group grid gap-1 px-4 py-3">
            <div className="flex items-center gap-2">
              <InlineInput aria-label="Name" value={x.name} onCommit={(v) => updateRecord('contacts', x.id, { name: v })} className="!h-8 !border-transparent !px-1 font-medium hover:!border-line" placeholder="Name" />
              <IconButton label={x.isPrimary ? 'Primary contact' : 'Make primary'} onClick={() => { for (const o of contacts) updateRecord('contacts', o.id, { isPrimary: o.id === x.id }); }}><Star size={15} className={x.isPrimary ? 'fill-warn text-warn' : ''} /></IconButton>
              <IconButton label="Remove contact" className="opacity-0 group-hover:opacity-100" onClick={() => { removeRecord('contacts', x.id, 'Remove contact'); toast('Contact removed', { undo: true }); }}><Trash2 size={14} /></IconButton>
            </div>
            <InlineInput aria-label="Email" type="email" value={x.email} onCommit={(v) => updateRecord('contacts', x.id, { email: v })} className="!h-8 !border-transparent !px-1 text-[13px] hover:!border-line" placeholder="Email" />
            <InlineInput aria-label="Phone" value={x.phone} onCommit={(v) => updateRecord('contacts', x.id, { phone: v })} className="!h-8 !border-transparent !px-1 text-[13px] hover:!border-line" placeholder="Phone" />
          </div>
        ))}
        {!contacts.length && !adding && <p className="px-4 py-4 text-[13px] text-muted">No contacts yet. Invoice and update emails go to the primary contact.</p>}
      </div>
      {adding && (
        <form className="grid gap-2 border-t border-line p-4" onSubmit={(e) => { e.preventDefault(); if (!f.name && !f.email) return; createRecord('contacts', { clientId, ...f, isPrimary: contacts.length === 0 }); setF({ name: '', email: '', phone: '' }); setAdding(false); }}>
          <Input autoFocus placeholder="Name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Input type="email" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <Input placeholder="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <Button type="submit" variant="primary" size="sm">Save contact</Button>
        </form>
      )}
    </Panel>
  );
}

function PortalPanel({ clientId }: { clientId: string }) {
  useLive('portalLinks');
  const link = portalLinkFor(clientId);
  const cloud = useStore((s) => s.backend?.kind === 'cloud');
  const url = link ? portalUrl(link.token) : '';
  const copy = async () => { try { await navigator.clipboard.writeText(url); toast('Portal link copied'); } catch { toast(url); } };
  return (
    <Panel title={<span className="flex items-center gap-2"><Globe size={15} className="text-accent" />Client portal</span>}>
      <div className="grid gap-3 p-4 text-[13px]">
        {link?.enabled && !link.token ? (
          <>
            <div className="flex items-center gap-2"><Badge tone="good">Live</Badge><span className="text-muted">The link you shared is working.</span></div>
            <p className="text-xs text-faint">For security only a fingerprint of the link is stored, so it can't be shown again. Replace it to get a new link to copy (the old one stops working).</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => enablePortal(clientId, true)}><RefreshCw size={14} />Replace link</Button>
              <Button size="sm" variant="danger" onClick={() => { disablePortal(clientId); toast('Portal disabled', { undo: true }); }}><Link2Off size={14} />Disable</Button>
            </div>
          </>
        ) : link?.enabled ? (
          <>
            <div className="flex items-center gap-2"><Badge tone="good">Live</Badge><span className="text-muted">Anyone with the link can view progress</span></div>
            <div className="flex gap-2">
              <Input readOnly value={url} className="!h-9 text-xs" onFocus={(e) => e.target.select()} aria-label="Portal link" />
              <IconButton label="Copy link" onClick={copy}><Copy size={15} /></IconButton>
              <a href={url} target="_blank" rel="noopener noreferrer"><IconButton label="Preview portal"><ExternalLink size={15} /></IconButton></a>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => { enablePortal(clientId, true); toast('New link created. The old one no longer works.', { undo: true }); }}><RefreshCw size={14} />Replace link</Button>
              <Button size="sm" variant="danger" onClick={() => { disablePortal(clientId); toast('Portal disabled', { undo: true }); }}><Link2Off size={14} />Disable</Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-muted">Share a private link where this client sees their projects, milestones and file links. No invoices, notes or tasks are shown.</p>
            <Button size="sm" variant="primary" className="justify-self-start" onClick={() => enablePortal(clientId)}>Create portal link</Button>
          </>
        )}
        {!cloud && <p className="text-xs text-faint">In local mode the link only opens in this browser. Connect cloud sync in Settings to share it with clients.</p>}
      </div>
    </Panel>
  );
}
