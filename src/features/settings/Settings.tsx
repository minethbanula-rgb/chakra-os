import * as React from 'react';
import { useNavigate, useParams, NavLink } from 'react-router-dom';
import { Bell, Building2, DatabaseBackup, Download, LayoutTemplate, Mail, Palette, Plus, RotateCcw, Smartphone, Trash2, Upload, Users, Wallet } from 'lucide-react';
import type { Role, Snapshot, Template, TemplateItem, Member } from '@/data/types';
import { ROLES, PRIORITIES } from '@/data/types';
import { useLive, useMeId, useWorkspace, useTables } from '@/data/hooks';
import { createRecord, removeRecord, replaceSnapshot, restoreRecord, setMe, snapshot, updateRecord, updateWorkspace, useStore } from '@/data/store';
import { importV1, isV1 } from '@/data/importV1';
import { sampleSnapshot } from '@/data/sample';
import { formatDate } from '@/lib/dates';
import { CURRENCIES, formatMoney, fromMinor, toMinor } from '@/lib/money';
import { Avatar, Badge, Button, Checkbox, EmptyState, Field, IconButton, InlineInput, Input, Modal, PageHeader, Panel, Segmented, Select, cx, toast, useConfirm } from '@/components/ui';
import { CloudPanel } from './CloudPanel';
import { ChakraMark } from '@/components/Brand';
import { readImageFile } from '@/components/SiteIcon';

const TABS = [
  ['studio', 'Studio'], ['team', 'Team'], ['templates', 'Templates'], ['notifications', 'Notifications'], ['data', 'Data & sync'],
] as const;

export function Settings() {
  const { tab = 'studio' } = useParams();
  return (
    <>
      <PageHeader title="Settings" />
      <div className="-mx-4 mb-5 flex gap-6 overflow-x-auto border-b border-line px-4 md:mx-0 md:px-0">
        {TABS.map(([k, label]) => (
          <NavLink key={k} to={k === 'studio' ? '/settings' : `/settings/${k}`} end className={() => cx('relative h-10 shrink-0 px-1 text-sm font-medium', tab === k ? 'text-ink after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-accent' : 'text-muted hover:text-ink')}>{label}</NavLink>
        ))}
      </div>
      {tab === 'studio' && <Studio />}
      {tab === 'team' && <Team />}
      {tab === 'templates' && <Templates />}
      {tab === 'notifications' && <Notifications />}
      {tab === 'data' && <Data />}
    </>
  );
}

