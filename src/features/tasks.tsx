import * as React from 'react';
import { AlarmClock, Check, Repeat, Trash2, Plus, ListChecks, CalendarDays } from 'lucide-react';
import type { Task, TaskStatus } from '@/data/types';
import { PRIORITIES, RECURRENCES, TASK_STATUSES } from '@/data/types';
import { useLive, useMemberName, useRecord, useTables, useUI, openTask, useMembers } from '@/data/hooks';
import { addChecklistItem, deleteTask, setTaskStatus, snoozeTask, toggleChecklist } from '@/data/actions';
import { updateRecord, removeRecord } from '@/data/store';
import { addDays, relativeDay, today, weekRange } from '@/lib/dates';
import { checklistOf, isOverdue } from '@/lib/domain';
import { MemberAvatar } from '@/components/MemberAvatar';
import { Badge, Button, Checkbox, Field, IconButton, InlineInput, InlineTextarea, Input, Select, Sheet, cx, toast, useIsMobile } from '@/components/ui';

export function DueLabel({ task }: { task: Pick<Task, 'dueOn' | 'status'> }) {
  if (!task.dueOn) return null;
  const overdue = isOverdue(task);
  const isToday = task.dueOn === today();
  return (
    <span className={cx('inline-flex items-center gap-1 text-xs whitespace-nowrap', overdue ? 'font-medium text-bad' : isToday ? 'font-medium text-accent' : 'text-muted')}>
      <CalendarDays size={12} />{relativeDay(task.dueOn)}
    </span>
  );
}

export function completeWithToast(t: Task) {
  setTaskStatus(t.id, 'Done');
  toast(t.recurrence !== 'none' ? `Done. Next one is scheduled.` : `Completed “${t.title}”`, { undo: true });
}

export function snoozeMenuDates() {
  const t = today();
  const nextMonday = weekRange(addDays(t, 7), 1).start;
  return [
    { label: 'Tomorrow', date: addDays(t, 1) },
    { label: 'In 3 days', date: addDays(t, 3) },
    { label: 'Next week', date: nextMonday },
  ];
}

