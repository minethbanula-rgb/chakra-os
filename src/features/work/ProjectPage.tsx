import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, FileText, Flag, LayoutGrid, List, ListTodo, Mail, Plus, Receipt, SlidersHorizontal, Trash2 } from 'lucide-react';
import type { MilestoneStatus, Stage } from '@/data/types';
import { MILESTONE_STATUSES, STAGES } from '@/data/types';
import { useLive, useMembers, useRecord, useTables, useWorkspace, openQuickAdd } from '@/data/hooks';
import { addMilestone, createInvoice, deleteProject, setMilestoneStatus } from '@/data/actions';
import { removeRecord, updateRecord } from '@/data/store';
import { formatDate, relativeDay, today } from '@/lib/dates';
import { displayStatus, milestonesOf, projectProgress, totalsFor, live } from '@/lib/domain';
import { formatMoney, toMinor, fromMinor } from '@/lib/money';
import { Badge, Button, Checkbox, EmptyState, Field, IconButton, InlineInput, InlineTextarea, Input, Panel, Progress, Segmented, Select, Stat, StatusBadge, cx, toast, useConfirm } from '@/components/ui';
import { TaskList } from '@/features/tasks';
import { TaskBoard } from './Work';
import { milestoneEmail } from '@/features/notify';

type Tab = 'overview' | 'tasks' | 'milestones' | 'invoices' | 'activity';

