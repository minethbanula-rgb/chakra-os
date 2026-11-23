import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import * as Dialog from '@radix-ui/react-dialog';
import { CalendarDays, Flag, FolderKanban, User, Users, FileText, Plus, Search, Home, Wallet, Settings, CheckSquare } from 'lucide-react';
import { useLive, useMembers, useUI, useWorkspace, openTask, openQuickAdd, openNewProject, openNewClient } from '@/data/hooks';
import { addTask, createProject, createInvoice } from '@/data/actions';
import { createRecord } from '@/data/store';
import { parseQuickAdd } from '@/lib/quickadd';
import { relativeDay, today } from '@/lib/dates';
import { toMinor } from '@/lib/money';
import { Badge, Button, Field, Input, Modal, Select, toast } from '@/components/ui';
import type { Template } from '@/data/types';

/* ---------- Quick add ---------- */

export function QuickAdd() {
  const state = useUI((s) => s.quickAdd);
  const projects = useLive('projects');
  const members = useMembers();
  const [text, setText] = React.useState('');
  const close = () => { useUI.setState({ quickAdd: { open: false } }); setText(''); };
  const parsed = React.useMemo(() => parseQuickAdd(text, { projects: projects.filter((p) => p.stage !== 'Archived'), members }), [text, projects, members]);
  const projectId = parsed.projectId ?? state.projectId ?? null;
  const project = projects.find((p) => p.id === projectId);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsed.title) return;
    const t = addTask({ title: parsed.title, projectId, dueOn: parsed.dueOn, priority: parsed.priority, ...(parsed.assigneeId ? { assigneeId: parsed.assigneeId } : {}), ...(state.status ? { status: state.status } : {}) });
    toast(`Added “${t.title}”`, { undo: true, action: { label: 'Open', run: () => openTask(t.id) } });
    close();
  };

  return (
    <Dialog.Root open={state.open} onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="anim-fade fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]" />
        <Dialog.Content aria-describedby={undefined} className="anim-pop fixed left-1/2 top-[14vh] z-50 w-[calc(100vw-24px)] max-w-xl -translate-x-1/2 rounded-2xl border border-line-strong bg-elevated shadow-pop focus:outline-none">
          <Dialog.Title className="sr-only">Quick add task</Dialog.Title>
          <form onSubmit={submit}>
            <div className="flex items-center gap-3 px-4 pt-4">
              <CheckSquare size={18} className="text-faint" />
              <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Logo revisions for Nova fri high @Kaweesha"
                className="h-10 w-full bg-transparent text-base outline-none placeholder:text-faint focus-visible:outline-none" aria-label="Task" />
            </div>
            <div className="flex min-h-12 flex-wrap items-center gap-2 px-4 py-3">
              {parsed.title && <span className="mr-1 text-[13px] text-muted">“{parsed.title}”</span>}
              <Badge tone={project ? 'accent' : 'neutral'}><FolderKanban size={12} />{project?.name ?? 'No project'}</Badge>
              <Badge tone={parsed.dueOn ? 'info' : 'neutral'}><CalendarDays size={12} />{parsed.dueOn ? relativeDay(parsed.dueOn) : 'No date'}</Badge>
              {parsed.priority !== 'Medium' && <Badge tone={parsed.priority === 'High' ? 'bad' : 'info'}><Flag size={12} />{parsed.priority}</Badge>}
              {parsed.matched.assignee && <Badge><User size={12} />{parsed.matched.assignee}</Badge>}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
              <p className="hidden text-xs text-faint sm:block">Try “tomorrow”, “fri”, “dec 5”, “high”, “for &lt;project&gt;”, “@name”</p>
              <Button type="submit" variant="primary" size="sm" disabled={!parsed.title}>Add task</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ---------- Command palette ---------- */

export function CommandPalette() {
  const open = useUI((s) => s.palette);
  const nav = useNavigate();
  const projects = useLive('projects');
  const tasks = useLive('tasks');
  const clients = useLive('clients');
  const invoices = useLive('invoices');
  const setOpen = (o: boolean) => useUI.setState({ palette: o });
  const go = (fn: () => void) => { setOpen(false); fn(); };

  React.useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(!useUI.getState().palette); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const item = 'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm aria-selected:bg-hover';
  const group = '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-faint';
  return (
    <Command.Dialog open={open} onOpenChange={setOpen} label="Search and commands"
      overlayClassName="anim-fade fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
      contentClassName="anim-pop fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-24px)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-line-strong bg-elevated shadow-pop">
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search size={18} className="text-faint" />
        <Command.Input placeholder="Search or type a command…" className="h-12 w-full bg-transparent text-base outline-none placeholder:text-faint focus-visible:outline-none" />
      </div>
      <Command.List className="max-h-[50vh] overflow-y-auto p-2">
        <Command.Empty className="px-3 py-6 text-center text-sm text-muted">No matches.</Command.Empty>
        <Command.Group heading="Create" className={group}>
          <Command.Item className={item} onSelect={() => go(() => openQuickAdd())}><Plus size={16} />New task</Command.Item>
          <Command.Item className={item} onSelect={() => go(() => openNewProject())}><FolderKanban size={16} />New project</Command.Item>
          <Command.Item className={item} onSelect={() => go(() => openNewClient())}><Users size={16} />New client</Command.Item>
          <Command.Item className={item} onSelect={() => go(() => { const inv = createInvoice(); nav(`/money/invoices/${inv.id}`); })}><FileText size={16} />New invoice</Command.Item>
        </Command.Group>
        <Command.Group heading="Go to" className={group}>
          {[['Today', '/', Home], ['Projects', '/work', FolderKanban], ['All tasks', '/work/tasks', CheckSquare], ['Clients', '/clients', Users], ['Money', '/money', Wallet], ['Invoices', '/money/invoices', FileText], ['Settings', '/settings', Settings]].map(([label, to, Icon]) => {
            const I = Icon as typeof Home;
            return <Command.Item key={to as string} className={item} onSelect={() => go(() => nav(to as string))}><I size={16} />{label as string}</Command.Item>;
          })}
        </Command.Group>
        <Command.Group heading="Projects" className={group}>
          {projects.map((p) => <Command.Item key={p.id} value={`project ${p.name}`} className={item} onSelect={() => go(() => nav(`/work/p/${p.id}`))}><FolderKanban size={16} className="text-faint" />{p.name}</Command.Item>)}
        </Command.Group>
        <Command.Group heading="Clients" className={group}>
          {clients.map((c) => <Command.Item key={c.id} value={`client ${c.name}`} className={item} onSelect={() => go(() => nav(`/clients/${c.id}`))}><Users size={16} className="text-faint" />{c.name}</Command.Item>)}
        </Command.Group>
        <Command.Group heading="Tasks" className={group}>
          {tasks.filter((t) => t.status !== 'Done').map((t) => <Command.Item key={t.id} value={`task ${t.title}`} className={item} onSelect={() => go(() => openTask(t.id))}><CheckSquare size={16} className="text-faint" />{t.title}</Command.Item>)}
        </Command.Group>
        <Command.Group heading="Invoices" className={group}>
          {invoices.map((i) => <Command.Item key={i.id} value={`invoice ${i.number}`} className={item} onSelect={() => go(() => nav(`/money/invoices/${i.id}`))}><FileText size={16} className="text-faint" />{i.number}</Command.Item>)}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}

/* ---------- New project ---------- */

export function NewProjectDialog() {
  const state = useUI((s) => s.newProject);
  const clients = useLive('clients');
  const templates = useLive('templates');
  const ws = useWorkspace();
  const nav = useNavigate();
  const [f, setF] = React.useState({ name: '', clientId: '', templateId: '', startOn: today(), dueOn: '', budget: '' });
  React.useEffect(() => { if (state.open) setF({ name: '', clientId: state.clientId ?? '', templateId: '', startOn: today(), dueOn: '', budget: '' }); }, [state.open, state.clientId]);
  const close = () => useUI.setState({ newProject: { open: false } });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return;
    const tpl = templates.find((t) => t.id === f.templateId) as Template | undefined;
    const p = createProject({ name: f.name.trim(), clientId: f.clientId || null, startOn: f.startOn || today(), dueOn: f.dueOn || null, budgetMinor: toMinor(f.budget || 0) }, tpl);
    close();
    toast(`Created ${p.name}`, { undo: true });
    nav(`/work/p/${p.id}`);
  };
  return (
    <Modal open={state.open} onOpenChange={(o) => !o && close()} title="New project"
      footer={<><Button onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="new-project" disabled={!f.name.trim()}>Create project</Button></>}>
      <form id="new-project" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Project name" className="sm:col-span-2"><Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Nova brand identity" /></Field>
        <Field label="Client"><Select value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })} options={[{ value: '', label: 'No client' }, ...clients.map((c) => ({ value: c.id, label: c.name }))]} /></Field>
        <Field label="Start from template" hint={f.templateId ? 'Milestones and tasks are dated from the start date.' : undefined}>
          <Select value={f.templateId} onChange={(e) => setF({ ...f, templateId: e.target.value })} options={[{ value: '', label: 'Blank project' }, ...templates.map((t) => ({ value: t.id, label: t.name }))]} />
        </Field>
        <Field label="Start date"><Input type="date" value={f.startOn} onChange={(e) => setF({ ...f, startOn: e.target.value })} /></Field>
        <Field label="Due date"><Input type="date" value={f.dueOn} onChange={(e) => setF({ ...f, dueOn: e.target.value })} placeholder={f.templateId ? 'From template' : ''} /></Field>
        <Field label={`Budget (${ws.currency})`} className="sm:col-span-2"><Input inputMode="decimal" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} placeholder="0" /></Field>
      </form>
    </Modal>
  );
}

