import * as React from 'react';
import { NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarDays, FolderKanban, LayoutGrid, List, Plus, Search, PauseCircle } from 'lucide-react';
import type { Project, Stage, Task, TaskStatus } from '@/data/types';
import { TASK_STATUSES } from '@/data/types';
import { useLive, useMeId, useTables, useMemberName, openNewProject, openQuickAdd, openTask } from '@/data/hooks';
import { moveTask } from '@/data/actions';
import { updateRecord } from '@/data/store';
import { formatDate } from '@/lib/dates';
import { isOpenProject, projectProgress, todayBuckets } from '@/lib/domain';
import { useWorkspace } from '@/data/hooks';
import { Avatar, Badge, Button, EmptyState, Input, PageHeader, Panel, Progress, Segmented, StatusBadge, cx, toast } from '@/components/ui';
import { DueLabel, TaskList } from '@/features/tasks';

export function WorkTabs() {
  const tab = (to: string, label: string, end = false) => (
    <NavLink to={to} end={end} className={({ isActive }) => cx('relative h-10 px-1 text-sm font-medium', isActive ? 'text-ink after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-accent' : 'text-muted hover:text-ink')}>{label}</NavLink>
  );
  return <div className="mb-5 flex gap-6 border-b border-line md:hidden">{tab('/work', 'Projects', true)}{tab('/work/tasks', 'All tasks')}</div>;
}

function useViewParam<T extends string>(key: string, def: T) {
  const [params, setParams] = useSearchParams();
  const stored = localStorage.getItem(`chakra-${key}`) as T | null;
  const value = (params.get(key) as T) || stored || def;
  const set = (v: T) => { localStorage.setItem(`chakra-${key}`, v); const p = new URLSearchParams(params); p.set(key, v); setParams(p, { replace: true }); };
  return [value, set] as const;
}

/* ---------- Projects ---------- */

const BOARD_STAGES: Stage[] = ['Lead', 'Planning', 'In progress', 'Review', 'Delivered'];

