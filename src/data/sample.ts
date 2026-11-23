/* A fictional studio for exploring the app. Dates are relative to today. */
import type { Collections, CollectionName, ID, Snapshot, Template, TemplateItem } from './types';
import { defaultWorkspace, emptyTables, uid } from './store';
import { addDays, today } from '@/lib/dates';

export const DEFAULT_TEMPLATES: { name: string; milestones: TemplateItem[]; tasks: TemplateItem[] }[] = [
  {
    name: 'Brand identity',
    milestones: [
      { title: 'Discovery & brief signed off', offsetDays: 7 },
      { title: 'Concepts presented', offsetDays: 21 },
      { title: 'Final identity approved', offsetDays: 35 },
      { title: 'Guidelines & asset handover', offsetDays: 45 },
    ],
    tasks: [
      { title: 'Kickoff call and brief', offsetDays: 2, priority: 'High' },
      { title: 'Competitor and mood research', offsetDays: 6 },
      { title: 'Logo concepts (3 routes)', offsetDays: 18, priority: 'High' },
      { title: 'Colour and type system', offsetDays: 28 },
      { title: 'Brand guidelines document', offsetDays: 40 },
      { title: 'Export final asset pack', offsetDays: 44 },
    ],
  },
  {
    name: 'Website',
    milestones: [
      { title: 'Sitemap & wireframes approved', offsetDays: 10 },
      { title: 'Design approved', offsetDays: 24 },
      { title: 'Build on staging', offsetDays: 42 },
      { title: 'Launch', offsetDays: 50 },
    ],
    tasks: [
      { title: 'Content and sitemap workshop', offsetDays: 3, priority: 'High' },
      { title: 'Wireframes', offsetDays: 9 },
      { title: 'Homepage design', offsetDays: 17, priority: 'High' },
      { title: 'Inner page designs', offsetDays: 23 },
      { title: 'Build and CMS setup', offsetDays: 38 },
      { title: 'QA on mobile and desktop', offsetDays: 46 },
      { title: 'Domain, analytics and launch', offsetDays: 50 },
    ],
  },
  {
    name: 'Social campaign',
    milestones: [
      { title: 'Campaign concept approved', offsetDays: 5 },
      { title: 'Assets delivered', offsetDays: 16 },
      { title: 'Campaign live', offsetDays: 20 },
    ],
    tasks: [
      { title: 'Campaign brief and calendar', offsetDays: 2 },
      { title: 'Key visuals', offsetDays: 10, priority: 'High' },
      { title: 'Motion cut-downs', offsetDays: 14 },
      { title: 'Captions and scheduling', offsetDays: 18 },
    ],
  },
];

export function templateDrafts(): Omit<Template, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>[] {
  return DEFAULT_TEMPLATES.map((t) => ({ ...t }));
}

