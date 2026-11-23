import * as React from 'react';
import { ArrowRight, FileUp, ImagePlus, Sparkles, Square } from 'lucide-react';
import { ChakraMark } from '@/components/Brand';
import { readImageFile } from '@/components/SiteIcon';
import { batch, createRecord, replaceSnapshot, setMe, updateWorkspace, useStore } from '@/data/store';
import { sampleSnapshot, templateDrafts } from '@/data/sample';
import { importV1, isV1 } from '@/data/importV1';
import type { Snapshot } from '@/data/types';
import { CURRENCIES } from '@/lib/money';
import { Button, Field, Input, Select, cx, toast } from '@/components/ui';

/** First run: three questions, then pick how to start. */
export function Onboarding() {
  const ws = useStore((s) => s.workspace);
  const [f, setF] = React.useState({ name: ws.name === 'My Studio' ? '' : ws.name, owner: ws.ownerName, currency: ws.currency, cycle: String(ws.cycleStartDay) });
  const [start, setStart] = React.useState<'empty' | 'sample' | 'import'>('empty');
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [logo, setLogo] = React.useState<string | null>(ws.logo);
  const logoRef = React.useRef<HTMLInputElement>(null);

  const finish = async () => {
    if (start === 'sample') {
      await replaceSnapshot(sampleSnapshot());
      return;
    }
    batch('Set up studio', () => {
      updateWorkspace({ name: f.name.trim() || 'My Studio', ownerName: f.owner.trim(), currency: f.currency, cycleStartDay: Number(f.cycle), logo, onboarded: true });
      const me = createRecord('members', { name: f.owner.trim() || 'Me', email: '', role: 'owner', title: 'Owner', status: 'Active' });
      setMe(me.id);
      for (const t of templateDrafts()) createRecord('templates', t);
    });
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const json = JSON.parse(await file.text());
      if (isV1(json)) {
        const { snapshot, report } = importV1(json);
        for (const t of templateDrafts()) {
          const id = crypto.randomUUID();
          const ts = new Date().toISOString();
          snapshot.tables.templates[id] = { ...t, id, createdAt: ts, updatedAt: ts, deletedAt: null };
        }
        await replaceSnapshot(snapshot);
        toast(`Imported ${report.counts.projects} projects, ${report.counts.tasks} tasks and ${report.counts.clients} clients from v1`);
      } else if ((json as Snapshot).schema === 2) {
        await replaceSnapshot({ ...(json as Snapshot), workspace: { ...(json as Snapshot).workspace, onboarded: true } });
        toast('Backup restored');
      } else toast('That file is not a Chakra backup', { tone: 'danger' });
    } catch {
      toast('Could not read that file', { tone: 'danger' });
    }
    setBusy(false);
  };

  const option = (key: typeof start, icon: React.ReactNode, title: string, text: string) => (
    <button type="button" onClick={() => setStart(key)} className={cx('flex items-start gap-3 rounded-xl border p-4 text-left transition-colors', start === key ? 'border-accent/60 bg-accent-soft' : 'border-line bg-subtle hover:border-line-strong')}>
      <span className={cx('mt-0.5', start === key ? 'text-accent' : 'text-faint')}>{icon}</span>
      <span><span className="block text-sm font-medium">{title}</span><span className="block text-[13px] text-muted">{text}</span></span>
    </button>
  );

  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-4 py-10">
      <div className="anim-pop w-full max-w-lg">
        <div className="mb-6 flex items-center gap-3"><ChakraMark size={40} className="text-ink" /><div><h1 className="text-xl font-semibold">Welcome to Chakra Studio OS</h1><p className="text-[13px] text-muted">Set up your studio in under a minute.</p></div></div>
        <div className="glass grid gap-4 rounded-2xl p-5">
          {start !== 'sample' && start !== 'import' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex items-center gap-3 sm:col-span-2">
                <button type="button" onClick={() => logoRef.current?.click()} className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-dashed border-line-strong text-faint hover:border-muted hover:text-muted" aria-label="Upload logo">
                  {logo ? <img src={logo} alt="" className="h-full w-full object-contain p-1.5" /> : <ImagePlus size={20} />}
                </button>
                <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; try { setLogo(await readImageFile(file)); } catch (err) { toast((err as Error).message, { tone: 'danger' }); } e.target.value = ''; }} />
                <div className="text-[13px]"><div className="font-medium">Studio logo <span className="font-normal text-faint">(optional)</span></div><div className="text-muted">Shown in the app, on invoices, PDFs and the client portal.</div></div>
              </div>
              <Field label="Studio name" className="sm:col-span-2"><Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Chakra Digital" /></Field>
              <Field label="Your name" className="sm:col-span-2"><Input value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} /></Field>
              <Field label="Currency"><Select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })} options={CURRENCIES} /></Field>
              <Field label="Month starts on day" hint="25 = reports run 25th → 24th"><Select value={f.cycle} onChange={(e) => setF({ ...f, cycle: e.target.value })} options={Array.from({ length: 31 }, (_, i) => String(i + 1))} /></Field>
            </div>
          )}
          <div className="grid gap-2">
            {option('empty', <Square size={18} />, 'Start fresh', 'Empty studio with project templates ready.')}
            {option('sample', <Sparkles size={18} />, 'Explore a sample studio', 'Fictional clients, projects and invoices. Erase it any time in Settings.')}
            {option('import', <FileUp size={18} />, 'Import from v1 or a backup', 'Use the JSON file from “Back Up Workspace” in the old app.')}
          </div>
          {start === 'import' ? (
            <>
              <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              <Button variant="primary" disabled={busy} onClick={() => fileRef.current?.click()}><FileUp size={16} />{busy ? 'Importing…' : 'Choose backup file'}</Button>
            </>
          ) : (
            <Button variant="primary" onClick={finish} disabled={start === 'empty' && !f.name.trim()}>{start === 'sample' ? 'Open sample studio' : 'Create my studio'}<ArrowRight size={16} /></Button>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-faint">Works offline and saves in this browser. Connect cloud sync later to work as a team.</p>
      </div>
    </div>
  );
}
