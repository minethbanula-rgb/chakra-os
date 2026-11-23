// Hourly: daily digests for team members and polite invoice reminders to clients.
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (provided), RESEND_API_KEY, CRON_SECRET, MAIL_FROM, APP_URL.
import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (k: string) => Deno.env.get(k) ?? '';
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

type Row = Record<string, any>;
const money = (minor: number, currency: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function localParts(tz: string) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(new Date()).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}
const addDays = (d: string, n: number) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

async function once(workspaceId: string, kind: string, ref: string, day: string) {
  const { error } = await db.from('email_log').insert({ workspace_id: workspaceId, kind, ref, sent_on: day });
  return !error; // unique (kind, ref, sent_on) → false if already sent
}

async function send(to: string, subject: string, html: string, replyTo?: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env('MAIL_FROM'), to, subject, html, reply_to: replyTo || undefined }),
  });
  if (!res.ok) console.error('send failed', to, res.status, await res.text());
}

const list = (title: string, items: string[]) => (items.length ? `<h3 style="font:600 14px sans-serif;margin:20px 0 6px">${title}</h3><ul style="font:14px/1.6 sans-serif;padding-left:18px;margin:0">${items.map((i) => `<li>${i}</li>`).join('')}</ul>` : '');

Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== `Bearer ${env('CRON_SECRET')}`) return new Response('Forbidden', { status: 403 });
  const { data: workspaces } = await db.from('workspaces').select('*');
  let sent = 0;
  for (const ws of (workspaces ?? []) as Row[]) {
    const { date: today, hour } = localParts(ws.timezone || 'UTC');
    if (hour !== Number(String(ws.digest_time).slice(0, 2))) continue;
    const q = (t: string) => db.from(t).select('*').eq('workspace_id', ws.id).is('deleted_at', null);
    const [members, tasks, milestones, projects, invoices, items, payments, clients, contacts, subs] = await Promise.all(
      ['members', 'tasks', 'milestones', 'projects', 'invoices', 'invoice_items', 'payments', 'clients', 'contacts', 'subscriptions'].map(async (t) => ((await q(t)).data ?? []) as Row[]),
    );
    const projectName = (id: string | null) => projects.find((p) => p.id === id)?.name ?? '';
    const totals = (inv: Row) => {
      const sub = items.filter((i) => i.invoice_id === inv.id).reduce((s, i) => s + Math.round(Number(i.qty) * Number(i.rate_minor)), 0);
      const total = sub + Math.round((sub * Number(inv.tax_rate)) / 100);
      const paid = payments.filter((p) => p.invoice_id === inv.id).reduce((s, p) => s + Number(p.amount_minor), 0);
      return { total, balance: Math.max(0, total - paid) };
    };
    const open = invoices.filter((i) => i.status === 'Sent' || i.status === 'Partially paid');

    // 1) Digests
    for (const m of members.filter((m) => m.status === 'Active' && m.digest && m.email)) {
      const mine = tasks.filter((t) => t.status !== 'Done' && t.assignee_id === m.id && t.due_on);
      const overdue = mine.filter((t) => t.due_on < today);
      const dueToday = mine.filter((t) => t.due_on === today);
      const ms = milestones.filter((x) => x.status !== 'Complete' && x.due_on && x.due_on <= addDays(today, 7));
      const manager = m.role === 'owner' || m.role === 'admin';
      const late = manager ? open.filter((i) => i.due_on < today) : [];
      const renewals = manager ? subs.filter((s) => s.status === 'Active' && s.renews_on >= today && s.renews_on <= addDays(today, Math.max(3, s.remind_days))) : [];
      if (!overdue.length && !dueToday.length && !ms.length && !late.length && !renewals.length) continue;
      if (!(await once(ws.id, 'digest', m.id, today))) continue;
      const html = `<div style="max-width:560px">
        <p style="font:14px sans-serif">Good morning ${esc(m.name.split(' ')[0] || '')} — here is your day at ${esc(ws.name)}.</p>
        ${list('Overdue', overdue.map((t) => `${esc(t.title)} <span style="color:#888">${esc(projectName(t.project_id))}</span>`))}
        ${list('Due today', dueToday.map((t) => `${esc(t.title)} <span style="color:#888">${esc(projectName(t.project_id))}</span>`))}
        ${list('Milestones this week', ms.map((x) => `${esc(x.title)} — ${esc(projectName(x.project_id))} (${x.due_on})`))}
        ${list('Invoices overdue', late.map((i) => `${esc(i.number)} — ${money(totals(i).balance, i.currency)}`))}
        ${list('Renewing soon', renewals.map((s) => `${esc(s.name)} on ${s.renews_on}`))}
        <p style="margin-top:24px"><a href="${env('APP_URL')}" style="background:#7362d8;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font:600 14px sans-serif">Open Today</a></p>
      </div>`;
      await send(m.email, `${overdue.length + dueToday.length} thing${overdue.length + dueToday.length === 1 ? '' : 's'} today · ${ws.name}`, html);
      sent++;
    }

    // 2) Invoice reminders to clients: 3 days before due, 1 and 7 days after.
    for (const inv of ws.auto_reminders ? open : []) {
      const offset = [-3, 1, 7].find((d) => addDays(inv.due_on, d) === today);
      if (offset === undefined) continue;
      const contact = contacts.find((c) => c.client_id === inv.client_id && c.is_primary && c.email) ?? contacts.find((c) => c.client_id === inv.client_id && c.email);
      if (!contact) continue;
      if (!(await once(ws.id, `reminder${offset}`, inv.id, today))) continue;
      const { balance } = totals(inv);
      const client = clients.find((c) => c.id === inv.client_id);
      const when = offset < 0 ? `is due on ${inv.due_on}` : `was due on ${inv.due_on}`;
      await send(contact.email, `Invoice ${inv.number} ${offset < 0 ? 'due soon' : 'reminder'} — ${ws.name}`,
        `<p style="font:14px/1.6 sans-serif">Hi ${esc(contact.name.split(' ')[0] || client?.name || '')},<br><br>A friendly note that invoice ${esc(inv.number)} for ${money(balance, inv.currency)} ${when}. If it is already on its way, thank you and please ignore this.<br><br>${esc(ws.owner_name || ws.name)}</p>`,
        ws.email);
      await db.from('invoices').update({ last_reminder_at: new Date().toISOString() }).eq('id', inv.id);
      sent++;
    }
  }
  return Response.json({ sent });
});