export function Projects() {
  const projects = useLive('projects');
  const tables = useTables();
  const [view, setView] = useViewParam<'board' | 'list'>('pview', typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? 'list' : 'board');
  const [filter, setFilter] = useViewParam<'open' | 'all' | 'archived'>('pfilter', 'open');
  const [q, setQ] = React.useState('');
  const client = (p: Project) => (p.clientId ? tables.clients[p.clientId]?.name ?? '' : '');
  const list = projects
    .filter((p) => (filter === 'open' ? p.stage !== 'Archived' : filter === 'archived' ? p.stage === 'Archived' : true))
    .filter((p) => !q || `${p.name} ${client(p)}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.dueOn ?? '9').localeCompare(b.dueOn ?? '9'));

  return (
    <>
      <PageHeader title="Projects" action={<Button variant="primary" onClick={() => openNewProject()}><Plus size={16} />New project</Button>} />
      <WorkTabs />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={view} onChange={setView} options={[{ value: 'board', label: <span className="flex items-center gap-1.5"><LayoutGrid size={14} />Board</span> }, { value: 'list', label: <span className="flex items-center gap-1.5"><List size={14} />List</span> }]} />
        <Segmented value={filter} onChange={setFilter} options={[{ value: 'open', label: 'Current' }, { value: 'archived', label: 'Archived' }, { value: 'all', label: 'All' }]} />
        <div className="relative ml-auto w-full sm:w-64">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter projects" className="pl-9" />
        </div>
      </div>
      {!projects.length ? (
        <Panel><EmptyState icon={<FolderKanban size={28} />} title="No projects yet" text="Start one from a template and the milestones and tasks are dated for you." action={<Button variant="primary" onClick={() => openNewProject()}>New project</Button>} /></Panel>
      ) : view === 'board' && filter !== 'archived' ? <ProjectBoard projects={list} /> : <ProjectTable projects={list} />}
    </>
  );
}

function ProjectCard({ p }: { p: Project }) {
  const tables = useTables();
  const nav = useNavigate();
  const prog = projectProgress(tables, p.id);
  const late = p.dueOn && isOpenProject(p) && p.dueOn < new Date().toISOString().slice(0, 10);
  return (
    <article draggable onDragStart={(e) => { e.dataTransfer.setData('text/project', p.id); e.dataTransfer.effectAllowed = 'move'; }}
      onClick={() => nav(`/work/p/${p.id}`)} onKeyDown={(e) => e.key === 'Enter' && nav(`/work/p/${p.id}`)} tabIndex={0} role="link"
      className="glass cursor-pointer rounded-2xl p-3.5 transition-all hover:-translate-y-px hover:border-line-strong">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold leading-snug">{p.name}</h3>
        {p.onHold && <Badge tone="warn"><PauseCircle size={12} />On hold</Badge>}
      </div>
      <p className="mt-0.5 truncate text-xs text-muted">{p.clientId ? tables.clients[p.clientId]?.name : 'No client'}</p>
      {prog.total > 0 && (
        <div className="mt-3">
          <Progress value={prog.pct} />
          <div className="mt-1 text-xs text-muted">{prog.done} of {prog.total} {prog.unit}</div>
        </div>
      )}
      {p.dueOn && <div className={cx('mt-2 inline-flex items-center gap-1 text-xs', late ? 'font-medium text-bad' : 'text-muted')}><CalendarDays size={12} />{formatDate(p.dueOn)}</div>}
    </article>
  );
}

function ProjectBoard({ projects }: { projects: Project[] }) {
  const [over, setOver] = React.useState<Stage | null>(null);
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:grid md:grid-cols-5 md:overflow-visible md:px-0">
      {BOARD_STAGES.map((stage) => {
        const items = projects.filter((p) => p.stage === stage);
        return (
          <section key={stage} aria-label={stage}
            onDragOver={(e) => { e.preventDefault(); setOver(stage); }} onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData('text/project'); if (id) { updateRecord('projects', id, { stage }, `Move to ${stage}`); toast(`Moved to ${stage}`, { undo: true }); } }}
            className={cx('flex w-[78vw] max-w-[300px] shrink-0 snap-start flex-col gap-2 rounded-2xl border border-line bg-subtle/50 p-2 md:w-auto md:max-w-none', over === stage && 'border-accent/50')}>
            <div className="flex items-center justify-between px-1.5 py-1">
              <span className="text-[13px] font-semibold">{stage}</span>
              <span className="text-xs text-faint">{items.length}</span>
            </div>
            {items.map((p) => <ProjectCard key={p.id} p={p} />)}
            {!items.length && <div className="rounded-lg border border-dashed border-line-strong px-3 py-6 text-center text-xs text-faint">Drop here</div>}
          </section>
        );
      })}
    </div>
  );
}

function ProjectTable({ projects }: { projects: Project[] }) {
  const tables = useTables();
  const ws = useWorkspace();
  const nav = useNavigate();
  if (!projects.length) return <Panel><EmptyState title="No projects match" /></Panel>;
  return (
    <Panel bodyClass="overflow-x-auto">
      <div className="divide-y divide-line md:hidden">
        {projects.map((p) => {
          const prog = projectProgress(tables, p.id);
          return (
            <button key={p.id} onClick={() => nav(`/work/p/${p.id}`)} className="grid w-full gap-1.5 px-4 py-3 text-left hover:bg-subtle">
              <div className="flex items-start justify-between gap-2"><span className="font-medium">{p.name}</span><div className="flex shrink-0 gap-1"><StatusBadge status={p.stage} />{p.onHold && <StatusBadge status="On hold" />}</div></div>
              <div className="flex items-center justify-between gap-3 text-xs text-muted"><span className="truncate">{p.clientId ? tables.clients[p.clientId]?.name : 'No client'}{p.dueOn ? ` · due ${formatDate(p.dueOn)}` : ''}</span>{prog.total > 0 && <span className="shrink-0">{prog.done}/{prog.total} {prog.unit}</span>}</div>
              {prog.total > 0 && <Progress value={prog.pct} />}
            </button>
          );
        })}
      </div>
      <table className="hidden w-full min-w-[640px] text-sm md:table">
        <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="px-4 py-2.5 font-medium">Project</th><th className="px-3 font-medium">Stage</th><th className="px-3 font-medium">Progress</th><th className="px-3 font-medium">Due</th><th className="px-4 text-right font-medium">Budget</th></tr></thead>
        <tbody className="divide-y divide-line">
          {projects.map((p) => {
            const prog = projectProgress(tables, p.id);
            return (
              <tr key={p.id} onClick={() => nav(`/work/p/${p.id}`)} className="cursor-pointer hover:bg-subtle">
                <td className="px-4 py-3"><div className="font-medium">{p.name}</div><div className="text-xs text-muted">{p.clientId ? tables.clients[p.clientId]?.name : 'No client'}</div></td>
                <td className="px-3"><div className="flex gap-1"><StatusBadge status={p.stage} />{p.onHold && <StatusBadge status="On hold" />}</div></td>
                <td className="w-40 px-3">{prog.total ? <><Progress value={prog.pct} /><div className="mt-1 text-xs text-muted">{prog.done}/{prog.total} {prog.unit}</div></> : <span className="text-xs text-faint">—</span>}</td>
                <td className="px-3 text-muted">{p.dueOn ? formatDate(p.dueOn) : '—'}</td>
                <td className="tabular px-4 text-right">{p.budgetMinor ? new Intl.NumberFormat('en-US', { style: 'currency', currency: ws.currency, maximumFractionDigits: 0 }).format(p.budgetMinor / 100) : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

/* ---------- Tasks ---------- */

export function AllTasks() {
  const tasks = useLive('tasks');
  const meId = useMeId();
  const ws = useWorkspace();
  const [view, setView] = useViewParam<'list' | 'board'>('tview', 'list');
  const [scope, setScope] = useViewParam<'mine' | 'all' | 'done'>('tscope', meId ? 'mine' : 'all');
  const [q, setQ] = React.useState('');
  const filtered = tasks
    .filter((t) => (scope === 'mine' ? t.assigneeId === meId : true))
    .filter((t) => (scope === 'done' ? t.status === 'Done' : view === 'board' ? true : t.status !== 'Done'))
    .filter((t) => !q || t.title.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader title="Tasks" action={<Button variant="primary" onClick={() => openQuickAdd()}><Plus size={16} />New task</Button>} />
      <WorkTabs />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={view} onChange={setView} options={[{ value: 'list', label: <span className="flex items-center gap-1.5"><List size={14} />List</span> }, { value: 'board', label: <span className="flex items-center gap-1.5"><LayoutGrid size={14} />Board</span> }]} />
        <Segmented value={scope} onChange={setScope} options={[...(meId ? [{ value: 'mine' as const, label: 'Mine' }] : []), { value: 'all', label: 'Everyone' }, { value: 'done', label: 'Done' }]} />
        <div className="relative ml-auto w-full sm:w-64">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter tasks" className="pl-9" />
        </div>
      </div>
      {view === 'board' ? <TaskBoard tasks={filtered} /> : scope === 'done' ? (
        <Panel><TaskList tasks={filtered.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))} empty={<EmptyState title="Nothing completed yet" />} /></Panel>
      ) : <GroupedTasks tasks={filtered} weekStartsOn={ws.weekStartsOn} />}
    </>
  );
}

function GroupedTasks({ tasks, weekStartsOn }: { tasks: Task[]; weekStartsOn: 0 | 1 }) {
  const b = todayBuckets(tasks, { weekStartsOn });
  const groups: [string, Task[], string?][] = [['Overdue', b.overdue, 'text-bad'], ['Today', b.today], ['Next 7 days', b.week], ['Later', b.later], ['No due date', b.noDate]];
  if (!tasks.length) return <Panel><EmptyState title="No open tasks" text="Press N anywhere to add one." action={<Button onClick={() => openQuickAdd()}>Add task</Button>} /></Panel>;
  return (
    <div className="grid gap-4">
      {groups.filter(([, l]) => l.length).map(([label, list, cls]) => (
        <Panel key={label} title={<span className={cls}>{label} <span className="font-normal text-faint">· {list.length}</span></span>}><TaskList tasks={list} /></Panel>
      ))}
    </div>
  );
}

export function TaskBoard({ tasks, projectId }: { tasks: Task[]; projectId?: string }) {
  const tables = useTables();
  const memberName = useMemberName();
  const [over, setOver] = React.useState<TaskStatus | null>(null);
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
      {TASK_STATUSES.map((status) => {
        const items = tasks.filter((t) => t.status === status).sort((a, b) => a.position - b.position);
        return (
          <section key={status} aria-label={status}
            onDragOver={(e) => { e.preventDefault(); setOver(status); }} onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData('text/task'); if (id) moveTask(id, status, null); }}
            className={cx('flex w-[78vw] max-w-[300px] shrink-0 snap-start flex-col gap-2 rounded-2xl border border-line bg-subtle/50 p-2 md:w-auto md:max-w-none', over === status && 'border-accent/50')}>
            <div className="flex items-center justify-between px-1.5 py-1">
              <span className="text-[13px] font-semibold">{status} <span className="font-normal text-faint">{items.length}</span></span>
              <button aria-label={`Add to ${status}`} onClick={() => openQuickAdd({ status, projectId })} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-hover"><Plus size={15} /></button>
            </div>
            {items.map((t) => (
              <article key={t.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/task', t.id)}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(null); const id = e.dataTransfer.getData('text/task'); if (id && id !== t.id) moveTask(id, status, t.id); }}
                onClick={() => openTask(t.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openTask(t.id)}
                className="glass cursor-pointer rounded-xl p-3 transition-all hover:-translate-y-px hover:border-line-strong">
                <div className="flex items-start gap-2">
                  {t.priority === 'High' && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-bad" title="High priority" />}
                  <h3 className={cx('text-sm leading-snug', t.status === 'Done' && 'text-faint line-through')}>{t.title}</h3>
                </div>
                {!projectId && t.projectId && <p className="mt-1 truncate text-xs text-muted">{tables.projects[t.projectId]?.name}</p>}
                <div className="mt-2 flex items-center justify-between gap-2">
                  {t.status !== 'Done' ? <DueLabel task={t} /> : <span />}
                  {t.assigneeId && <Avatar name={memberName(t.assigneeId)} size={22} />}
                </div>
              </article>
            ))}
          </section>
        );
      })}
    </div>
  );
}

