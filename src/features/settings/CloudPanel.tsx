import * as React from 'react';
import { Cloud, LogOut, Upload } from 'lucide-react';
import { cloudConfigured, supabase } from '@/data/cloud';
import { LOCAL_KEY } from '@/data/backend';
import { replaceSnapshot, useStore } from '@/data/store';
import type { Snapshot } from '@/data/types';
import { importV1, isV1 } from '@/data/importV1';
import { Badge, Button, Panel, toast, useConfirm } from '@/components/ui';

export function CloudPanel() {
  const kind = useStore((s) => s.backend?.kind);
  const [email, setEmail] = React.useState<string | null>(null);
  const confirm = useConfirm();
  React.useEffect(() => { supabase?.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null)); }, []);
  const localRaw = typeof localStorage !== 'undefined' ? localStorage.getItem(LOCAL_KEY) : null;
  const v1Raw = typeof localStorage !== 'undefined' ? localStorage.getItem('chakra-studio-os-v1') : null;
  const v1 = React.useMemo(() => { try { const j = v1Raw ? JSON.parse(v1Raw) : null; return isV1(j) ? j : null; } catch { return null; } }, [v1Raw]);

  return (
    <Panel title={<span className="flex items-center gap-2"><Cloud size={15} className="text-accent" />Cloud sync</span>}>
      <div className="grid gap-3 p-4 text-[13px]">
        {kind === 'cloud' ? (
          <>
            <div className="flex flex-wrap items-center gap-2"><Badge tone="good">Connected</Badge><span className="text-muted">Signed in as {email}. Changes save to the cloud and appear live for your team.</span></div>
            {localRaw && (
              <div className="rounded-lg bg-subtle p-3">
                <p className="mb-2 text-muted">This browser also has data from local mode. Upload it to replace what's in the cloud studio (people are kept and matched by email).</p>
                <Button size="sm" onClick={() => confirm.ask('Upload browser data?', 'Projects, clients, tasks, invoices and money entries in the cloud studio will be replaced by this browser\'s data. Download a backup first if unsure.', 'Upload and replace', async () => {
                  try { await replaceSnapshot(JSON.parse(localRaw) as Snapshot); localStorage.removeItem(LOCAL_KEY); toast('Uploaded. Your studio is now in the cloud.'); } catch (e) { toast(`Upload failed: ${(e as Error).message}`, { tone: 'danger' }); }
                })}><Upload size={14} />Upload this browser's data</Button>
              </div>
            )}
            {v1 && (
              <div className="rounded-lg bg-subtle p-3">
                <p className="mb-2 text-muted">This browser also has your v1 studio ({(v1.projects as unknown[]).length} projects). Import it into the cloud studio — people are matched by email and become invites.</p>
                <Button size="sm" onClick={() => confirm.ask('Import v1 data?', 'Projects, clients, tasks, invoices and money entries in the cloud studio will be replaced by your v1 data. Your team and sign-ins are kept.', 'Import v1 data', async () => {
                  try { await replaceSnapshot(importV1(v1).snapshot); toast('v1 data imported to the cloud'); } catch (e) { toast(`Import failed: ${(e as Error).message}`, { tone: 'danger' }); }
                })}><Upload size={14} />Import v1 data</Button>
              </div>
            )}
            <Button size="sm" className="justify-self-start" onClick={async () => { await supabase!.auth.signOut(); location.reload(); }}><LogOut size={14} />Sign out</Button>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2"><Badge>Local mode</Badge><span className="text-muted">Everything is saved in this browser only.</span></div>
            <p className="text-muted">
              {cloudConfigured
                ? 'Cloud is configured for this build. Reload to sign in.'
                : 'To share with your team, get live updates, client portal links and email reminders, deploy with a Supabase project (see README → Cloud setup). Your local data can be uploaded after you sign in.'}
            </p>
          </>
        )}
      </div>
      {confirm.node}
    </Panel>
  );
}
