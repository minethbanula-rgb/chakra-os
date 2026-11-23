import { useMemo } from 'react';
import { create } from 'zustand';
import { useStore } from './store';
import { live } from '@/lib/domain';
import type { CollectionName, Collections, ID } from './types';

export const useTables = () => useStore((s) => s.tables);
export const useWorkspace = () => useStore((s) => s.workspace);
export const useMeId = () => useStore((s) => s.meId);

/** Non-deleted records of a collection. */
export function useLive<K extends CollectionName>(col: K): Collections[K][] {
  const rec = useStore((s) => s.tables[col]);
  return useMemo(() => live(rec as Record<ID, Collections[K]>), [rec]);
}

export function useRecord<K extends CollectionName>(col: K, id: ID | null | undefined): Collections[K] | undefined {
  return useStore((s) => (id ? (s.tables[col][id] as Collections[K] | undefined) : undefined));
}

export const useMembers = () => useLive('members');
export function useMemberName() {
  const members = useStore((s) => s.tables.members);
  return (id: ID | null | undefined) => (id ? members[id]?.name ?? 'Unknown' : 'Unassigned');
}

/** Cross-screen UI state: open panels and dialogs. */
interface UI {
  taskId: ID | null;
  quickAdd: { open: boolean; projectId?: ID | null; status?: Collections['tasks']['status'] };
  palette: boolean;
  newProject: { open: boolean; clientId?: ID | null };
  newClient: boolean;
}
export const useUI = create<UI>(() => ({ taskId: null, quickAdd: { open: false }, palette: false, newProject: { open: false }, newClient: false }));
export const openTask = (id: ID | null) => useUI.setState({ taskId: id });
export const openQuickAdd = (o: Omit<UI['quickAdd'], 'open'> = {}) => useUI.setState({ quickAdd: { open: true, ...o } });
export const openNewProject = (clientId?: ID | null) => useUI.setState({ newProject: { open: true, clientId } });
export const openNewClient = () => useUI.setState({ newClient: true });

/** In cloud mode members don't see money; locally everyone is the owner. */
export function useCanSeeMoney() {
  const cloud = useStore((s) => s.backend?.kind === 'cloud');
  const role = useStore((s) => (s.meId ? s.tables.members[s.meId]?.role : undefined));
  return !cloud || role === 'owner' || role === 'admin';
}
