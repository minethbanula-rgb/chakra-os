import * as React from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Circle, CircleDot, ExternalLink, Loader2 } from 'lucide-react';
import { cloudConfigured, fetchPortal, type PortalData } from '@/data/cloud';
import { useStore } from '@/data/store';
import { live, milestonesOf, tasksOf } from '@/lib/domain';
import { formatDate } from '@/lib/dates';
import { cx } from '@/components/ui';

/** Builds the same client-safe view from local data (local mode / preview). */
function localPortal(token: string): PortalData | null {
  const s = useStore.getState();
  const link = live(s.tables.portalLinks).find((l) => l.token === token && l.enabled);
  const client = link ? s.tables.clients[link.clientId] : null;
  if (!link || !client || client.deletedAt) return null;
  return {
    studio: { name: s.workspace.name, logo: s.workspace.logo, email: s.workspace.email, website: s.workspace.website },
    client: { name: client.name },
    projects: live(s.tables.projects)
      .filter((p) => p.clientId === client.id && ['Planning', 'In progress', 'Review', 'Delivered'].includes(p.stage))
      .sort((a, b) => (a.dueOn ?? '9').localeCompare(b.dueOn ?? '9'))
      .map((p) => {
        const tasks = tasksOf(s.tables, p.id);
        return {
          name: p.name, stage: p.stage, onHold: p.onHold, startOn: p.startOn, dueOn: p.dueOn, driveUrl: p.driveUrl || null,
          milestones: milestonesOf(s.tables, p.id).filter((m) => m.clientVisible).map((m) => ({ title: m.title, dueOn: m.dueOn, status: m.status })),
          tasksDone: tasks.filter((t) => t.status === 'Done').length, tasksTotal: tasks.length,
        };
      }),
  };
}

const STAGE_COPY: Record<string, string> = { Planning: 'Planning', 'In progress': 'In progress', Review: 'In review with you', Delivered: 'Delivered' };

export function Portal() {
  const { token = '' } = useParams();
  const [data, setData] = React.useState<PortalData | null | undefined>(undefined);
  React.useEffect(() => {
    document.documentElement.classList.add('dark');
    if (cloudConfigured) fetchPortal(token).then(setData).catch(() => setData(null));
    else setData(localPortal(token));
  }, [token]);

  if (data === undefined) return <div className="grid min-h-dvh place-items-center text-muted"><Loader2 className="animate-spin" /></div>;
  if (!data) return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div><p className="text-lg font-semibold">This link isn't active</p><p className="mt-1 text-sm text-muted">It may have been replaced or turned off. Ask your studio contact for a new link.</p></div>
    </div>
  );
  return (
    <div className="min-h-dvh bg-bg">
      <header className="border-b border-line bg-panel/70 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-5">
          {data.studio.logo ? <img src={data.studio.logo} alt="" className="h-10 w-10 rounded-lg object-contain" /> : <img src="./icon.svg" alt="" className="h-10 w-10" />}
          <div className="min-w-0"><div className="font-semibold">{data.studio.name}</div><div className="text-[13px] text-muted">Project updates for {data.client.name}</div></div>
        </div>
      </header>
      <main className="mx-auto grid max-w-3xl gap-4 px-5 py-8">
        {!data.projects.length && <p className="text-center text-muted">No active projects right now.</p>}
        {data.projects.map((p) => {
          const pct = p.tasksTotal ? Math.round((p.tasksDone / p.tasksTotal) * 100) : null;
          return (
            <section key={p.name} className="glass rounded-2xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h2 className="text-lg font-semibold">{p.name}</h2><p className="text-[13px] text-muted">{p.onHold ? 'Paused' : STAGE_COPY[p.stage] ?? p.stage}{p.dueOn ? ` · target ${formatDate(p.dueOn, { year: true })}` : ''}</p></div>
                {pct !== null && <div className="text-right"><div className="tabular text-2xl font-semibold">{pct}%</div><div className="text-xs text-muted">complete</div></div>}
              </div>
              {pct !== null && <div className="mt-3 h-2 overflow-hidden rounded-full bg-subtle"><div className="progress-glow h-full rounded-full" style={{ width: `${pct}%` }} /></div>}
              {p.milestones.length > 0 && (
                <ol className="mt-5 grid gap-0">
                  {p.milestones.map((m, i) => (
                    <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                      {i < p.milestones.length - 1 && <span className="absolute left-[9px] top-6 h-[calc(100%-18px)] w-px bg-line-strong" />}
                      {m.status === 'Complete' ? <CheckCircle2 size={19} className="shrink-0 text-good" /> : m.status === 'In progress' ? <CircleDot size={19} className="shrink-0 text-accent" /> : <Circle size={19} className="shrink-0 text-faint" />}
                      <div className="min-w-0 flex-1"><div className={cx('text-sm', m.status === 'Complete' && 'text-muted')}>{m.title}</div><div className="text-xs text-faint">{m.status === 'Complete' ? 'Done' : m.dueOn ? formatDate(m.dueOn, { year: true }) : 'Date to be confirmed'}</div></div>
                    </li>
                  ))}
                </ol>
              )}
              {p.driveUrl && <a href={p.driveUrl} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline">Files and latest updates<ExternalLink size={14} /></a>}
            </section>
          );
        })}
        <footer className="pt-4 text-center text-xs text-faint">{[data.studio.email, data.studio.website].filter(Boolean).join(' · ')}</footer>
      </main>
    </div>
  );
}
