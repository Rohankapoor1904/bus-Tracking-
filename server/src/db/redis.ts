import { Redis } from 'ioredis';
import { config } from '../config/index.js';

/**
 * Redis layer: latest-position geospatial cache + cross-instance pub/sub for
 * WebSocket fan-out. Fully optional — if `REDIS_URL` is not configured or the
 * server is unreachable, every method degrades to a no-op and the application
 * keeps working on PostgreSQL alone.
 */
class RedisService {
  private client: Redis | null = null;
  private subscriber: Redis | null = null;
  private publisher: Redis | null = null;
  private available = false;
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    if (!config.redisUrl) {
      console.log('[Redis] REDIS_URL not set — using PostgreSQL-only mode.');
      return;
    }

    try {
      this.client = new Redis(config.redisUrl, {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        retryStrategy: (times: number) => (times > 3 ? null : Math.min(times * 500, 2000)),
      });
      this.publisher = this.client.duplicate({ lazyConnect: true });
      this.subscriber = this.client.duplicate({ lazyConnect: true });

      await this.client.connect();
      await this.publisher.connect();
      await this.subscriber.connect();

      this.available = true;
      console.log('[Redis] Connected — geospatial cache & pub/sub enabled.');
    } catch (err: any) {
      console.warn(`[Redis] Unavailable (${err.message}) — continuing without cache.`);
      this.available = false;
      this.client?.disconnect();
      this.publisher?.disconnect();
      this.subscriber?.disconnect();
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  private key(busId: string): string {
    return `mmu:telemetry:latest:${busId}`;
  }

  async setLatestPosition(busId: string, payload: unknown): Promise<void> {
    if (!this.available || !this.client) return;
    try {
      await this.client.set(this.key(busId), JSON.stringify(payload), 'EX', 120);
    } catch {
      /* cache is best-effort */
    }
  }

  async getLatestPosition<T>(busId: string): Promise<T | null> {
    if (!this.available || !this.client) return null;
    try {
      const raw = await this.client.get(this.key(busId));
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  async publish(channel: string, message: string): Promise<void> {
    if (!this.available || !this.publisher) return;
    try {
      await this.publisher.publish(`mmu:ws:${channel}`, message);
    } catch {
      /* best-effort */
    }
  }

  async subscribe(channels: string[], handler: (channel: string, message: string) => void): Promise<void> {
    if (!this.available || !this.subscriber) return;
    try {
      await this.subscriber.subscribe(...channels.map((c) => `mmu:ws:${c}`));
      this.subscriber.on('message', (fullChannel: string, message: string) => {
        handler(fullChannel.replace(/^mmu:ws:/, ''), message);
      });
    } catch {
      /* best-effort */
    }
  }

  async close(): Promise<void> {
    await Promise.allSettled([
      this.client?.quit(),
      this.publisher?.quit(),
      this.subscriber?.quit(),
    ]);
    this.available = false;
  }
}

export const redis = new RedisService();