function Studio() {
  const ws = useWorkspace();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const onLogo = async (f: File | undefined) => {
    if (!f) return;
    try { updateWorkspace({ logo: await readImageFile(f) }); toast('Logo updated'); }
    catch (e) { toast((e as Error).message, { tone: 'danger' }); }
    if (fileRef.current) fileRef.current.value = '';
  };
  return (
    <div className="grid max-w-3xl gap-4">
      <Panel icon={<Building2 />} title="Studio">
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <Field label="Studio name"><InlineInput value={ws.name} onCommit={(v) => v.trim() && updateWorkspace({ name: v.trim() })} /></Field>
          <Field label="Owner name"><InlineInput value={ws.ownerName} onCommit={(v) => updateWorkspace({ ownerName: v })} /></Field>
          <Field label="Email (on invoices)"><InlineInput type="email" value={ws.email} onCommit={(v) => updateWorkspace({ email: v })} /></Field>
          <Field label="Website"><InlineInput value={ws.website} onCommit={(v) => updateWorkspace({ website: v })} /></Field>
          <Field label="Address" className="sm:col-span-2"><InlineInput value={ws.address} onCommit={(v) => updateWorkspace({ address: v })} /></Field>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-xl border border-line bg-subtle p-2">{ws.logo ? <img src={ws.logo} alt="Logo" className="h-full w-full object-contain" /> : <ChakraMark size={36} className="text-ink" />}</div>
            <div className="min-w-48 flex-1 text-[13px]"><div className="font-medium">Logo</div><div className="text-muted">PNG, JPG, SVG or WebP under 400 KB. Used in the app, invoices, PDFs and the client portal.</div></div>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={(e) => onLogo(e.target.files?.[0])} />
            <Button size="sm" onClick={() => fileRef.current?.click()}><Upload size={14} />{ws.logo ? 'Replace logo' : 'Upload logo'}</Button>
            {ws.logo && <Button size="sm" variant="ghost" onClick={() => updateWorkspace({ logo: null })}>Remove</Button>}
          </div>
        </div>
      </Panel>
      <Panel icon={<Wallet />} title="Money">
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <Field label="Currency" hint="Changing it relabels amounts; it does not convert them."><Select value={ws.currency} onChange={(e) => updateWorkspace({ currency: e.target.value })} options={[...new Set([ws.currency, ...CURRENCIES])]} /></Field>
          <Field label="Monthly cycle starts on" hint="e.g. 25 → reports run 25th to 24th. Short months use their last day.">
            <Select value={String(ws.cycleStartDay)} onChange={(e) => updateWorkspace({ cycleStartDay: Number(e.target.value) })} options={Array.from({ length: 31 }, (_, i) => ({ value: String(i + 1), label: i === 0 ? '1st (calendar month)' : `${i + 1}${['st', 'nd', 'rd'][((i + 1) % 10) - 1] && ![11, 12, 13].includes(i + 1) ? ['st', 'nd', 'rd'][((i + 1) % 10) - 1] : 'th'}` }))} />
          </Field>
          <Field label={`Monthly income target (${ws.currency})`}><InlineInput inputMode="decimal" value={ws.monthlyTargetMinor ? String(fromMinor(ws.monthlyTargetMinor)) : ''} placeholder="0" onCommit={(v) => updateWorkspace({ monthlyTargetMinor: toMinor(v || 0) })} /></Field>
          <Field label="Default tax %"><InlineInput inputMode="decimal" value={String(ws.taxDefault)} onCommit={(v) => updateWorkspace({ taxDefault: Math.max(0, Number(v) || 0) })} /></Field>
          <Field label="Invoice prefix" hint="Numbers look like INV-2026-001"><InlineInput value={ws.invoicePrefix} onCommit={(v) => updateWorkspace({ invoicePrefix: v })} /></Field>
          {ws.currency !== 'USD' && <Field label={`1 USD in ${ws.currency}`} hint="Used for USD subscriptions"><InlineInput inputMode="decimal" value={String(ws.fxUsd)} onCommit={(v) => updateWorkspace({ fxUsd: Number(v) || ws.fxUsd, fxUpdatedAt: new Date().toISOString() })} /></Field>}
        </div>
      </Panel>
      <Panel icon={<Palette />} title="Appearance">
        <div className="flex flex-wrap items-center gap-4 p-4">
          <Segmented value={ws.theme} onChange={(theme) => updateWorkspace({ theme })} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
          <Segmented value={String(ws.weekStartsOn) as '0' | '1'} onChange={(v) => updateWorkspace({ weekStartsOn: Number(v) as 0 | 1 })} options={[{ value: '1', label: 'Week starts Monday' }, { value: '0', label: 'Sunday' }]} />
        </div>
      </Panel>
    </div>
  );
}

