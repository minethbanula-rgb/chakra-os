import { useWorkspace } from '@/data/hooks';
import { cx } from './ui';

/** Default Chakra mark: a solid disc with a wheel of seven openings. Uses currentColor. */
export function ChakraMark({ size = 28, className }: { size?: number; className?: string }) {
  const dots = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return { x: 12 + Math.cos(a) * 5.6, y: 12 + Math.sin(a) * 5.6 };
  });
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true">
      <defs>
        <mask id="chakra-mark-holes">
          <rect width="24" height="24" fill="#fff" />
          <circle cx="12" cy="12" r="2.3" fill="#000" />
          {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r="1.85" fill="#000" />)}
        </mask>
      </defs>
      <circle cx="12" cy="12" r="11.5" fill="currentColor" mask="url(#chakra-mark-holes)" />
    </svg>
  );
}

/** The studio's uploaded logo, or the Chakra mark when none is set. */
export function BrandMark({ size = 28, className }: { size?: number; className?: string }) {
  const logo = useWorkspace().logo;
  if (logo) return <img src={logo} alt="" style={{ width: size, height: size }} className={cx('rounded-md object-contain', className)} />;
  return <ChakraMark size={size} className={cx('text-ink', className)} />;
}