function SnoozeButton({ task }: { task: Task }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <IconButton label="Snooze" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}><AlarmClock size={16} /></IconButton>
      {open && (
        <div className="anim-pop absolute right-0 top-10 z-20 w-40 rounded-xl border border-line-strong bg-elevated p-1 shadow-pop" onClick={(e) => e.stopPropagation()}>
          {snoozeMenuDates().map((o) => (
            <button key={o.label} className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[13px] hover:bg-hover"
              onClick={() => { snoozeTask(task.id, o.date); setOpen(false); toast(`Snoozed to ${relativeDay(o.date).toLowerCase()}`, { undo: true }); }}>
              {o.label}<span className="text-xs text-faint">{relativeDay(o.date).slice(0, 3)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A task line used on Today, project pages and lists. Swipe right = done, left = snooze (phones). */
export function TaskRow({ task, showProject = true, showAssignee = true }: { task: Task; showProject?: boolean; showAssignee?: boolean }) {
  const tables = useTables();
  const memberName = useMemberName();
  const project = task.projectId ? tables.projects[task.projectId] : null;
  const checklist = checklistOf(tables, task.id);
  const done = task.status === 'Done';
  const mobile = useIsMobile();
  const [dx, setDx] = React.useState(0);
  const start = React.useRef<{ x: number; y: number; active: boolean } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => { if (mobile && e.pointerType === 'touch') start.current = { x: e.clientX, y: e.clientY, active: false }; };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s) return;
    const mx = e.clientX - s.x, my = e.clientY - s.y;
    if (!s.active && Math.abs(my) > 12) { start.current = null; setDx(0); return; }
    if (Math.abs(mx) > 12) s.active = true;
    if (s.active) setDx(Math.max(-120, Math.min(120, mx)));
  };
  const onPointerUp = () => {
    if (dx > 80 && !done) completeWithToast(task);
    else if (dx < -80) { snoozeTask(task.id, addDays(today(), 1)); toast('Snoozed to tomorrow', { undo: true }); }
    start.current = null;
    setDx(0);
  };

  return (
    <div className="relative overflow-hidden">
      {dx !== 0 && (
        <div className={cx('absolute inset-0 flex items-center px-5 text-sm font-medium text-white', dx > 0 ? 'justify-start bg-good' : 'justify-end bg-warn')}>
          {dx > 0 ? <><Check size={16} className="mr-1" />Done</> : <><AlarmClock size={16} className="mr-1" />Tomorrow</>}
        </div>
      )}
      <div role="button" tabIndex={0} onClick={() => dx === 0 && openTask(task.id)} onKeyDown={(e) => e.key === 'Enter' && openTask(task.id)}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, background: dx ? 'var(--c-elevated)' : undefined, touchAction: 'pan-y' }}
        className="group relative flex min-h-14 cursor-pointer items-center gap-3 px-4 py-2.5 transition-colors hover:bg-hover">
        <Checkbox checked={done} label={done ? `Reopen ${task.title}` : `Complete ${task.title}`} onChange={(v) => (v ? completeWithToast(task) : setTaskStatus(task.id, 'To do'))} />
        <div className="min-w-0 flex-1">
          <div className={cx('truncate text-sm', done && 'text-faint line-through')}>
            {task.priority === 'High' && !done && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-bad align-middle" title="High priority" />}
            {task.title}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
            {showProject && <span className="truncate">{project?.name ?? 'No project'}</span>}
            {!done && <DueLabel task={task} />}
            {checklist.length > 0 && <span className="inline-flex items-center gap-1"><ListChecks size={12} />{checklist.filter((c) => c.done).length}/{checklist.length}</span>}
            {task.recurrence !== 'none' && <span className="inline-flex items-center gap-1"><Repeat size={12} />{task.recurrence}</span>}
            {task.status !== 'To do' && task.status !== 'Done' && <span>{task.status}</span>}
          </div>
        </div>
        {showAssignee && task.assigneeId && <MemberAvatar id={task.assigneeId} fallbackName={memberName(task.assigneeId)} size={24} />}
        {!done && <div className="hidden opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 md:block"><SnoozeButton task={task} /></div>}
      </div>
    </div>
  );
}

export function TaskList({ tasks, empty, showProject, showAssignee }: { tasks: Task[]; empty?: React.ReactNode; showProject?: boolean; showAssignee?: boolean }) {
  if (!tasks.length) return <>{empty ?? null}</>;
  return <div className="divide-y divide-line">{tasks.map((t) => <TaskRow key={t.id} task={t} showProject={showProject} showAssignee={showAssignee} />)}</div>;
}

/* ---------- Task detail panel ---------- */

export function TaskPanel() {
  const id = useUI((s) => s.taskId);
  const task = useRecord('tasks', id);
  const projects = useLive('projects');
  const members = useMembers();
  const tables = useTables();
  const [newItem, setNewItem] = React.useState('');
  const open = !!task && !task.deletedAt;
  const set = (patch: Partial<Task>) => task && updateRecord('tasks', task.id, patch);
  const items = task ? checklistOf(tables, task.id) : [];

  return (
    <Sheet open={open} onOpenChange={(o) => !o && openTask(null)} title={task ? 'Task' : ''}
      footer={task && <>
        <Button variant="danger" size="sm" onClick={() => { deleteTask(task.id); openTask(null); toast('Task deleted', { undo: true }); }}><Trash2 size={14} />Delete</Button>
        {task.status === 'Done'
          ? <Button size="sm" onClick={() => setTaskStatus(task.id, 'To do')}>Reopen</Button>
          : <Button variant="primary" size="sm" onClick={() => { completeWithToast(task); openTask(null); }}><Check size={14} />Mark done</Button>}
      </>}>
      {task && (
        <div className="grid gap-4">
          <InlineInput aria-label="Title" value={task.title} onCommit={(v) => v.trim() && set({ title: v.trim() })} className="!h-11 !border-transparent !px-0 text-lg font-semibold hover:!border-line focus:!px-3" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status"><Select value={task.status} onChange={(e) => setTaskStatus(task.id, e.target.value as TaskStatus)} options={[...TASK_STATUSES]} /></Field>
            <Field label="Priority"><Select value={task.priority} onChange={(e) => set({ priority: e.target.value as Task['priority'] })} options={[...PRIORITIES]} /></Field>
            <Field label="Due"><Input type="date" value={task.dueOn ?? ''} onChange={(e) => set({ dueOn: e.target.value || null })} /></Field>
            <Field label="Assignee"><Select value={task.assigneeId ?? ''} onChange={(e) => set({ assigneeId: e.target.value || null })} options={[{ value: '', label: 'Unassigned' }, ...members.map((m) => ({ value: m.id, label: m.name }))]} /></Field>
            <Field label="Project" className="col-span-2"><Select value={task.projectId ?? ''} onChange={(e) => set({ projectId: e.target.value || null })} options={[{ value: '', label: 'No project' }, ...projects.filter((p) => p.stage !== 'Archived' || p.id === task.projectId).map((p) => ({ value: p.id, label: p.name }))]} /></Field>
            <Field label="Repeats"><Select value={task.recurrence} onChange={(e) => set({ recurrence: e.target.value as Task['recurrence'] })} options={RECURRENCES.map((r) => ({ value: r, label: r === 'none' ? 'Does not repeat' : r[0].toUpperCase() + r.slice(1) }))} /></Field>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[13px] font-medium text-muted">Checklist</h3>
              {items.length > 0 && <Badge>{items.filter((c) => c.done).length}/{items.length}</Badge>}
            </div>
            <div className="grid gap-1">
              {items.map((c) => (
                <div key={c.id} className="group flex items-center gap-2.5 rounded-lg px-1 py-1 hover:bg-subtle">
                  <Checkbox checked={c.done} label={c.text} onChange={() => toggleChecklist(c.id)} />
                  <InlineInput aria-label="Checklist item" value={c.text} onCommit={(v) => updateRecord('checklist', c.id, { text: v })} className={cx('!h-8 !border-transparent !bg-transparent !px-1', c.done && 'text-faint line-through')} />
                  <IconButton label="Remove step" className="opacity-0 group-hover:opacity-100" onClick={() => removeRecord('checklist', c.id)}><Trash2 size={14} /></IconButton>
                </div>
              ))}
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newItem.trim()) { addChecklistItem(task.id, newItem.trim()); setNewItem(''); } }}>
                <Input placeholder="Add a step" value={newItem} onChange={(e) => setNewItem(e.target.value)} className="!h-9" />
                <Button type="submit" size="sm" className="!h-9" aria-label="Add step"><Plus size={14} /></Button>
              </form>
            </div>
          </div>

          <Field label="Notes"><InlineTextarea value={task.notes} onCommit={(v) => set({ notes: v })} placeholder="Links, context, client feedback…" /></Field>
        </div>
      )}
    </Sheet>
  );
}