function Team() {
  const members = useLive('members');
  const meId = useMeId();
  const cloud = useStore((s) => s.backend?.kind === 'cloud');
  const [f, setF] = React.useState({ name: '', email: '', role: 'member' as Role, title: '' });
  const [open, setOpen] = React.useState(false);
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return;
    createRecord('members', { name: f.name.trim(), email: f.email.trim().toLowerCase(), role: f.role, title: f.title, status: cloud && f.email ? 'Invited' : 'Active' }, `Add ${f.name}`);
    setF({ name: '', email: '', role: 'member', title: '' });
    setOpen(false);
    toast(cloud && f.email ? `Invite saved. ${f.name} can sign in with ${f.email}.` : `Added ${f.name}`);
  };
  const owners = members.filter((m) => m.role === 'owner').length;
  return (
    <div className="grid max-w-3xl gap-4">
      <Panel icon={<Users />} title="Team" action={<Button size="sm" onClick={() => setOpen(true)}><Plus size={14} />Add person</Button>}>
        <div className="divide-y divide-line">
          {members.map((m: Member) => (
            <div key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Avatar name={m.name} size={34} />
              <div className="min-w-40 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">{m.name}{m.id === meId && <Badge tone="accent">You</Badge>}{m.status === 'Invited' && <Badge tone="info">Invited</Badge>}</div>
                <div className="text-xs text-muted">{[m.title, m.email].filter(Boolean).join(' · ') || 'No email'}</div>
              </div>
              <Select aria-label="Role" value={m.role} disabled={m.role === 'owner' && owners === 1} onChange={(e) => updateRecord('members', m.id, { role: e.target.value as Role })} options={ROLES.map((r) => ({ value: r, label: r[0].toUpperCase() + r.slice(1) }))} className="!h-9 !w-32" />
              {m.id !== meId && <Button size="sm" variant="ghost" onClick={() => setMe(m.id)} title="Use this person for My work on Today">This is me</Button>}
              <IconButton label="Remove" disabled={m.role === 'owner' && owners === 1} onClick={() => { removeRecord('members', m.id, `Remove ${m.name}`); toast(`${m.name} removed`, { undo: true }); }}><Trash2 size={15} /></IconButton>
            </div>
          ))}
          {!members.length && <EmptyState title="Just you so far" text="Add teammates to assign tasks to them." />}
        </div>
      </Panel>
      <Panel>
        <div className="grid gap-1 p-4 text-[13px] text-muted">
          <p><b className="text-ink">Owner</b> — everything, including team, billing settings and deleting the studio.</p>
          <p><b className="text-ink">Admin</b> — everything except managing owners.</p>
          <p><b className="text-ink">Member</b> — projects, tasks and clients; no money pages.</p>
          {!cloud && <p className="mt-2 text-faint">Roles are enforced on the server once cloud sync is connected. In local mode everyone using this browser has full access.</p>}
        </div>
      </Panel>
      <Modal open={open} onOpenChange={setOpen} title="Add person" footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" type="submit" form="member-form">Add</Button></>}>
        <form id="member-form" onSubmit={add} className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Email" hint={cloud ? 'They sign in with this email' : undefined}><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Role"><Select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })} options={ROLES.map((r) => ({ value: r, label: r[0].toUpperCase() + r.slice(1) }))} /></Field>
          <Field label="Title"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Designer" /></Field>
        </form>
      </Modal>
    </div>
  );
}

function Templates() {
  const templates = useLive('templates');
  const [editing, setEditing] = React.useState<Template | null>(null);
  return (
    <div className="grid max-w-3xl gap-4">
      <Panel icon={<LayoutTemplate />} title="Project templates" action={<Button size="sm" onClick={() => { const t = createRecord('templates', { name: 'New template', milestones: [], tasks: [] }); setEditing(t); }}><Plus size={14} />New template</Button>}>
        <div className="divide-y divide-line">
          {templates.map((t) => (
            <button key={t.id} onClick={() => setEditing(t)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-subtle">
              <div className="min-w-0 flex-1"><div className="text-sm font-medium">{t.name}</div><div className="text-xs text-muted">{t.milestones.length} milestones · {t.tasks.length} tasks · {Math.max(0, ...t.milestones.map((m) => m.offsetDays), ...t.tasks.map((x) => x.offsetDays))} days</div></div>
            </button>
          ))}
          {!templates.length && <EmptyState title="No templates" text="Templates create a project's milestones and tasks with dates in one step." />}
        </div>
      </Panel>
      {editing && <TemplateEditor id={editing.id} onClose={() => setEditing(null)} />}
    </div>
  );
}

function TemplateEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTables().templates[id];
  if (!t) return null;
  const set = (patch: Partial<Template>) => updateRecord('templates', id, patch);
  const list = (key: 'milestones' | 'tasks') => {
    const items = t[key];
    const upd = (i: number, patch: Partial<TemplateItem>) => set({ [key]: items.map((x, j) => (j === i ? { ...x, ...patch } : x)) } as Partial<Template>);
    return (
      <div className="grid gap-2">
        {items.map((x, i) => (
          <div key={i} className="flex items-center gap-2">
            <InlineInput aria-label="Title" value={x.title} onCommit={(v) => upd(i, { title: v })} className="flex-1" />
            <span className="text-xs text-faint">Day</span>
            <InlineInput aria-label="Day offset" inputMode="numeric" value={String(x.offsetDays)} onCommit={(v) => upd(i, { offsetDays: Math.max(0, Number(v) || 0) })} className="!w-16" />
            {key === 'tasks' && <Select aria-label="Priority" value={x.priority ?? 'Medium'} onChange={(e) => upd(i, { priority: e.target.value as TemplateItem['priority'] })} options={[...PRIORITIES]} className="!w-28" />}
            <IconButton label="Remove" onClick={() => set({ [key]: items.filter((_, j) => j !== i) } as Partial<Template>)}><Trash2 size={15} /></IconButton>
          </div>
        ))}
        <Button size="sm" variant="ghost" className="justify-self-start" onClick={() => set({ [key]: [...items, { title: key === 'tasks' ? 'New task' : 'New milestone', offsetDays: (items.at(-1)?.offsetDays ?? 0) + 7 }] } as Partial<Template>)}><Plus size={14} />Add {key === 'tasks' ? 'task' : 'milestone'}</Button>
      </div>
    );
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Edit template" className="max-w-2xl"
      footer={<><Button variant="danger" onClick={() => { removeRecord('templates', id, 'Delete template'); onClose(); toast('Template deleted', { undo: true }); }}><Trash2 size={14} />Delete</Button><Button variant="primary" onClick={onClose}>Done</Button></>}>
      <div className="grid max-h-[60vh] gap-4 overflow-y-auto pr-1">
        <Field label="Name"><InlineInput value={t.name} onCommit={(v) => set({ name: v })} /></Field>
        <div><h3 className="mb-2 text-[13px] font-medium text-muted">Milestones (day = days after project start)</h3>{list('milestones')}</div>
        <div><h3 className="mb-2 text-[13px] font-medium text-muted">Tasks</h3>{list('tasks')}</div>
      </div>
    </Modal>
  );
}

