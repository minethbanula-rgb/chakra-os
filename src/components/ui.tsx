import * as React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { create } from 'zustand';
import { undo } from '@/data/store';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

/* ---------- Buttons ---------- */

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
const btnBase = 'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none select-none whitespace-nowrap';
const btnVariants: Record<BtnVariant, string> = {
  primary: 'btn-glow active:scale-[0.98]',
  secondary: 'bg-elevated text-ink border border-line-strong shadow-[inset_0_1px_0_var(--glass-edge)] hover:bg-hover hover:border-line-strong',
  ghost: 'text-ink hover:bg-hover',
  danger: 'text-bad border border-line-strong bg-elevated hover:bg-bad-soft',
};
const btnSizes = { sm: 'h-8 px-3 text-[13px]', md: 'h-10 px-4 text-sm', icon: 'h-9 w-9' };

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: keyof typeof btnSizes;
}
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'secondary', size = 'md', className, type = 'button', ...p }, ref) {
  return <button ref={ref} type={type} className={cx(btnBase, btnVariants[variant], btnSizes[size], className)} {...p} />;
});

export function IconButton({ label, className, ...p }: ButtonProps & { label: string }) {
  return <Button variant="ghost" size="icon" aria-label={label} title={label} className={cx('text-muted hover:text-ink', className)} {...p} />;
}

/* ---------- Form controls ---------- */

const control = 'w-full min-w-0 rounded-xl border border-line-strong bg-subtle px-3 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/15 disabled:opacity-60';
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={cx(control, 'h-10', className)} {...p} />;
});
export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={cx(control, 'min-h-24 py-2 resize-y', className)} {...p} />;
});
export function Select({ className, options, ...p }: React.SelectHTMLAttributes<HTMLSelectElement> & { options: (string | { value: string; label: string })[] }) {
  return (
    <select className={cx(control, 'h-10 pr-8 appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat', className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238d9296' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...p}>
      {options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  const id = React.useId();
  const child = React.isValidElement(children) ? React.cloneElement(children as React.ReactElement<{ id?: string }>, { id }) : children;
  return (
    <div className={cx('grid gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-muted">{label}</label>
      {child}
      {hint && <p className="text-xs text-faint">{hint}</p>}
    </div>
  );
}

export function Checkbox({ checked, onChange, label, className }: { checked: boolean; onChange: (v: boolean) => void; label: string; className?: string }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={label} onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      className={cx('grid h-5 w-5 shrink-0 place-items-center rounded-full border-[1.5px] transition-all', checked ? 'border-accent bg-accent text-[#04121c] shadow-[0_0_10px_var(--c-accent)]' : 'border-line-strong hover:border-accent hover:shadow-[0_0_8px_var(--glow)]', className)}>
      {checked && <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3.5"><path d="m5 12 4 4 10-10" /></svg>}
    </button>
  );
}

/** Text input that commits on blur / Enter, so typing doesn't create a save per keystroke. */
export function InlineInput({ value, onCommit, className, ...p }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => setV(value), [value]);
  return <Input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onCommit(v)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className={className} {...p} />;
}
export function InlineTextarea({ value, onCommit, ...p }: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & { value: string; onCommit: (v: string) => void }) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => setV(value), [value]);
  return <Textarea value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onCommit(v)} {...p} />;
}

/* ---------- Display ---------- */

export type Tone = 'neutral' | 'accent' | 'good' | 'warn' | 'bad' | 'info';
const tones: Record<Tone, string> = {
  neutral: 'bg-subtle text-muted', accent: 'bg-accent-soft text-accent', good: 'bg-good-soft text-good',
  warn: 'bg-warn-soft text-warn', bad: 'bg-bad-soft text-bad', info: 'bg-info-soft text-info',
};
export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cx('inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[11.5px] font-medium whitespace-nowrap ring-1 ring-inset ring-current/15', tones[tone], className)}>{children}</span>;
}

