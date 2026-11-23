import * as React from 'react';
import { useStore } from '@/data/store';
import { live } from '@/lib/domain';
import { today } from '@/lib/dates';

/** Once a day, if notifications are allowed and work is overdue, show a gentle system notification. */
export function useOverdueNudge() {
  React.useEffect(() => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const key = 'chakra-nudged';
    if (localStorage.getItem(key) === today()) return;
    const s = useStore.getState();
    const overdue = live(s.tables.tasks).filter((t) => t.status !== 'Done' && t.dueOn && t.dueOn < today() && (!s.meId || t.assigneeId === s.meId)).length;
    if (!overdue) return;
    localStorage.setItem(key, today());
    try { new Notification('Chakra Studio OS', { body: `${overdue} overdue task${overdue === 1 ? '' : 's'} waiting on Today.`, icon: './icon.svg' }); } catch { /* some browsers need a service worker */ }
  }, []);
}
