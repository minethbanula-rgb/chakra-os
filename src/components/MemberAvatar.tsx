import { useRecord } from '@/data/hooks';
import { Avatar } from './ui';

/** A team member's photo, or their initials. */
export function MemberAvatar({ id, size = 28, fallbackName, className }: { id: string | null | undefined; size?: number; fallbackName?: string; className?: string }) {
  const m = useRecord('members', id);
  return <Avatar name={m?.name || fallbackName || '?'} src={m?.avatar} size={size} className={className} />;
}