const STATUS_TONE: Record<string, Tone> = {
  Lead: 'neutral', Planning: 'info', 'In progress': 'accent', Review: 'warn', Delivered: 'good', Archived: 'neutral',
  'To do': 'neutral', Doing: 'accent', Done: 'good',
  Draft: 'neutral', Sent: 'info', 'Partially paid': 'warn', Paid: 'good', Overdue: 'bad', Void: 'neutral',
  Planned: 'neutral', Complete: 'good', Active: 'good', Paused: 'neutral', Former: 'neutral', Invited: 'info',
  High: 'bad', Medium: 'neutral', Low: 'info', 'On hold': 'warn',
};
export const StatusBadge = ({ status }: { status: string }) => <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{status}</Badge>;

const AVATAR_COLORS = ['#0e7490', '#4f46e5', '#0f766e', '#7c3aed', '#b45309', '#be185d'];
export function Avatar({ name, size = 28, className }: { name: string; size?: number; className?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';
  const color = AVATAR_COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return (
    <span title={name} className={cx('inline-grid shrink-0 place-items-center rounded-full font-semibold text-white', className)}
      style={{ width: size, height: size, fontSize: size * 0.38, background: color }}>{initials}</span>
  );
}

export function Progress({ value, className }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className={cx('h-1.5 overflow-hidden rounded-full bg-subtle', className)} role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress-glow h-full rounded-full transition-[width]" style={{ width: `${v}%` }} />
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className, size = 'md' }: { value: T; onChange: (v: T) => void; options: (T | { value: T; label: React.ReactNode })[]; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div role="tablist" className={cx('inline-flex rounded-xl border border-line bg-subtle p-0.5', className)}>
      {options.map((o) => {
        const val = typeof o === 'string' ? o : o.value;
        const label = typeof o === 'string' ? o : o.label;
        const on = val === value;
        return (
          <button key={val} role="tab" aria-selected={on} type="button" onClick={() => onChange(val)}
            className={cx('rounded-[10px] border px-3 font-medium transition-colors', size === 'sm' ? 'h-7 text-xs' : 'h-8 text-[13px]', on ? 'border-line-strong bg-elevated text-ink shadow-[inset_0_1px_0_var(--glass-edge)]' : 'border-transparent text-muted hover:text-ink')}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

export function Panel({ title, sub, icon, action, children, className, bodyClass }: { title?: React.ReactNode; sub?: React.ReactNode; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={cx('glass overflow-hidden rounded-2xl', className)}>
      {(title || action) && (
        <header className="flex min-h-14 items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {icon && <span className="icon-tile h-7 w-7 [&_svg]:h-[15px] [&_svg]:w-[15px]">{icon}</span>}
            <div className="min-w-0"><h2 className="truncate text-[14px] font-semibold">{title}</h2>{sub && <p className="truncate text-xs text-muted">{sub}</p>}</div>
          </div>
          {action}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function EmptyState({ icon, title, text, action, className }: { icon?: React.ReactNode; title: string; text?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col items-center justify-center gap-2 px-6 py-10 text-center', className)}>
      {icon && <div className="mb-1 text-faint">{icon}</div>}
      <p className="font-medium">{title}</p>
      {text && <p className="max-w-sm text-[13px] text-muted">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, sub, action }: { title: React.ReactNode; sub?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.03em]">{title}</h1>
        {sub && <div className="mt-1 text-[13px] text-muted">{sub}</div>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, note, tone }: { label: string; value: React.ReactNode; note?: React.ReactNode; tone?: 'good' | 'bad' }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className={cx('tabular mt-0.5 truncate text-xl font-semibold tracking-tight', tone === 'good' && 'text-good', tone === 'bad' && 'text-bad')}>{value}</div>
      {note && <div className="mt-0.5 truncate text-xs text-faint">{note}</div>}
    </div>
  );
}

/* ---------- Overlays ---------- */

export function useIsMobile() {
  const q = '(max-width: 767px)';
  const [m, setM] = React.useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  React.useEffect(() => {
    const mq = window.matchMedia(q);
    const h = () => setM(mq.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  return m;
}

/** Record detail: a right-hand panel on desktop, a bottom sheet on phones. */
export function Sheet({ open, onOpenChange, title, children, footer, wide }: { open: boolean; onOpenChange: (o: boolean) => void; title: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="anim-fade fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]" />
        <Dialog.Content aria-describedby={undefined}
          className={cx('fixed z-50 flex flex-col bg-elevated shadow-pop focus:outline-none',
            'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl anim-up',
            'md:inset-y-0 md:right-0 md:left-auto md:bottom-auto md:max-h-none md:rounded-none md:border-l md:border-line md:anim-slide',
            wide ? 'md:w-[640px]' : 'md:w-[480px]')}>
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong md:hidden" />
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
            <Dialog.Title className="min-w-0 truncate text-[15px] font-semibold">{title}</Dialog.Title>
            <Dialog.Close asChild><IconButton label="Close"><X size={18} /></IconButton></Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex items-center justify-between gap-2 border-t border-line px-5 py-3 pb-safe">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Modal({ open, onOpenChange, title, children, footer, className }: { open: boolean; onOpenChange: (o: boolean) => void; title: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; className?: string }) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="anim-fade fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]" />
        <Dialog.Content aria-describedby={undefined}
          className={cx('anim-pop fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-24px)] max-w-lg -translate-x-1/2 rounded-2xl border border-line-strong bg-elevated shadow-pop focus:outline-none', className)}>
          <div className="flex items-center justify-between px-5 pt-4">
            <Dialog.Title className="text-[15px] font-semibold">{title}</Dialog.Title>
            <Dialog.Close asChild><IconButton label="Close"><X size={18} /></IconButton></Dialog.Close>
          </div>
          <div className="px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ---------- Toasts ---------- */

interface ToastItem { id: number; text: string; tone?: 'danger'; undo?: boolean; action?: { label: string; run: () => void } }
const useToasts = create<{ items: ToastItem[] }>(() => ({ items: [] }));
let seq = 0;
export function toast(text: string, opts: Omit<ToastItem, 'id' | 'text'> = {}) {
  const id = ++seq;
  useToasts.setState((s) => ({ items: [...s.items.slice(-2), { id, text, ...opts }] }));
  setTimeout(() => useToasts.setState((s) => ({ items: s.items.filter((t) => t.id !== id) })), opts.undo ? 8000 : 4000);
}
if (typeof window !== 'undefined') {
  window.addEventListener('chakra:toast', (e) => {
    const d = (e as CustomEvent<{ text: string; tone?: 'danger' }>).detail;
    toast(d.text, { tone: d.tone });
  });
}
export function Toaster() {
  const items = useToasts((s) => s.items);
  const dismiss = (id: number) => useToasts.setState((s) => ({ items: s.items.filter((t) => t.id !== id) }));
  return (
    <div className="no-print pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-3 md:bottom-6" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={cx('anim-up pointer-events-auto flex max-w-md items-center gap-3 rounded-xl border px-4 py-2.5 text-sm shadow-pop backdrop-blur', t.tone === 'danger' ? 'border-bad/40 bg-bad text-white' : 'border-line-strong bg-elevated/95 text-ink')}>
          <span className="min-w-0">{t.text}</span>
          {t.undo && <button className="shrink-0 font-semibold text-accent underline-offset-2 hover:underline" onClick={() => { const l = undo(); dismiss(t.id); if (l) toast(`Undone: ${l}`); }}>Undo</button>}
          {t.action && <button className="shrink-0 font-semibold text-accent underline-offset-2 hover:underline" onClick={() => { t.action!.run(); dismiss(t.id); }}>{t.action.label}</button>}
        </div>
      ))}
    </div>
  );
}

/** Confirm before destructive actions that can't easily be undone. */
export function useConfirm() {
  const [state, setState] = React.useState<{ title: string; text: string; confirm: string; run: () => void } | null>(null);
  const ask = (title: string, text: string, confirm: string, run: () => void) => setState({ title, text, confirm, run });
  const node = (
    <Modal open={!!state} onOpenChange={(o) => !o && setState(null)} title={state?.title}
      footer={<><Button onClick={() => setState(null)}>Cancel</Button><Button variant="primary" className="!bg-bad !text-white" onClick={() => { state?.run(); setState(null); }}>{state?.confirm}</Button></>}>
      <p className="text-sm text-muted">{state?.text}</p>
    </Modal>
  );
  return { ask, node };
}