/* ---------- New client ---------- */

export function NewClientDialog() {
  const open = useUI((s) => s.newClient);
  const nav = useNavigate();
  const [f, setF] = React.useState({ name: '', contact: '', email: '', industry: '' });
  React.useEffect(() => { if (open) setF({ name: '', contact: '', email: '', industry: '' }); }, [open]);
  const close = () => useUI.setState({ newClient: false });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return;
    const c = createRecord('clients', { name: f.name.trim(), status: 'Active', industry: f.industry, website: f.email.includes('@') ? f.email.split('@')[1] : '', location: '', notes: '', flagged: false }, `Add ${f.name}`);
    if (f.contact || f.email) createRecord('contacts', { clientId: c.id, name: f.contact, email: f.email, phone: '', isPrimary: true });
    close();
    toast(`Added ${c.name}`, { undo: true });
    nav(`/clients/${c.id}`);
  };
  return (
    <Modal open={open} onOpenChange={(o) => !o && close()} title="New client"
      footer={<><Button onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="new-client" disabled={!f.name.trim()}>Add client</Button></>}>
      <form id="new-client" onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Company name" className="sm:col-span-2"><Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Contact person (optional)"><Input value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></Field>
        <Field label="Email (optional)"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Industry (optional)" className="sm:col-span-2"><Input value={f.industry} onChange={(e) => setF({ ...f, industry: e.target.value })} /></Field>
      </form>
    </Modal>
  );
}
