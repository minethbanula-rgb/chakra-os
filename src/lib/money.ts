import type { Minor } from '@/data/types';

/** Convert a typed amount (e.g. "1,250.50") to integer minor units. */
export function toMinor(v: number | string): Minor {
  const n = typeof v === 'string' ? Number(v.replace(/[^0-9.-]/g, '')) : v;
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export const fromMinor = (m: Minor) => m / 100;

const formatters = new Map<string, Intl.NumberFormat>();
export function formatMoney(m: Minor, currency = 'USD', opts: { compact?: boolean } = {}): string {
  const key = `${currency}|${opts.compact ? 'c' : ''}|${m % 100 === 0 ? 0 : 2}`;
  let f = formatters.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        notation: opts.compact ? 'compact' : 'standard',
        maximumFractionDigits: opts.compact ? 1 : m % 100 === 0 ? 0 : 2,
        minimumFractionDigits: opts.compact || m % 100 === 0 ? 0 : 2,
      });
    } catch {
      f = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
    }
    formatters.set(key, f);
  }
  return f.format(m / 100);
}

/** Percentage of a minor amount, rounded to the nearest minor unit. */
export const pctOf = (m: Minor, pct: number) => Math.round((m * pct) / 100);

export const CURRENCIES = ['USD', 'LKR', 'EUR', 'GBP', 'AUD', 'INR', 'SGD', 'AED', 'CAD'];
