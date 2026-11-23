// Every record type maps 1:1 to a Postgres table (see supabase/migrations).
export type ID = string;
/** Calendar date in the studio's time zone, `YYYY-MM-DD`. */
export type ISODate = string;
/** Money is always an integer in minor units (cents). */
export type Minor = number;

export interface Base {
  id: ID;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export type Role = 'owner' | 'admin' | 'member';
export const ROLES: Role[] = ['owner', 'admin', 'member'];

export interface Workspace {
  id: ID;
  name: string;
  ownerName: string;
  email: string;
  address: string;
  website: string;
  currency: string;
  /** Day of month the reporting cycle starts (1–31, clamped in short months). */
  cycleStartDay: number;
  taxDefault: number;
  invoicePrefix: string;
  monthlyTargetMinor: Minor;
  logo: string | null;
  digestTime: string;
  /** Email clients automatically 3 days before and 1 / 7 days after an invoice is due (cloud only). */
  autoReminders: boolean;
  weekStartsOn: 0 | 1;
  /** LKR per 1 USD, used for USD subscriptions when the studio currency is LKR. */
  fxUsd: number;
  fxUpdatedAt: string | null;
  theme: 'system' | 'light' | 'dark';
  onboarded: boolean;
}

export interface Member extends Base {
  name: string;
  email: string;
  role: Role;
  title: string;
  status: 'Active' | 'Invited';
}

export const CLIENT_STATUSES = ['Active', 'Paused', 'Former'] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];
export interface Client extends Base {
  name: string;
  status: ClientStatus;
  industry: string;
  website: string;
  location: string;
  notes: string;
  /** Private "do not work with" flag (v1's Blacklisted). Never shown on the portal. */
  flagged: boolean;
}

export interface Contact extends Base {
  clientId: ID;
  name: string;
  email: string;
  phone: string;
  isPrimary: boolean;
}

export const STAGES = ['Lead', 'Planning', 'In progress', 'Review', 'Delivered', 'Archived'] as const;
export type Stage = (typeof STAGES)[number];
export const OPEN_STAGES: Stage[] = ['Lead', 'Planning', 'In progress', 'Review'];
export interface Project extends Base {
  clientId: ID | null;
  name: string;
  stage: Stage;
  onHold: boolean;
  startOn: ISODate | null;
  dueOn: ISODate | null;
  budgetMinor: Minor;
  description: string;
  driveUrl: string;
  ownerId: ID | null;
}

export const MILESTONE_STATUSES = ['Planned', 'In progress', 'Complete'] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];
export interface Milestone extends Base {
  projectId: ID;
  title: string;
  dueOn: ISODate | null;
  status: MilestoneStatus;
  clientVisible: boolean;
  position: number;
  completedAt: string | null;
}

export const TASK_STATUSES = ['To do', 'Doing', 'Review', 'Done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const PRIORITIES = ['Low', 'Medium', 'High'] as const;
export type Priority = (typeof PRIORITIES)[number];
export const RECURRENCES = ['none', 'daily', 'weekly', 'monthly'] as const;
export type Recurrence = (typeof RECURRENCES)[number];
export interface Task extends Base {
  projectId: ID | null;
  title: string;
  notes: string;
  status: TaskStatus;
  priority: Priority;
  dueOn: ISODate | null;
  assigneeId: ID | null;
  position: number;
  recurrence: Recurrence;
  completedAt: string | null;
}

export interface ChecklistItem extends Base {
  taskId: ID;
  text: string;
  done: boolean;
  position: number;
}

export const INVOICE_STATUSES = ['Draft', 'Sent', 'Partially paid', 'Paid', 'Void'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
/** Overdue is computed from due date and balance, never stored. */
export type InvoiceDisplayStatus = InvoiceStatus | 'Overdue';
export interface Invoice extends Base {
  clientId: ID | null;
  projectId: ID | null;
  number: string;
  issuedOn: ISODate;
  dueOn: ISODate;
  status: InvoiceStatus;
  currency: string;
  taxRate: number;
  advancePct: number;
  notes: string;
  sentAt: string | null;
}

export interface InvoiceItem extends Base {
  invoiceId: ID;
  description: string;
  qty: number;
  rateMinor: Minor;
  position: number;
}

export interface Payment extends Base {
  invoiceId: ID;
  amountMinor: Minor;
  paidOn: ISODate;
  method: string;
}

export type TxType = 'Income' | 'Expense';
export interface Transaction extends Base {
  type: TxType;
  title: string;
  amountMinor: Minor;
  currency: string;
  occurredOn: ISODate;
  category: string;
  invoiceId: ID | null;
  paymentId: ID | null;
  subscriptionId: ID | null;
}

export interface Subscription extends Base {
  name: string;
  amountMinor: Minor;
  currency: string;
  cycle: 'monthly' | 'yearly';
  renewsOn: ISODate;
  autoRenew: boolean;
  remindDays: number;
  website: string;
  /** Uploaded logo (data URL). When empty, the website's favicon is shown. */
  logo: string | null;
  status: 'Active' | 'Paused';
}

export interface PortalLink extends Base {
  clientId: ID;
  /** Local mode keeps the token; cloud mode stores only its SHA-256 hash server-side. */
  token: string;
  enabled: boolean;
}

export interface TemplateItem {
  title: string;
  offsetDays: number;
  priority?: Priority;
}
export interface Template extends Base {
  name: string;
  milestones: TemplateItem[];
  tasks: TemplateItem[];
}

export interface Activity extends Base {
  entity: CollectionName;
  entityId: ID;
  text: string;
  actorId: ID | null;
}

export interface Collections {
  members: Member;
  clients: Client;
  contacts: Contact;
  projects: Project;
  milestones: Milestone;
  tasks: Task;
  checklist: ChecklistItem;
  invoices: Invoice;
  invoiceItems: InvoiceItem;
  payments: Payment;
  transactions: Transaction;
  subscriptions: Subscription;
  portalLinks: PortalLink;
  templates: Template;
  activity: Activity;
}
export type CollectionName = keyof Collections;
export const COLLECTIONS: CollectionName[] = [
  'members', 'clients', 'contacts', 'projects', 'milestones', 'tasks', 'checklist', 'invoices',
  'invoiceItems', 'payments', 'transactions', 'subscriptions', 'portalLinks', 'templates', 'activity',
];

export type Tables = { [K in CollectionName]: Record<ID, Collections[K]> };

export interface Snapshot {
  schema: 2;
  workspace: Workspace;
  tables: Tables;
  meId: ID | null;
}

/** Fields callers provide when creating; ids and timestamps are filled in. */
export type Draft<K extends CollectionName> = Omit<Collections[K], keyof Base> & Partial<Pick<Base, 'id'>>;
