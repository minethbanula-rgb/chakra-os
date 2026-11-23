import * as React from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Home, FolderKanban, Users, Wallet, Settings, Search, Plus, Cloud, CloudOff, Loader2, Moon, Sun, CheckSquare,
  FileText, ArrowLeftRight, RefreshCw, BarChart3, UsersRound, CircleUser, type LucideIcon,
} from 'lucide-react';
import { useStore, updateWorkspace } from '@/data/store';
import { useWorkspace, useUI, openQuickAdd, useRecord, useMeId, useCanSeeMoney } from '@/data/hooks';
import { Avatar, Button, cx } from '@/components/ui';
import { BrandMark } from '@/components/Brand';
import { TaskPanel } from '@/features/tasks';
import { QuickAdd, CommandPalette, NewProjectDialog, NewClientDialog } from '@/features/global';

const TABS = [
  { to: '/', label: 'Today', icon: Home, end: true, key: 't' },
  { to: '/work', label: 'Work', icon: FolderKanban, key: 'w' },
  { to: '/clients', label: 'Clients', icon: Users, key: 'c' },
  { to: '/money', label: 'Money', icon: Wallet, key: 'm' },
];

interface Item { to: string; label: string; icon: LucideIcon; match: (p: string) => boolean }
const SECTIONS: { title: string; money?: boolean; items: Item[] }[] = [
  {
    title: 'Main menu',
    items: [
      { to: '/', label: 'Today', icon: Home, match: (p) => p === '/' },
      { to: '/work', label: 'Projects', icon: FolderKanban, match: (p) => p === '/work' || p.startsWith('/work/p/') },
      { to: '/work/tasks', label: 'Tasks', icon: CheckSquare, match: (p) => p.startsWith('/work/tasks') },
      { to: '/clients', label: 'Clients', icon: Users, match: (p) => p.startsWith('/clients') },
    ],
  },
  {
    title: 'Money',
    money: true,
    items: [
      { to: '/money', label: 'Overview', icon: Wallet, match: (p) => p === '/money' },
      { to: '/money/invoices', label: 'Invoices', icon: FileText, match: (p) => p.startsWith('/money/invoices') },
      { to: '/money/expenses', label: 'Income & expenses', icon: ArrowLeftRight, match: (p) => p.startsWith('/money/expenses') },
      { to: '/money/subscriptions', label: 'Subscriptions', icon: RefreshCw, match: (p) => p.startsWith('/money/subscriptions') },
      { to: '/money/reports', label: 'Reports', icon: BarChart3, match: (p) => p.startsWith('/money/reports') },
    ],
  },
  {
    title: 'Account',
    items: [
      { to: '/settings/profile', label: 'Profile', icon: CircleUser, match: (p) => p === '/settings/profile' },
      { to: '/settings/team', label: 'Team', icon: UsersRound, match: (p) => p === '/settings/team' },
      { to: '/settings', label: 'Settings', icon: Settings, match: (p) => p.startsWith('/settings') && p !== '/settings/team' && p !== '/settings/profile' },
    ],
  },
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
        const item = TABS.find((n) => n.key === k) ?? (k === 's' ? { to: '/settings' } : null);
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

function SyncBadge({ compact }: { compact?: boolean }) {
  const sync = useStore((s) => s.sync);
  const kind = useStore((s) => s.backend?.kind);
  const label = (t: string) => (compact ? null : t);
  if (sync.status === 'saving') return <span className="inline-flex items-center gap-1.5 text-xs text-faint"><Loader2 size={14} className="animate-spin" />{label('Saving')}</span>;
  if (sync.status === 'error' || sync.status === 'offline')
    return <span title={sync.message} className="inline-flex items-center gap-1.5 text-xs font-medium text-bad"><CloudOff size={14} />{label(sync.status === 'offline' ? 'Offline' : 'Not saved')}</span>;
  return <span className="inline-flex items-center gap-1.5 text-xs text-faint" title={kind === 'cloud' ? 'Saved to the cloud' : 'Saved in this browser'}><Cloud size={14} />{label(kind === 'cloud' ? 'Synced' : 'Saved locally')}</span>;
}

function ThemeToggle() {
  const theme = useWorkspace().theme;
  const dark = theme === 'dark' || (theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  return (
    <button aria-label="Toggle dark mode" title="Toggle dark mode" onClick={() => updateWorkspace({ theme: dark ? 'light' : 'dark' })}
      className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">{dark ? <Sun size={17} /> : <Moon size={17} />}</button>
  );
}

function Sidebar() {
  const { pathname } = useLocation();
  const money = useCanSeeMoney();
  return (
    <aside className="no-print sticky top-16 hidden h-[calc(100dvh-80px)] flex-col overflow-y-auto rounded-2xl border border-line bg-panel p-2.5 md:flex">
      {SECTIONS.filter((s) => !s.money || money).map((section) => (
        <div key={section.title} className="mb-3">
          <div className="px-3 pb-1.5 pt-2 text-[13px] text-faint">{section.title}</div>
          <nav className="grid gap-0.5" aria-label={section.title}>
            {section.items.map(({ to, label, icon: Icon, match }) => {
              const active = match(pathname);
              return (
                <Link key={to} to={to} aria-current={active ? 'page' : undefined}
                  className={cx('flex h-10 items-center gap-3 rounded-xl border px-3 text-[14px] transition-colors',
                    active ? 'border-line bg-elevated font-medium text-ink' : 'border-transparent text-muted hover:bg-hover hover:text-ink')}>
                  <Icon size={18} strokeWidth={1.8} className={active ? 'text-ink' : 'text-faint'} />{label}
                </Link>
              );
            })}
          </nav>
        </div>
      ))}
      <div className="mt-auto flex items-center justify-between px-3 pb-1 pt-3"><SyncBadge /><ThemeToggle /></div>
    </aside>
  );
}

export function Shell() {
  useShortcuts();
  const ws = useWorkspace();
  const me = useRecord('members', useMeId());
  const loc = useLocation();
  const mainRef = React.useRef<HTMLElement>(null);
  const money = useCanSeeMoney();
  React.useEffect(() => { mainRef.current?.focus({ preventScroll: true }); window.scrollTo(0, 0); }, [loc.pathname]);
  const name = me?.name || ws.ownerName || ws.name;

  return (
    <div className="min-h-dvh">
      {/* Desktop top bar */}
      <header className="no-print sticky top-0 z-30 hidden h-16 items-center gap-6 bg-bg/90 px-6 backdrop-blur md:flex">
        <Link to="/" className="flex min-w-[228px] items-center gap-2.5">
          <BrandMark size={30} />
          <span className="truncate text-[19px] font-semibold tracking-[-0.02em]">{ws.name}</span>
        </Link>
        <button onClick={() => useUI.setState({ palette: true })} className="flex h-10 w-full max-w-md items-center gap-2.5 rounded-xl border border-line bg-panel px-3.5 text-[14px] text-faint transition-colors hover:border-line-strong">
          <Search size={16} />Search here…<kbd className="ml-auto rounded-md border border-line px-1.5 font-sans text-[11px]">⌘K</kbd>
        </button>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => openQuickAdd()}><Plus size={15} />New task</Button>
          <Link to="/settings/profile" aria-label="Your profile" className="ml-1"><Avatar name={name} src={me?.avatar} size={32} /></Link>
        </div>
      </header>

      {/* Phone top bar */}
      <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-line bg-bg/90 px-3 backdrop-blur md:hidden">
        <BrandMark size={26} />
        <span className="min-w-0 flex-1 truncate text-[16px] font-semibold">{ws.name}</span>
        <SyncBadge compact />
        <button aria-label="Search" onClick={() => useUI.setState({ palette: true })} className="grid h-10 w-10 place-items-center rounded-lg text-muted hover:bg-hover"><Search size={19} /></button>
        <NavLink to="/settings/profile" aria-label="Your profile"><Avatar name={name} src={me?.avatar} size={30} /></NavLink>
      </header>

      <div className="md:grid md:grid-cols-[252px_minmax(0,1fr)] md:gap-4 md:px-4 md:pb-4">
        <Sidebar />
        <main ref={mainRef} tabIndex={-1} className="w-full min-w-0 px-4 pb-28 pt-5 outline-none md:min-h-[calc(100dvh-80px)] md:rounded-2xl md:border md:border-line md:bg-panel md:px-8 md:pb-12 md:pt-7">
          <div className="mx-auto max-w-[1100px]"><Outlet /></div>
        </main>
      </div>

      {/* Phone tab bar */}
      <nav aria-label="Main" className="no-print pb-safe fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-panel/90 backdrop-blur-xl md:hidden">
        {TABS.slice(0, 2).map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => cx('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium', isActive ? 'text-ink' : 'text-faint')}><Icon size={21} strokeWidth={1.8} />{label}</NavLink>
        ))}
        <div className="grid place-items-center">
          <button aria-label="New task" onClick={() => openQuickAdd()} className="btn-glow grid h-12 w-12 place-items-center rounded-full active:scale-95"><Plus size={24} /></button>
        </div>
        {TABS.slice(2).filter((t) => t.to !== '/money' || money).map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={({ isActive }) => cx('flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium', isActive ? 'text-ink' : 'text-faint')}><Icon size={21} strokeWidth={1.8} />{label}</NavLink>
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
