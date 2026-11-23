import * as React from 'react';
import { cx } from './ui';

export function domainOf(website: string | null | undefined): string {
  if (!website) return '';
  return website.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
}

/** Favicon sources, best first. Google's service returns a 16px globe for unknown sites, which we skip. */
export function faviconSources(domain: string): string[] {
  if (!domain) return [];
  return [
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`,
    `https://icons.duckduckgo.com/ip3/${encodeURIComponent(domain)}.ico`,
    `https://${domain}/apple-touch-icon.png`,
    `https://${domain}/favicon.ico`,
  ];
}

/**
 * Logo for a website: an uploaded logo if there is one, otherwise the site's favicon,
 * otherwise the first letter of the name.
 */
export function SiteIcon({ name, website, logo, size = 32, className }: { name: string; website?: string | null; logo?: string | null; size?: number; className?: string }) {
  const domain = domainOf(website);
  const sources = React.useMemo(() => (logo ? [logo] : faviconSources(domain)), [logo, domain]);
  const [i, setI] = React.useState(0);
  const [loaded, setLoaded] = React.useState(false);
  React.useEffect(() => { setI(0); setLoaded(false); }, [sources]);
  const src = sources[i];
  // The letter shows until an icon actually loads, so slow or blocked sites never leave an empty box.
  return (
    <span className={cx('relative inline-grid shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-elevated', className)} style={{ width: size, height: size }}>
      {!loaded && <span className="font-medium text-muted" style={{ fontSize: size * 0.42 }}>{(name.trim()[0] ?? '?').toUpperCase()}</span>}
      {src && (
        <img key={src} src={src} alt="" referrerPolicy="no-referrer"
          style={{ width: logo ? size : size * 0.62, height: logo ? size : size * 0.62 }}
          className={cx('absolute object-contain transition-opacity', loaded ? 'opacity-100' : 'opacity-0')}
          onLoad={(e) => {
            // Google's fallback globe is 16×16 even when 128 is asked for: try the next source.
            if (!logo && i === 0 && e.currentTarget.naturalWidth <= 16) { setI(1); return; }
            setLoaded(true);
          }}
          onError={() => setI((n) => n + 1)} />
      )}
    </span>
  );
}

/** Reads an image file into a data URL, refusing large files. */
export function readImageFile(file: File, maxBytes = 400_000): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|svg\+xml|webp|gif|x-icon|vnd\.microsoft\.icon)$/.test(file.type)) return reject(new Error('Use a PNG, JPG, SVG or WebP image'));
    if (file.size > maxBytes) return reject(new Error(`Use an image under ${Math.round(maxBytes / 1000)} KB`));
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Could not read that image'));
    r.readAsDataURL(file);
  });
}