export function sampleSnapshot(): Snapshot {
  const t = emptyTables();
  const ts = new Date().toISOString();
  const d = (n: number) => addDays(today(), n);
  const put = <K extends CollectionName>(col: K, rec: Omit<Collections[K], 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>): Collections[K] => {
    const full = { ...rec, id: uid(), createdAt: ts, updatedAt: ts, deletedAt: null } as unknown as Collections[K];
    (t[col] as Record<ID, Collections[K]>)[full.id] = full;
    return full;
  };

  const me = put('members', { name: 'Mineth Banula', email: 'mineth@example.com', role: 'owner', title: 'Founder', status: 'Active' });
  const kw = put('members', { name: 'Kaweesha Perera', email: 'kaweesha@example.com', role: 'admin', title: 'Studio manager', status: 'Active' });
  const ruv = put('members', { name: 'Ruvini Silva', email: 'ruvini@example.com', role: 'member', title: 'Designer', status: 'Active' });

  const clients = [
    ['Nova Labs', 'Technology', 'Sarah Chen', 'sarah@novalabs.example'],
    ['Lumi Co.', 'Lifestyle', 'Alex Rivera', 'alex@lumi.example'],
    ['Arco Studio', 'Architecture', 'Daniel Kim', 'daniel@arco.example'],
    ['Velora', 'Retail', 'Maya Perera', 'maya@velora.example'],
    ['Terra Inc.', 'Agritech', 'Ishan Fernando', 'ishan@terra.example'],
  ].map(([name, industry, contact, email]) => {
    const c = put('clients', { name, status: 'Active', industry, website: email.split('@')[1], location: 'Colombo, Sri Lanka', notes: '', flagged: false });
    put('contacts', { clientId: c.id, name: contact, email, phone: '', isPrimary: true });
    return c;
  });
  const [nova, lumi, arco, velora, terra] = clients;

  for (const tpl of templateDrafts()) put('templates', tpl);

  const mk = (name: string, clientId: ID, stage: Collections['projects']['stage'], start: number, due: number, budget: number, onHold = false) =>
    put('projects', { clientId, name, stage, onHold, startOn: d(start), dueOn: d(due), budgetMinor: budget * 100, description: '', driveUrl: 'https://drive.google.com/', ownerId: me.id });
  const pNova = mk('Nova brand identity', nova.id, 'In progress', -24, 21, 9000);
  const pLumi = mk('Lumi website', lumi.id, 'Review', -40, 8, 6000);
  const pArco = mk('Arco mobile app', arco.id, 'In progress', -10, 45, 11000);
  const pVelora = mk('Velora festive campaign', velora.id, 'Planning', 2, 24, 4500);
  const pTerra = mk('Terra dashboard', terra.id, 'In progress', -30, 12, 8500, true);
  mk('Sora brand system', nova.id, 'Delivered', -90, -12, 7000);

  const ms = (projectId: ID, items: [string, number, 'Planned' | 'In progress' | 'Complete'][]) =>
    items.forEach(([title, due, status], i) => put('milestones', { projectId, title, dueOn: d(due), status, clientVisible: true, position: i, completedAt: status === 'Complete' ? ts : null }));
  ms(pNova.id, [['Discovery & brief', -17, 'Complete'], ['Concepts presented', -3, 'Complete'], ['Final identity approved', 4, 'In progress'], ['Guidelines & handover', 21, 'Planned']]);
  ms(pLumi.id, [['Design approved', -20, 'Complete'], ['Build on staging', -2, 'Complete'], ['Launch', 8, 'Planned']]);
  ms(pArco.id, [['UX flows approved', 3, 'In progress'], ['UI kit', 20, 'Planned'], ['Clickable prototype', 45, 'Planned']]);

  let pos = 0;
  const task = (title: string, projectId: ID | null, status: Collections['tasks']['status'], priority: Collections['tasks']['priority'], due: number | null, assigneeId: ID, checklist: [string, boolean][] = []) => {
    const x = put('tasks', { projectId, title, notes: '', status, priority, dueOn: due === null ? null : d(due), assigneeId, position: pos++, recurrence: 'none', completedAt: status === 'Done' ? ts : null });
    checklist.forEach(([text, done], i) => put('checklist', { taskId: x.id, text, done, position: i }));
    return x;
  };
  task('Refine logo lockups', pNova.id, 'Doing', 'High', 0, me.id, [['Horizontal lockup', true], ['Stacked lockup', false], ['Favicon', false]]);
  task('Prepare final identity deck', pNova.id, 'To do', 'High', 3, me.id);
  task('Colour accessibility check', pNova.id, 'To do', 'Medium', 5, ruv.id);
  task('Collect brand assets from client', pNova.id, 'Done', 'Medium', -12, kw.id);
  task('Fix mobile nav on staging', pLumi.id, 'Doing', 'High', -1, me.id);
  task('Client review — Lumi homepage', pLumi.id, 'Review', 'Medium', 1, kw.id);
  task('Write launch checklist', pLumi.id, 'To do', 'Low', 6, kw.id);
  task('Onboarding flow wireframes', pArco.id, 'Doing', 'High', 2, ruv.id);
  task('Competitor app teardown', pArco.id, 'Done', 'Low', -6, ruv.id);
  task('Campaign moodboard', pVelora.id, 'To do', 'Medium', 4, me.id);
  task('Chase Terra for data access', pTerra.id, 'To do', 'High', -3, kw.id);
  task('Publish portfolio case study', null, 'To do', 'Low', null, me.id);
  const weekly = put('tasks', { projectId: null, title: 'Post weekly studio update', notes: '', status: 'To do', priority: 'Medium', dueOn: d(0), assigneeId: me.id, position: pos++, recurrence: 'weekly', completedAt: null });
  void weekly;

  // Invoices + payments + matching income
  const inv = (number: string, clientId: ID, projectId: ID, issued: number, due: number, status: Collections['invoices']['status'], lines: [string, number][], paid: [number, number][] = []) => {
    const i = put('invoices', { clientId, projectId, number, issuedOn: d(issued), dueOn: d(due), status, currency: 'USD', taxRate: 0, advancePct: 0, notes: 'Thank you for your business.', sentAt: status === 'Draft' ? null : ts });
    lines.forEach(([desc, amt], k) => put('invoiceItems', { invoiceId: i.id, description: desc, qty: 1, rateMinor: amt * 100, position: k }));
    for (const [amt, when] of paid) {
      const p = put('payments', { invoiceId: i.id, amountMinor: amt * 100, paidOn: d(when), method: 'Bank transfer' });
      put('transactions', { type: 'Income', title: `${number} · ${t.clients[clientId].name}`, amountMinor: amt * 100, currency: 'USD', occurredOn: d(when), category: 'Client payments', invoiceId: i.id, paymentId: p.id, subscriptionId: null });
    }
  };
  const y = today().slice(0, 4);
  inv(`INV-${y}-001`, nova.id, pNova.id, -24, -10, 'Partially paid', [['Brand strategy', 2500], ['Visual identity design', 4000], ['Brand guidelines', 2500]], [[4500, -20]]);
  inv(`INV-${y}-002`, lumi.id, pLumi.id, -18, -4, 'Sent', [['Website design', 3500], ['Website build', 2500]]);
  inv(`INV-${y}-003`, terra.id, pTerra.id, -40, -26, 'Paid', [['Dashboard UX', 4000]], [[4000, -27]]);
  inv(`INV-${y}-004`, arco.id, pArco.id, -1, 13, 'Sent', [['App design — phase 1 advance', 5500]]);
  inv(`INV-${y}-005`, velora.id, pVelora.id, 0, 14, 'Draft', [['Campaign concept', 1500], ['Key visuals', 3000]]);

  const exp = (title: string, amt: number, when: number, category: string) =>
    put('transactions', { type: 'Expense', title, amountMinor: amt * 100, currency: 'USD', occurredOn: d(when), category, invoiceId: null, paymentId: null, subscriptionId: null });
  exp('Freelance illustrator', 900, -8, 'Freelancers');
  exp('Studio rent', 650, -15, 'Operations');
  exp('Fonts licence', 120, -33, 'Software');
  exp('Studio rent', 650, -45, 'Operations');
  exp('Meta ads test', 300, -52, 'Marketing');

  const sub = (name: string, amt: number, renew: number, website: string) =>
    put('subscriptions', { name, amountMinor: Math.round(amt * 100), currency: 'USD', cycle: 'monthly', renewsOn: d(renew), autoRenew: true, remindDays: 3, website, logo: null, status: 'Active' });
  sub('Figma', 15, 2, 'figma.com');
  sub('Adobe Creative Cloud', 52.5, 9, 'adobe.com');
  sub('Framer', 20, 16, 'framer.com');
  sub('Notion', 10, 24, 'notion.so');

  return {
    schema: 2,
    workspace: {
      ...defaultWorkspace(), name: 'Chakra Sample Studio', ownerName: me.name, email: 'hello@example.com', address: 'Colombo, Sri Lanka',
      website: 'example.com', currency: 'USD', monthlyTargetMinor: 1200000, onboarded: true,
    },
    tables: t,
    meId: me.id,
  };
}
