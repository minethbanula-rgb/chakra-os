import type { ID, ISODate, Member, Priority, Project } from '@/data/types';
import { addDays, parseISODate, today, toISODate } from './dates';

export interface ParsedTask {
  title: string;
  dueOn: ISODate | null;
  priority: Priority;
  assigneeId: ID | null;
  projectId: ID | null;
  /** Which words produced each chip, for display. */
  matched: { due?: string; priority?: string; assignee?: string; project?: string };
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const SHORT = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function parseDateWord(words: string[], i: number, on: ISODate): { date: ISODate; used: number } | null {
  const w = words[i].toLowerCase().replace(/[.,]$/, '');
  if (w === 'today' || w === 'tod') return { date: on, used: 1 };
  if (w === 'tomorrow' || w === 'tmr' || w === 'tom') return { date: addDays(on, 1), used: 1 };
  if (w === 'next' && words[i + 1]?.toLowerCase() === 'week') {
    const d = parseISODate(on);
    return { date: addDays(on, ((8 - d.getDay()) % 7) || 7), used: 2 };
  }
  if (w === 'in' && /^\d+$/.test(words[i + 1] ?? '') && /^days?$/i.test(words[i + 2] ?? '')) {
    return { date: addDays(on, Number(words[i + 1])), used: 3 };
  }
  const wd = WEEKDAYS.indexOf(w) >= 0 ? WEEKDAYS.indexOf(w) : SHORT.indexOf(w);
  if (wd >= 0) {
    const cur = parseISODate(on).getDay();
    return { date: addDays(on, ((wd - cur + 7) % 7) || 7), used: 1 };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(w)) return { date: w, used: 1 };
  // "dec 5" or "5 dec"
  const mi = MONTHS.indexOf(w.slice(0, 3));
  if (mi >= 0 && /^\d{1,2}$/.test(words[i + 1] ?? '')) return { date: monthDay(mi, Number(words[i + 1]), on), used: 2 };
  if (/^\d{1,2}$/.test(w) && MONTHS.indexOf((words[i + 1] ?? '').toLowerCase().slice(0, 3)) >= 0) {
    return { date: monthDay(MONTHS.indexOf(words[i + 1].toLowerCase().slice(0, 3)), Number(w), on), used: 2 };
  }
  return null;
}

function monthDay(m: number, d: number, on: ISODate): ISODate {
  const ref = parseISODate(on);
  let date = new Date(ref.getFullYear(), m, d, 12);
  if (toISODate(date) < on) date = new Date(ref.getFullYear() + 1, m, d, 12);
  return toISODate(date);
}

/**
 * "Logo revisions for Nova fri high @Kaweesha" →
 * title "Logo revisions", project Nova…, due Friday, High, assignee Kaweesha.
 */
export function parseQuickAdd(input: string, ctx: { projects: Project[]; members: Member[]; on?: ISODate }): ParsedTask {
  const on = ctx.on ?? today();
  const out: ParsedTask = { title: '', dueOn: null, priority: 'Medium', assigneeId: null, projectId: null, matched: {} };
  let words = input.trim().split(/\s+/).filter(Boolean);

  // @assignee
  words = words.filter((w) => {
    if (!w.startsWith('@') || w.length < 2) return true;
    const q = w.slice(1).toLowerCase();
    const m = ctx.members.find((x) => x.name.toLowerCase().startsWith(q) || x.name.toLowerCase().split(' ').some((p) => p.startsWith(q)));
    if (m && !out.assigneeId) { out.assigneeId = m.id; out.matched.assignee = m.name; return false; }
    return true;
  });

  // priority words: high/urgent/!, low
  words = words.filter((w) => {
    const l = w.toLowerCase();
    if (['high', 'urgent', '!', '!!', 'p1'].includes(l)) { out.priority = 'High'; out.matched.priority = 'High'; return false; }
    if (['low', 'p3'].includes(l)) { out.priority = 'Low'; out.matched.priority = 'Low'; return false; }
    return true;
  });

  // dates (scan from the end so titles like "Monday standup notes" keep leading words when a later date exists)
  for (let i = words.length - 1; i >= 0; i--) {
    const hit = parseDateWord(words, i, on);
    if (hit) {
      out.dueOn = hit.date;
      out.matched.due = words.slice(i, i + hit.used).join(' ');
      words.splice(i, hit.used);
      if (words[i - 1] && /^(by|on|due)$/i.test(words[i - 1])) words.splice(i - 1, 1);
      break;
    }
  }

  // "for <project>" / "#project"
  const text = words.join(' ');
  const projects = ctx.projects.filter((p) => !p.deletedAt);
  const tryMatch = (q: string) => {
    const l = q.toLowerCase().trim();
    if (l.length < 2) return null;
    return projects.find((p) => p.name.toLowerCase() === l) ?? projects.find((p) => p.name.toLowerCase().startsWith(l)) ?? projects.find((p) => p.name.toLowerCase().split(/\s+/).some((w) => w === l));
  };
  const hash = words.findIndex((w) => w.startsWith('#'));
  if (hash >= 0) {
    const p = tryMatch(words[hash].slice(1).replace(/-/g, ' '));
    if (p) { out.projectId = p.id; out.matched.project = p.name; words.splice(hash, 1); }
  }
  if (!out.projectId) {
    const m = text.match(/\s(?:for|on|re)\s+(.+)$/i);
    if (m) {
      const tail = m[1].split(' ');
      for (let n = tail.length; n > 0; n--) {
        const p = tryMatch(tail.slice(0, n).join(' '));
        if (p) {
          out.projectId = p.id;
          out.matched.project = p.name;
          const cut = text.length - m[0].length;
          words = (text.slice(0, cut) + ' ' + tail.slice(n).join(' ')).trim().split(/\s+/);
          break;
        }
      }
    }
  }

  out.title = words.join(' ').trim();
  out.title = out.title.charAt(0).toUpperCase() + out.title.slice(1);
  return out;
}