function Notifications() {
  const ws = useWorkspace();
  const cloud = useStore((s) => s.backend?.kind === 'cloud');
  const [perm, setPerm] = React.useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  return (
    <div className="grid max-w-3xl gap-4">
      <Panel title={<span className="flex items-center gap-2"><Bell size={15} />Daily digest</span>}>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <Field label="Send my digest at" hint="Overdue and today's tasks, milestones and money alerts."><Input type="time" value={ws.digestTime} onChange={(e) => updateWorkspace({ digestTime: e.target.value })} /></Field>
          <div className="text-[13px] text-muted sm:pt-6">{cloud ? 'Digest emails and invoice reminders are sent by the server.' : 'Digest emails and automatic invoice reminders need cloud sync (Settings → Data & sync).'}</div>
        </div>
      </Panel>
      <Panel icon={<Mail />} title="Invoice reminders to clients">
        <div className="grid gap-2 p-4 text-[13px]">
          <label className="flex items-center gap-2.5 text-sm"><Checkbox checked={ws.autoReminders} label="Automatic reminders" onChange={(v) => updateWorkspace({ autoReminders: v })} />Email clients automatically about unpaid invoices</label>
          <p className="text-muted">Sent to the client's primary contact 3 days before the due date, then 1 and 7 days after, at your digest time. Polite, short, and only while a balance is due.{!cloud && ' Needs cloud sync.'} You can always send one by hand from the invoice.</p>
        </div>
      </Panel>
      <Panel icon={<Smartphone />} title="On this device">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-[13px]">
          <span className="text-muted">{perm === 'granted' ? 'Browser notifications are on. You get a nudge when you open the app with work overdue.' : perm === 'denied' ? 'Notifications are blocked in your browser settings.' : perm === 'unsupported' ? 'This browser does not support notifications.' : 'Get a gentle nudge on this device when something is overdue.'}</span>
          {perm === 'default' && <Button size="sm" onClick={async () => setPerm(await Notification.requestPermission())}>Turn on</Button>}
        </div>
      </Panel>
    </div>
  );
}

