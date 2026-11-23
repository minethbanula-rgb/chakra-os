import * as React from 'react';
import { ChakraMark } from '@/components/Brand';
import type { Session } from '@supabase/supabase-js';
import { Mail, Loader2 } from 'lucide-react';
import { supabase, cloudBackend } from '@/data/cloud';
import { initStore } from '@/data/store';
import { Button, Field, Input } from '@/components/ui';

type Phase = { kind: 'loading' } | { kind: 'signin' } | { kind: 'create' } | { kind: 'ready' } | { kind: 'error'; message: string };

/** Cloud mode: sign in, find (or create) the studio, then load it. */
export function CloudGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = React.useState<Session | null | undefined>(undefined);
  const [phase, setPhase] = React.useState<Phase>({ kind: 'loading' });

  React.useEffect(() => {
    supabase!.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase!.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const open = React.useCallback(async (s: Session) => {
    setPhase({ kind: 'loading' });
    try {
      const { data: wsIds, error } = await supabase!.rpc('claim_memberships');
      if (error) throw error;
      const ids = (wsIds ?? []) as string[];
      if (!ids.length) return setPhase({ kind: 'create' });
      const preferred = localStorage.getItem('chakra-workspace');
      const wsId = ids.includes(preferred ?? '') ? preferred! : ids[0];
      localStorage.setItem('chakra-workspace', wsId);
      const { data: me } = await supabase!.from('members').select('role').eq('workspace_id', wsId).eq('user_id', s.user.id).is('deleted_at', null).single();
      await initStore(cloudBackend(wsId, s.user.id, (me?.role ?? 'member') as 'owner' | 'admin' | 'member'));
      setPhase({ kind: 'ready' });
    } catch (e) {
      setPhase({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }, []);

  React.useEffect(() => {
    if (session === undefined) return;
    if (!session) setPhase({ kind: 'signin' });
    else void open(session);
  }, [session, open]);

  if (phase.kind === 'ready') return <>{children}</>;
  return (
    <div className="grid min-h-dvh place-items-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3"><ChakraMark size={40} className="text-ink" /><div><div className="text-lg font-semibold">Chakra Studio OS</div><div className="text-[13px] text-muted">Projects, clients and money</div></div></div>
        {phase.kind === 'loading' && <div className="flex items-center gap-2 text-muted"><Loader2 className="animate-spin" size={18} />Loading your studio…</div>}
        {phase.kind === 'signin' && <SignIn />}
        {phase.kind === 'create' && <CreateStudio onDone={() => session && open(session)} />}
        {phase.kind === 'error' && (
          <div className="grid gap-3 rounded-xl border border-bad/30 bg-bad-soft p-4 text-sm text-bad">
            <p>{phase.message}</p>
            <div className="flex gap-2"><Button size="sm" onClick={() => session && open(session)}>Try again</Button><Button size="sm" variant="ghost" onClick={() => supabase!.auth.signOut()}>Sign out</Button></div>
          </div>
        )}
      </div>
    </div>
  );
}

function SignIn() {
  const [email, setEmail] = React.useState('');
  const [sent, setSent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');
  const redirect = `${location.origin}${location.pathname}`;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr('');
    const { error } = await supabase!.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { emailRedirectTo: redirect } });
    setBusy(false);
    if (error) setErr(error.message); else setSent(true);
  };
  if (sent) return <div className="glass rounded-2xl p-5 text-sm"><Mail className="mb-2 text-accent" /><p className="font-medium">Check your email</p><p className="mt-1 text-muted">We sent a sign-in link to {email}. Open it on this device.</p><Button size="sm" variant="ghost" className="mt-3" onClick={() => setSent(false)}>Use another email</Button></div>;
  return (
    <div className="grid gap-4 glass rounded-2xl p-5">
      {/* Shown once Google is enabled in Supabase (Authentication → Providers) and VITE_AUTH_GOOGLE=1 is set. */}
      {import.meta.env.VITE_AUTH_GOOGLE === '1' && <>
        <Button onClick={() => supabase!.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirect } })}>Continue with Google</Button>
        <div className="flex items-center gap-3 text-xs text-faint"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
      </>}
      <form onSubmit={submit} className="grid gap-3">
        <Field label="Work email"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@studio.com" /></Field>
        {err && <p className="text-[13px] text-bad">{err}</p>}
        <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Sending…' : 'Email me a sign-in link'}</Button>
      </form>
      <p className="text-xs text-faint">Invited by your studio? Sign in with the email they added. No password needed.</p>
    </div>
  );
}

function CreateStudio({ onDone }: { onDone: () => void }) {
  const [name, setName] = React.useState('');
  const [owner, setOwner] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase!.rpc('create_workspace', { studio_name: name.trim(), owner_name: owner.trim() });
    setBusy(false);
    if (error) return setErr(error.message);
    localStorage.setItem('chakra-workspace', String(data));
    onDone();
  };
  return (
    <form onSubmit={submit} className="grid gap-3 glass rounded-2xl p-5">
      <p className="text-sm text-muted">You're not part of a studio yet. Create one, or ask your studio owner to invite this email.</p>
      <Field label="Studio name"><Input required value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Your name"><Input value={owner} onChange={(e) => setOwner(e.target.value)} /></Field>
      {err && <p className="text-[13px] text-bad">{err}</p>}
      <Button type="submit" variant="primary" disabled={busy || !name.trim()}>Create studio</Button>
      <Button variant="ghost" size="sm" onClick={() => supabase!.auth.signOut()}>Sign out</Button>
    </form>
  );
}
