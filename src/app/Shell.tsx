import * as React from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Home, FolderKanban, Users, Wallet, Settings, Search, Plus, Cloud, CloudOff, Loader2, Moon, Sun } from 'lucide-react';
import { useStore, updateWorkspace } from '@/data/store';
import { useWorkspace, useUI, openQuickAdd, useRecord, useMeId } from '@/data/hooks';
import { Avatar, Button, cx } from '@/components/ui';
import { TaskPanel } from '@/features/tasks';
import { QuickAdd, CommandPalette, NewProjectDialog, NewClientDialog } from '@/features/global';

const NAV = [
  { to: '/', label: 'Today', icon: Home, end: true, key: 't' },
  { to: '/work', label: 'Work', icon: FolderKanban, key: 'w' },
  { to: '/clients', label: 'Clients', icon: Users, key: 'c' },
  { to: '/money', label: 'Money', icon: Wallet, key: 'm' },
];

function useShortcuts() {
  const nav = useNavigate();
  React.useEffect(() => {
    let g = false;
    let timer: ReturnType<typeof setTimeout>;
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      const k = e.key.toLowerCase();
      if (g) {
        g = false;
        const item = NAV.find((n) => n.key === k) ?? (k === 's' ? { to: '/settings' } : null);
        if (item) { e.preventDefault(); nav(item.to); }
        return;
      }
      if (k === 'g') { g = true; clearTimeout(timer); timer = setTimeout(() => (g = false), 1200); }
      else if (k === 'n') { e.preventDefault(); openQuickAdd(); }
      else if (k === '/') { e.preventDefault(); useUI.setState({ palette: true }); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [nav]);
}

export function useApplyTheme() {
  const theme = useWorkspace().theme;
  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'system' && mq.matches));
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

function SyncBadge() {
  const sync = useStore((s) => s.sync);
  const kind = useStore((s) => s.backend?.kind);
  if (sync.status === 'saving') return <span className="inline-flex items-center gap-1.5 text-xs text-faint"><Loader2 size={13} className="animate-spin" />Saving</span>;
  if (sync.status === 'error' || sync.status === 'offline')
    return <span title={sync.message} className="inline-flex items-center gap-1.5 text-xs font-medium text-bad"><CloudOff size={13} />{sync.status === 'offline' ? 'Offline' : 'Not saved'}</span>;
  return <span className="inline-flex items-center gap-1.5 text-xs text-faint" title={kind === 'cloud' ? 'Saved to the cloud' : 'Saved in this browser'}><Cloud size={13} />{kind === 'cloud' ? 'Synced' : 'Saved locally'}</span>;
}

function ThemeToggle() {
  const theme = useWorkspace().theme;
  const dark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  return (
    <button aria-label="Toggle dark mode" title="Toggle dark mode" onClick={() => updateWorkspace({ theme: dark ? 'light' : 'dark' })}
      className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">{dark ? <Sun size={17} /> : <Moon size={17} />}</button>
  );
}

export function Shell() {
  useShortcuts();
  const ws = useWorkspace();
  const me = useRecord('members', useMeId());
  const loc = useLocation();
  const mainRef = React.useRef<HTMLElement>(null);
  React.useEffect(() => { mainRef.current?.focus({ preventScroll: true }); window.scrollTo(0, 0); }, [loc.pathname]);

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[232px_minmax(0,1fr)]">
      {/* Desktop sidebar */}
      <aside className="no-print sticky top-0 hidden h-dvh flex-col border-r border-line bg-panel/60 px-3 py-4 backdrop-blur-xl md:flex">
        <div className="mb-6 flex items-center gap-2.5 px-2">
          {ws.logo ? <img src={ws.logo} alt="" className="h-9 w-9 rounded-xl object-contain" /> : <img src="./icon.svg" alt="" className="h-9 w-9 rounded-xl shadow-[0_0_24px_-4px_var(--c-accent)]" />}
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold leading-tight">{ws.name}</div>
            <div className="text-xs text-faint">Studio OS</div>
          </div>
        </div>
        <button onClick={() => useUI.setState({ palette: true })} className="mb-3 flex h-9 items-center gap-2 rounded-xl border border-line bg-subtle px-3 text-[13px] text-faint transition-colors hover:border-line-strong hover:text-muted">
          <Search size={15} />Search<kbd className="ml-auto rounded-md border border-line-strong bg-elevated px-1.5 font-sans text-[11px]">⌘K</kbd>
        </button>
        <Button variant="primary" className="mb-4 w-full" onClick={() => openQuickAdd()}><Plus size={16} />New task</Button>
        <nav className="grid gap-0.5" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => cx('group flex h-10 items-center gap-3 rounded-xl border px-3 text-sm font-medium transition-colors [&_svg]:transition-colors', isActive ? 'border-line-strong bg-elevated text-ink shadow-[inset_0_1px_0_var(--glass-edge)] [&_svg]:text-accent [&_svg]:drop-shadow-[0_0_6px_var(--c-accent)]' : 'border-transparent text-muted hover:bg-hover hover:text-ink')}>
              <Icon size={17} />{label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto grid gap-2">
          <div className="flex items-center justify-between px-2"><SyncBadge /><ThemeToggle /></div>
          <NavLink to="/settings" className={({ isActive }) => cx('flex items-center gap-2.5 rounded-xl border px-2 py-2 hover:bg-hover', isActive ? 'border-line-strong bg-elevated' : 'border-transparent')}>
            <Avatar name={me?.name || ws.ownerName || ws.name} size={28} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium">{me?.name || ws.ownerName || 'You'}</div>
              <div className="truncate text-xs text-faint">Settings</div>
            </div>
            <Settings size={15} className="text-faint" />
          </NavLink>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-bg/90 px-3 backdrop-blur md:hidden">
        <img src={ws.logo || './icon.svg'} alt="" className="h-7 w-7 rounded-md object-contain" />
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{ws.name}</span>
        <span className="[&_span]:text-[0px] [&_svg]:h-4 [&_svg]:w-4"><SyncBadge /></span>
        <button aria-label="Search" onClick={() => useUI.setState({ palette: true })} className="grid h-10 w-10 place-items-center rounded-lg text-muted hover:bg-hover"><Search size={19} /></button>
        <NavLink to="/settings" aria-label="Settings"><Avatar name={me?.name || ws.ownerName || ws.name} size={30} /></NavLink>
      </header>

      <main ref={mainRef} tabIndex={-1} className="mx-auto w-full max-w-[1180px] px-4 pb-28 pt-5 outline-none md:px-8 md:pb-12 md:pt-8">
        <Outlet />
      </main>

      {/* Mobile tab bar */}
      <nav aria-label="Main" className="no-print pb-safe fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-panel/80 backdrop-blur-xl md:hidden">
        {NAV.slice(0, 2).map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => cx('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium', isActive ? 'text-accent [&_svg]:drop-shadow-[0_0_6px_var(--c-accent)]' : 'text-muted')}><Icon size={21} />{label}</NavLink>
        ))}
        <div className="grid place-items-center">
          <button aria-label="New task" onClick={() => openQuickAdd()} className="btn-glow grid h-12 w-12 place-items-center rounded-full active:scale-95"><Plus size={24} /></button>
        </div>
        {NAV.slice(2).map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => cx('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium', isActive ? 'text-accent [&_svg]:drop-shadow-[0_0_6px_var(--c-accent)]' : 'text-muted')}><Icon size={21} />{label}</NavLink>
        ))}
      </nav>

      <TaskPanel />
      <QuickAdd />
      <CommandPalette />
      <NewProjectDialog />
      <NewClientDialog />
    </div>
  );
}