function Data() {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const deleted = useDeleted();
  const confirm = useConfirm();
  const nav = useNavigate();
  const download = () => {
    const blob = new Blob([JSON.stringify(snapshot(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `chakra-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const json = JSON.parse(await f.text());
      if (isV1(json)) {
        const { snapshot: snap, report } = importV1(json);
        confirm.ask('Import v1 backup?', `Replaces everything here with ${report.counts.projects} projects, ${report.counts.tasks} tasks, ${report.counts.clients} clients, ${report.counts.invoices} invoices and ${report.counts.transactions} income/expense entries (income ${formatMoney(report.incomeMinor, snap.workspace.currency)}, expenses ${formatMoney(report.expenseMinor, snap.workspace.currency)}). ${report.warnings.join(' ')}`, 'Replace and import', async () => { await replaceSnapshot(snap); toast('v1 backup imported'); nav('/'); });
      } else if ((json as Snapshot).schema === 2) {
        confirm.ask('Restore backup?', 'Replaces everything here with the backup file.', 'Replace and restore', async () => { await replaceSnapshot(json as Snapshot); toast('Backup restored'); nav('/'); });
      } else toast('That file is not a Chakra backup', { tone: 'danger' });
    } catch {
      toast('Could not read that file', { tone: 'danger' });
    }
    if (fileRef.current) fileRef.current.value = '';
  };
  return (
    <div className="grid max-w-3xl gap-4">
      <CloudPanel />
      <Panel icon={<DatabaseBackup />} title="Backup and restore">
        <div className="grid gap-3 p-4 text-[13px]">
          <p className="text-muted">Download everything as a JSON file, or restore one. v1 backups (Chakra Studio OS version 1) are converted automatically.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={download}><Download size={15} />Download backup</Button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            <Button onClick={() => fileRef.current?.click()}><Upload size={15} />Restore or import v1…</Button>
          </div>
        </div>
      </Panel>
      <Panel title={<>Recently deleted <span className="font-normal text-faint">· {deleted.length}</span></>}>
        {deleted.length ? (
          <div className="max-h-80 divide-y divide-line overflow-y-auto">
            {deleted.map((d) => (
              <div key={d.col + d.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1"><div className="truncate">{d.label}</div><div className="text-xs text-faint">{d.kind} · deleted {formatDate(d.at.slice(0, 10))}</div></div>
                <Button size="sm" variant="ghost" onClick={() => { restoreRecord(d.col, d.id); toast('Restored'); }}><RotateCcw size={14} />Restore</Button>
              </div>
            ))}
          </div>
        ) : <p className="px-4 py-4 text-[13px] text-muted">Nothing deleted.</p>}
      </Panel>
      <Panel icon={<RotateCcw />} title="Start over">
        <div className="flex flex-wrap gap-2 p-4">
          <Button onClick={() => confirm.ask('Load the sample studio?', 'Replaces everything here with a fictional studio. Download a backup first if you want to keep your data.', 'Load sample', async () => { await replaceSnapshot(sampleSnapshot()); nav('/'); })}>Load sample studio</Button>
          <Button variant="danger" onClick={() => confirm.ask('Erase everything?', 'All projects, clients, invoices and settings in this browser will be erased.', 'Erase', async () => { localStorage.clear(); location.hash = '#/'; location.reload(); })}>Erase this browser's data</Button>
        </div>
      </Panel>
      {confirm.node}
    </div>
  );
}

function useDeleted() {
  const t = useTables();
  const out: { col: 'projects' | 'tasks' | 'clients' | 'invoices' | 'subscriptions' | 'transactions'; id: string; label: string; kind: string; at: string }[] = [];
  for (const p of Object.values(t.projects)) if (p.deletedAt) out.push({ col: 'projects', id: p.id, label: p.name, kind: 'Project', at: p.deletedAt });
  for (const x of Object.values(t.tasks)) if (x.deletedAt) out.push({ col: 'tasks', id: x.id, label: x.title, kind: 'Task', at: x.deletedAt });
  for (const x of Object.values(t.clients)) if (x.deletedAt) out.push({ col: 'clients', id: x.id, label: x.name, kind: 'Client', at: x.deletedAt });
  for (const x of Object.values(t.invoices)) if (x.deletedAt) out.push({ col: 'invoices', id: x.id, label: x.number, kind: 'Invoice', at: x.deletedAt });
  for (const x of Object.values(t.subscriptions)) if (x.deletedAt) out.push({ col: 'subscriptions', id: x.id, label: x.name, kind: 'Subscription', at: x.deletedAt });
  for (const x of Object.values(t.transactions)) if (x.deletedAt && !x.paymentId) out.push({ col: 'transactions', id: x.id, label: x.title || x.category, kind: x.type, at: x.deletedAt });
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 50);
}

