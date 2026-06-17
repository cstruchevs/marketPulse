import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Subject } from 'rxjs';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../config/redis.provider';

export interface SseEvent {
  type: SseEventType;
  data: Record<string, unknown>;
  id: string;
}

export type SseEventType =
  | 'price-update'
  | 'price-alert'
  | 'scrape-started'
  | 'scrape-completed'
  | 'scrape-error'
  | 'export-ready'
  | 'queue-stats'
  | 'ping';

const MISSED_EVENTS_TTL_SECONDS = 300; // 5 minutes
const MISSED_EVENTS_KEY = (userId: string) => `sse:missed:${userId}`;

interface ClientEntry {
  subject: Subject<SseEvent>;
  count: number; // number of open tabs/connections
}

@Injectable()
export class SseService {
  private readonly logger = new Logger(SseService.name);
  private readonly clients = new Map<string, ClientEntry>();

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  addClient(userId: string): Subject<SseEvent> {
    let entry = this.clients.get(userId);
    if (!entry) {
      entry = { subject: new Subject<SseEvent>(), count: 0 };
      this.clients.set(userId, entry);
    }
    entry.count++;
    this.logger.log(`SSE client connected: userId=${userId} (total tabs: ${entry.count})`);
    return entry.subject;
  }

  removeClient(userId: string): void {
    const entry = this.clients.get(userId);
    if (!entry) return;

    entry.count--;
    this.logger.log(`SSE client disconnected: userId=${userId} (remaining tabs: ${entry.count})`);

    if (entry.count <= 0) {
      entry.subject.complete();
      this.clients.delete(userId);
    }
  }

  sendToUser(userId: string, event: SseEvent): void {
    const entry = this.clients.get(userId);
    if (entry) {
      entry.subject.next(event);
    } else {
      // No active connections — buffer in Redis for 5 min
      this.bufferMissedEvent(userId, event).catch((err) =>
        this.logger.error(`Failed to buffer SSE event: ${(err as Error).message}`),
      );
    }
  }

  sendToAll(event: SseEvent): void {
    for (const [, entry] of this.clients) {
      entry.subject.next(event);
    }
  }

  // Called when a new connection opens — flush buffered events
  async flushMissedEvents(userId: string, subject: Subject<SseEvent>): Promise<void> {
    const key = MISSED_EVENTS_KEY(userId);
    const raw = await this.redis.lrange(key, 0, -1);
    if (!raw.length) return;

    await this.redis.del(key);
    for (const item of raw.reverse()) {
      try {
        subject.next(JSON.parse(item) as SseEvent);
      } catch {
        // ignore malformed entries
      }
    }
    this.logger.log(`Flushed ${raw.length} missed event(s) to userId=${userId}`);
  }

  private async bufferMissedEvent(userId: string, event: SseEvent): Promise<void> {
    const key = MISSED_EVENTS_KEY(userId);
    await this.redis.lpush(key, JSON.stringify(event));
    await this.redis.expire(key, MISSED_EVENTS_TTL_SECONDS);
  }
}
