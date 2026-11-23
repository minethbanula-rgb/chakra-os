import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cloudBackend } from '@/data/cloud';

/** Minimal stand-in that behaves like supabase-js channels: same topic → same channel, no .on() after subscribe(). */
function fakeClient() {
  const channels = new Map<string, { topic: string; subscribed: boolean; on: () => unknown; subscribe: () => unknown }>();
  const client = {
    channel(name: string) {
      const topic = `realtime:${name}`;
      let ch = channels.get(topic);
      if (!ch) {
        const c = {
          topic, subscribed: false,
          on() { if (c.subscribed) throw new Error(`cannot add \`postgres_changes\` callbacks for ${topic} after \`subscribe()\`.`); return c; },
          subscribe() { c.subscribed = true; return c; },
        };
        ch = c;
        channels.set(topic, ch);
      }
      return ch;
    },
    getChannels: () => [...channels.values()],
    removeChannel: async (ch: { topic: string }) => { channels.delete(ch.topic); return 'ok'; },
  };
  return { client: client as unknown as SupabaseClient, channels };
}

describe('cloud realtime', () => {
  it('subscribing twice for the same studio does not throw and leaves one channel', () => {
    const { client, channels } = fakeClient();
    const a = cloudBackend('ws-1', 'u-1', 'owner', client);
    const b = cloudBackend('ws-1', 'u-1', 'owner', client);
    expect(() => a.subscribe!(() => {}, () => {})).not.toThrow();
    expect(() => b.subscribe!(() => {}, () => {})).not.toThrow();
    expect(() => a.subscribe!(() => {}, () => {})).not.toThrow();
    expect(channels.size).toBe(1);
  });
});
