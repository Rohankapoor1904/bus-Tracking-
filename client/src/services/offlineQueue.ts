/**
 * MMU Driver Offline Telemetry Spooler
 * Stores GPS points locally when network is interrupted and auto-flushes on reconnect.
 */

interface QueuedTelemetry {
  id: string;
  payload: any;
  timestamp: number;
}

const STORAGE_KEY = 'mmu_driver_offline_telemetry_queue';

class OfflineQueueService {
  public enqueue(payload: any) {
    try {
      const queue = this.getQueue();
      queue.push({
        id: Math.random().toString(36).substring(2, 9),
        payload,
        timestamp: Date.now(),
      });
      // Cap at 1000 items to avoid storage overflow
      if (queue.length > 1000) queue.shift();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    } catch (e) {
      console.error('Failed to spool telemetry point:', e);
    }
  }

  public getQueue(): QueuedTelemetry[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  public clear() {
    localStorage.removeItem(STORAGE_KEY);
  }

  public async flush(sendFn: (payload: any) => void): Promise<number> {
    const queue = this.getQueue();
    if (queue.length === 0) return 0;

    let count = 0;
    for (const item of queue) {
      sendFn(item.payload);
      count++;
    }

    this.clear();
    return count;
  }

  public getPendingCount(): number {
    return this.getQueue().length;
  }
}

export const offlineQueue = new OfflineQueueService();
