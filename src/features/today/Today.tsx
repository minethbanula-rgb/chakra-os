import * as React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarCheck2, CalendarDays, CheckCircle2, CircleDollarSign, Flag, Inbox, Mail, PartyPopper, RefreshCw, Sparkles, Sun, Wallet } from 'lucide-react';
import { useLive, useMeId, useRecord, useTables, useWorkspace, openQuickAdd } from '@/data/hooks';
import { setMilestoneStatus } from '@/data/actions';
import { cycleRange, formatDate, greeting, parseISODate, relativeDay, today, addDays, daysBetween } from '@/lib/dates';
import { milestonesDue, moneyAlerts, todayBuckets, totalsIn, live, displayStatus } from '@/lib/domain';
import { formatMoney } from '@/lib/money';
import { Button, Panel, Progress, Segmented, cx, toast } from '@/components/ui';
import { TaskList } from '@/features/tasks';
import { milestoneEmail } from '@/features/notify';
import type { Milestone } from '@/data/types';

const SCOPE_KEY = 'chakra-today-scope';

export function Today() {
  const ws = useWorkspace();
  const meId = useMeId();
  const me = useRecord('members', meId);
  const tasks = useLive('tasks');
  const tables = useTables();
  const [scope, setScope] = React.useState<'mine' | 'all'>(() => (localStorage.getItem(SCOPE_KEY) as 'mine' | 'all') || 'mine');
  React.useEffect(() => localStorage.setItem(SCOPE_KEY, scope), [scope]);

  const visible = scope === 'mine' && meId ? tasks.filter((t) => t.assigneeId === meId || !t.assigneeId) : tasks;
  const b = todayBuckets(visible, ws);
  const alerts = moneyAlerts(tables, ws);
  const ms = milestonesDue(tables);
  const due = b.overdue.length + b.today.length;
  const overdueInvoices = alerts.filter((a) => a.tone === 'danger').length;

  const summary = [
    due ? `${due} thing${due === 1 ? '' : 's'} to do today` : 'Nothing due today',
    b.overdue.length ? `${b.overdue.length} overdue` : '',
    overdueInvoices ? `${overdueInvoices} invoice${overdueInvoices === 1 ? '' : 's'} overdue` : '',
  ].filter(Boolean).join(' · ');

  const firstName = (me?.name || ws.ownerName).split(' ')[0];
  const allClear = due === 0;

  return (
    <div className="grid gap-6">
      <section className="glass relative overflow-hidden rounded-3xl px-5 py-6 md:px-7 md:py-7">
        <div className="grid-lines pointer-events-none absolute inset-0 opacity-70" />
        <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0">
            <p className="text-[13px] text-muted">{parseISODate(today()).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
            <h1 className="mt-1 text-[30px] font-semibold leading-[1.1] tracking-[-0.035em] md:text-[36px]">{greeting()}{firstName ? `, ${firstName}` : ''}</h1>
            <p className="mt-2 text-[14px] text-muted">{summary}</p>
          </div>
          {meId && <Segmented value={scope} onChange={setScope} options={[{ value: 'mine', label: 'My work' }, { value: 'all', label: 'Everyone' }]} />}
        </div>
        <div className="relative mt-6 grid grid-cols-3 gap-2 md:max-w-xl">
          <HeroStat label="Overdue" value={b.overdue.length} tone={b.overdue.length ? 'bad' : undefined} />
          <HeroStat label="Due today" value={b.today.length} />
          <HeroStat label="This week" value={b.week.length} />
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-4">
          {allClear && (
            <div className="anim-pop flex items-center gap-4 rounded-xl border border-good/30 bg-good-soft px-5 py-4">
              <PartyPopper className="shrink-0 text-good" size={26} />
              <div className="min-w-0">
                <p className="font-semibold text-good">All clear for today</p>
                <p className="text-[13px] text-muted">
                  {b.week.length ? `Coming up this week: ${b.week.length} task${b.week.length === 1 ? '' : 's'}. Get ahead, or enjoy the space.` : 'Nothing else this week. Plan something new?'}
                </p>
              </div>
            </div>
          )}
          {b.overdue.length > 0 && <Panel icon={<AlertTriangle className="text-bad" />} title={<span className="text-bad">Overdue <span className="font-normal text-faint">· {b.overdue.length}</span></span>}><TaskList tasks={b.overdue} showAssignee={scope === 'all'} /></Panel>}
          {b.today.length > 0 && <Panel icon={<Sun />} title={<>Today <span className="font-normal text-faint">· {b.today.length}</span></>}><TaskList tasks={b.today} showAssignee={scope === 'all'} /></Panel>}
          <Panel icon={<CalendarDays />} title={<>This week <span className="font-normal text-faint">· {b.week.length}</span></>} action={<Button size="sm" variant="ghost" onClick={() => openQuickAdd()}>Add task</Button>}>
            <TaskList tasks={b.week} showAssignee={scope === 'all'} empty={<p className="px-4 py-5 text-[13px] text-muted">Nothing else due in the next 7 days.</p>} />
          </Panel>
          {b.noDate.length > 0 && <NoDate count={b.noDate.length}><TaskList tasks={b.noDate} showAssignee={scope === 'all'} /></NoDate>}
        </div>

        <div className="grid gap-4">
          <RhythmCards />
          <Panel icon={<Flag />} title="Milestones this week" sub="Client-facing checkpoints">
            {ms.length ? <div className="divide-y divide-line">{ms.map((m) => <MilestoneRow key={m.id} m={m} />)}</div>
              : <p className="px-4 py-5 text-[13px] text-muted">No client milestones due in the next 7 days.</p>}
          </Panel>
          <Panel icon={<Wallet />} title="Money" sub="This cycle at a glance" action={<Link to="/money" className="text-[13px] text-accent hover:underline">Open</Link>}>
            <CycleProgress />
            {alerts.length > 0 && (
              <div className="divide-y divide-line border-t border-line">
                {alerts.map((a) => (
                  <Link key={a.id + a.text} to={a.href} className="flex items-center gap-3 px-4 py-2.5 text-[13px] hover:bg-subtle">
                    {a.tone === 'danger' ? <AlertTriangle size={15} className="shrink-0 text-bad" /> : a.tone === 'warning' ? <CircleDollarSign size={15} className="shrink-0 text-warn" /> : <RefreshCw size={15} className="shrink-0 text-info" />}
                    <span className="min-w-0 flex-1">{a.text}</span>
                  </Link>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function HeroStat({ label, value, tone }: { label: string; value: number; tone?: 'bad' }) {
  return (
    <div className="rounded-xl border border-line bg-subtle/70 px-3 py-2.5 backdrop-blur">
      <div className={cx('tabular text-xl font-semibold tracking-tight', tone === 'bad' && 'text-bad')}>{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

function NoDate({ count, children }: { count: number; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Panel icon={<Inbox />} title={<>No due date <span className="font-normal text-faint">· {count}</span></>} action={<Button size="sm" variant="ghost" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'}</Button>}>
      {open ? children : null}
    </Panel>
  );
}

function MilestoneRow({ m }: { m: Milestone & { project: { name: string; clientId: string | null } } }) {
  const tables = useTables();
  const client = m.project.clientId ? tables.clients[m.project.clientId] : null;
  const late = m.dueOn && m.dueOn < today();
  const complete = () => {
    setMilestoneStatus(m.id, 'Complete');
    const mail = milestoneEmail(m);
    toast(`${m.title} complete`, { action: client ? { label: `Tell ${client.name}`, run: () => window.open(mail.href, '_self') } : undefined });
  };
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <Flag size={15} className={cx('shrink-0', late ? 'text-bad' : 'text-accent')} />
      <div className="min-w-0 flex-1">
        <Link to={`/work/p/${m.projectId}`} className="block truncate text-sm hover:underline">{m.title}</Link>
        <div className="truncate text-xs text-muted">{m.project.name} · <span className={late ? 'text-bad' : ''}>{relativeDay(m.dueOn)}</span></div>
      </div>
      <Button size="sm" onClick={complete} title="Mark complete"><CheckCircle2 size={14} />Done</Button>
    </div>
  );
}

function CycleProgress() {
  const ws = useWorkspace();
  const txs = useLive('transactions');
  const r = cycleRange(ws.cycleStartDay);
  const { income, net } = totalsIn(txs, r);
  const pct = ws.monthlyTargetMinor ? Math.round((income / ws.monthlyTargetMinor) * 100) : 0;
  const left = daysBetween(today(), r.end) + 1;
  return (
    <div className="px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted">Income this cycle · {r.label}</span>
        <span className="text-xs text-faint">{left} day{left === 1 ? '' : 's'} left</span>
      </div>
      <div className="tabular mt-1 text-xl font-semibold tracking-tight">{formatMoney(income, ws.currency)}</div>
      {ws.monthlyTargetMinor > 0 ? (
        <>
          <Progress value={pct} className="mt-2" />
          <div className="mt-1.5 flex justify-between text-xs text-muted"><span>{pct}% of {formatMoney(ws.monthlyTargetMinor, ws.currency)} target</span><span>Net {formatMoney(net, ws.currency)}</span></div>
        </>
      ) : <div className="mt-1 text-xs text-muted">Net {formatMoney(net, ws.currency)} · <Link to="/settings" className="text-accent hover:underline">set a monthly target</Link></div>}
    </div>
  );
}

/** Friday review and month close prompts. */
function RhythmCards() {
  const ws = useWorkspace();
  const tables = useTables();
  const t = today();
  const dow = parseISODate(t).getDay();
  const r = cycleRange(ws.cycleStartDay);
  const closeWindow = daysBetween(r.start, t) <= 3;
  const [dismissed, setDismissed] = React.useState<string[]>(() => JSON.parse(localStorage.getItem('chakra-rhythm') || '[]'));
  const dismiss = (k: string) => { const n = [...dismissed, k]; setDismissed(n); localStorage.setItem('chakra-rhythm', JSON.stringify(n.slice(-10))); };
  const weekKey = `review-${addDays(t, -((dow + 2) % 7))}`;
  const closeKey = `close-${r.start}`;
  const showReview = (dow === 5 || dow === 6) && !dismissed.includes(weekKey);
  const showClose = closeWindow && !dismissed.includes(closeKey) && live(tables.transactions).length > 0;
  if (!showReview && !showClose) return null;

  const tasks = live(tables.tasks);
  const overdue = tasks.filter((x) => x.status !== 'Done' && x.dueOn && x.dueOn < t).length;
  const doneThisWeek = tasks.filter((x) => x.completedAt && x.completedAt.slice(0, 10) >= addDays(t, -6)).length;
  const unpaid = live(tables.invoices).filter((i) => displayStatus(i) === 'Overdue').length;
  const drafts = live(tables.invoices).filter((i) => i.status === 'Draft').length;

  return (
    <>
      {showReview && (
        <div className="glass rounded-2xl border-accent/40 p-4 shadow-[0_0_30px_-10px_var(--c-accent)]">
          <div className="mb-2 flex items-center gap-2 font-semibold text-accent"><Sparkles size={16} />Weekly review</div>
          <ul className="grid gap-1 text-[13px]">
            <li>{doneThisWeek} task{doneThisWeek === 1 ? '' : 's'} completed this week</li>
            <li>{overdue ? <span className="text-bad">{overdue} overdue — reschedule or drop them</span> : 'Nothing overdue'}</li>
            <li>{drafts ? `${drafts} draft invoice${drafts === 1 ? '' : 's'} waiting to be sent` : 'No draft invoices'}</li>
          </ul>
          <div className="mt-3 flex gap-2">
            <Link to="/work/tasks"><Button size="sm">Plan next week</Button></Link>
            <Button size="sm" variant="ghost" onClick={() => dismiss(weekKey)}>Done</Button>
          </div>
        </div>
      )}
      {showClose && (
        <div className="glass rounded-2xl p-4">
          <div className="mb-2 flex items-center gap-2 font-semibold"><CalendarCheck2 size={16} className="text-accent" />Close last cycle</div>
          <p className="text-[13px] text-muted">A new cycle started {formatDate(r.start)}. Check {unpaid ? <b className="text-bad">{unpaid} overdue invoice{unpaid === 1 ? '' : 's'}</b> : 'invoices'}, review expenses, then export the report for your accountant.</p>
          <div className="mt-3 flex gap-2">
            <Link to="/money/reports"><Button size="sm"><Mail size={14} />Open report</Button></Link>
            <Button size="sm" variant="ghost" onClick={() => dismiss(closeKey)}>Done</Button>
          </div>
        </div>
      )}
    </>
  );
}