export function ProjectPage() {
  const { id } = useParams();
  const p = useRecord('projects', id);
  const tables = useTables();
  const ws = useWorkspace();
  const clients = useLive('clients');
  const members = useMembers();
  const nav = useNavigate();
  const confirm = useConfirm();
  const [tab, setTab] = React.useState<Tab>('overview');
  const [taskView, setTaskView] = React.useState<'list' | 'board'>('list');
  const [showDone, setShowDone] = React.useState(false);

  if (!p || p.deletedAt) return <EmptyState title="Project not found" action={<Link to="/work"><Button>Back to projects</Button></Link>} />;
  const set = (patch: Partial<typeof p>) => updateRecord('projects', p.id, patch);
  const prog = projectProgress(tables, p.id);
  const tasks = live(tables.tasks).filter((t) => t.projectId === p.id);
  const openTasks = tasks.filter((t) => t.status !== 'Done').sort((a, b) => (a.dueOn ?? '9').localeCompare(b.dueOn ?? '9'));
  const ms = milestonesOf(tables, p.id);
  const invoices = live(tables.invoices).filter((i) => i.projectId === p.id);
  const invoiced = invoices.filter((i) => i.status !== 'Void').reduce((s, i) => s + totalsFor(tables, i).total, 0);
  const paid = invoices.reduce((s, i) => s + totalsFor(tables, i).paid, 0);
  const activity = live(tables.activity).filter((a) => a.entityId === p.id || tasks.some((t) => t.id === a.entityId) || ms.some((m) => m.id === a.entityId) || invoices.some((i) => i.id === a.entityId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const client = p.clientId ? tables.clients[p.clientId] : null;
  const nextMs = ms.find((m) => m.status !== 'Complete');

  return (
    <div>
      <Link to="/work" className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink"><ArrowLeft size={14} />Projects</Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <InlineInput aria-label="Project name" value={p.name} onCommit={(v) => v.trim() && set({ name: v.trim() })} className="!h-auto !border-transparent !bg-transparent !px-0 !py-0 text-[26px] font-semibold tracking-tight hover:!border-line focus:!px-2" />
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-muted">
            {client ? <Link to={`/clients/${client.id}`} className="hover:text-ink hover:underline">{client.name}</Link> : <span>No client</span>}
            {p.dueOn && <span>· Due {formatDate(p.dueOn)}</span>}
            {p.onHold && <Badge tone="warn">On hold</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Stage" value={p.stage} onChange={(e) => { set({ stage: e.target.value as Stage }); toast(`Moved to ${e.target.value}`, { undo: true }); }} options={[...STAGES]} className="!w-40" />
          <Button onClick={() => openQuickAdd({ projectId: p.id })}><Plus size={15} />Task</Button>
        </div>
      </div>

      <Segmented className="mb-5" value={tab} onChange={setTab} options={[
        { value: 'overview', label: 'Overview' }, { value: 'tasks', label: `Tasks ${openTasks.length}` }, { value: 'milestones', label: `Milestones ${ms.length}` },
        { value: 'invoices', label: `Invoices ${invoices.length}` }, { value: 'activity', label: 'Activity' },
      ]} />

      {tab === 'overview' && (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-4">
            <Panel>
              <div className="grid grid-cols-2 divide-x divide-line sm:grid-cols-4">
                <Stat label="Progress" value={prog.total ? `${prog.pct}%` : '—'} note={prog.total ? `${prog.done} of ${prog.total} ${prog.unit}` : 'Add tasks or milestones'} />
                <Stat label="Next milestone" value={nextMs ? relativeDay(nextMs.dueOn) : '—'} note={nextMs?.title ?? 'None planned'} />
                <Stat label="Invoiced" value={formatMoney(invoiced, ws.currency)} note={p.budgetMinor ? `of ${formatMoney(p.budgetMinor, ws.currency)} budget` : 'No budget set'} />
                <Stat label="Paid" value={formatMoney(paid, ws.currency)} note={invoiced ? `${formatMoney(invoiced - paid, ws.currency)} outstanding` : ''} />
              </div>
              {prog.total > 0 && <div className="border-t border-line px-4 py-3"><Progress value={prog.pct} /></div>}
            </Panel>
            <Panel icon={<ListTodo />} title="Up next" action={<Button size="sm" variant="ghost" onClick={() => setTab('tasks')}>All tasks</Button>}>
              <TaskList tasks={openTasks.slice(0, 5)} showProject={false} empty={<EmptyState title="No open tasks" action={<Button size="sm" onClick={() => openQuickAdd({ projectId: p.id })}>Add task</Button>} />} />
            </Panel>
            <Panel icon={<FileText />} title="Brief"><div className="p-4"><InlineTextarea aria-label="Description" value={p.description} onCommit={(v) => set({ description: v })} placeholder="Scope, deliverables, links to the brief…" /></div></Panel>
          </div>
          <Panel icon={<SlidersHorizontal />} title="Details">
            <div className="grid gap-3 p-4">
              <Field label="Client"><Select value={p.clientId ?? ''} onChange={(e) => set({ clientId: e.target.value || null })} options={[{ value: '', label: 'No client' }, ...clients.map((c) => ({ value: c.id, label: c.name }))]} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Start"><Input type="date" value={p.startOn ?? ''} onChange={(e) => set({ startOn: e.target.value || null })} /></Field>
                <Field label="Due"><Input type="date" value={p.dueOn ?? ''} onChange={(e) => set({ dueOn: e.target.value || null })} /></Field>
              </div>
              <Field label={`Budget (${ws.currency})`}><InlineInput inputMode="decimal" value={p.budgetMinor ? String(fromMinor(p.budgetMinor)) : ''} onCommit={(v) => set({ budgetMinor: toMinor(v || 0) })} placeholder="0" /></Field>
              <Field label="Owner"><Select value={p.ownerId ?? ''} onChange={(e) => set({ ownerId: e.target.value || null })} options={[{ value: '', label: 'No owner' }, ...members.map((m) => ({ value: m.id, label: m.name }))]} /></Field>
              <Field label="Files / updates link" hint="Shown to the client on their portal. Must start with https://">
                <div className="flex gap-2">
                  <InlineInput value={p.driveUrl} onCommit={(v) => { if (v && !v.startsWith('https://')) { toast('Links must start with https://', { tone: 'danger' }); return; } set({ driveUrl: v }); }} placeholder="https://drive.google.com/…" />
                  {p.driveUrl && <a href={p.driveUrl} target="_blank" rel="noopener noreferrer"><IconButton label="Open link"><ExternalLink size={16} /></IconButton></a>}
                </div>
              </Field>
              <label className="flex items-center gap-2.5 text-sm"><Checkbox checked={p.onHold} label="On hold" onChange={(v) => set({ onHold: v })} />On hold</label>
              <Button variant="danger" size="sm" className="mt-2 justify-self-start" onClick={() => confirm.ask('Delete project?', `${p.name}, its tasks and milestones will be deleted. Invoices are kept.`, 'Delete', () => { deleteProject(p.id); nav('/work'); toast('Project deleted', { undo: true }); })}><Trash2 size={14} />Delete project</Button>
            </div>
          </Panel>
        </div>
      )}

      {tab === 'tasks' && (
        <div className="grid gap-4">
          <div className="flex items-center gap-2">
            <Segmented value={taskView} onChange={setTaskView} options={[{ value: 'list', label: <span className="flex items-center gap-1.5"><List size={14} />List</span> }, { value: 'board', label: <span className="flex items-center gap-1.5"><LayoutGrid size={14} />Board</span> }]} />
            {taskView === 'list' && <label className="ml-auto flex items-center gap-2 text-[13px] text-muted"><Checkbox checked={showDone} label="Show completed" onChange={setShowDone} />Show completed</label>}
          </div>
          {taskView === 'board' ? <TaskBoard tasks={tasks} projectId={p.id} /> : (
            <Panel>
              <TaskList tasks={showDone ? [...openTasks, ...tasks.filter((t) => t.status === 'Done')] : openTasks} showProject={false}
                empty={<EmptyState title="No open tasks" action={<Button size="sm" onClick={() => openQuickAdd({ projectId: p.id })}>Add task</Button>} />} />
            </Panel>
          )}
        </div>
      )}

      {tab === 'milestones' && <Milestones projectId={p.id} />}

      {tab === 'invoices' && (
        <Panel icon={<Receipt />} title="Invoices" action={<Button size="sm" onClick={() => { const inv = createInvoice({ projectId: p.id }); nav(`/money/invoices/${inv.id}`); }}><FileText size={14} />Create invoice</Button>}>
          {invoices.length ? (
            <div className="divide-y divide-line">
              {invoices.map((i) => (
                <Link key={i.id} to={`/money/invoices/${i.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-subtle">
                  <div className="min-w-0 flex-1"><div className="text-sm font-medium">{i.number}</div><div className="text-xs text-muted">Issued {formatDate(i.issuedOn)} · due {formatDate(i.dueOn)}</div></div>
                  <span className="tabular text-sm">{formatMoney(totalsFor(tables, i).total, i.currency)}</span>
                  <StatusBadge status={displayStatus(i)} />
                </Link>
              ))}
            </div>
          ) : <EmptyState title="No invoices yet" text="Create one and the milestones arrive as line items." />}
        </Panel>
      )}

      {tab === 'activity' && (
        <Panel>
          {activity.length ? <div className="divide-y divide-line">{activity.map((a) => <div key={a.id} className="flex justify-between gap-3 px-4 py-2.5 text-sm"><span>{a.text}</span><span className="shrink-0 text-xs text-faint">{formatDate(a.createdAt.slice(0, 10))}</span></div>)}</div>
            : <EmptyState title="No activity yet" />}
        </Panel>
      )}
      {confirm.node}
    </div>
  );
}

function Milestones({ projectId }: { projectId: string }) {
  const tables = useTables();
  const ms = milestonesOf(tables, projectId);
  const [title, setTitle] = React.useState('');
  const [due, setDue] = React.useState('');
  const complete = (id: string) => {
    const m = tables.milestones[id];
    setMilestoneStatus(id, 'Complete');
    const mail = milestoneEmail(m);
    toast(`${m.title} complete`, { action: { label: 'Email client', run: () => window.open(mail.href, '_self') } });
  };
  return (
    <Panel icon={<Flag />} title="Milestones" action={<span className="text-xs text-faint">Visible milestones appear on the client portal</span>}>
      <ol className="divide-y divide-line">
        {ms.map((m) => {
          const late = m.status !== 'Complete' && m.dueOn && m.dueOn < today();
          return (
            <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Flag size={16} className={cx('shrink-0', m.status === 'Complete' ? 'text-good' : late ? 'text-bad' : 'text-accent')} />
              <InlineInput aria-label="Milestone" value={m.title} onCommit={(v) => updateRecord('milestones', m.id, { title: v })} className="!h-9 min-w-40 flex-1 !border-transparent !px-1 hover:!border-line" />
              <Input type="date" aria-label="Due date" value={m.dueOn ?? ''} onChange={(e) => updateRecord('milestones', m.id, { dueOn: e.target.value || null })} className={cx('!h-9 !w-40', late && 'text-bad')} />
              <Select aria-label="Status" value={m.status} onChange={(e) => (e.target.value === 'Complete' ? complete(m.id) : setMilestoneStatus(m.id, e.target.value as MilestoneStatus))} options={[...MILESTONE_STATUSES]} className="!h-9 !w-36" />
              <label className="flex items-center gap-2 text-xs text-muted" title="Show on client portal"><Checkbox checked={m.clientVisible} label="Client can see" onChange={(v) => updateRecord('milestones', m.id, { clientVisible: v })} />Portal</label>
              {m.status === 'Complete' && <a href={milestoneEmail(m).href}><IconButton label="Email client update"><Mail size={15} /></IconButton></a>}
              <IconButton label="Delete milestone" onClick={() => { removeRecord('milestones', m.id, 'Delete milestone'); toast('Milestone deleted', { undo: true }); }}><Trash2 size={15} /></IconButton>
            </li>
          );
        })}
      </ol>
      <form className="flex flex-wrap gap-2 border-t border-line p-4" onSubmit={(e) => { e.preventDefault(); if (!title.trim()) return; addMilestone(projectId, title.trim(), due || null); setTitle(''); setDue(''); }}>
        <Input placeholder="New milestone, e.g. Concepts presented" value={title} onChange={(e) => setTitle(e.target.value)} className="min-w-48 flex-1" />
        <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="!w-44" aria-label="Due date" />
        <Button type="submit" disabled={!title.trim()}><Plus size={15} />Add</Button>
      </form>
    </Panel>
  );
}
