import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SCRAPING_QUEUE, ALERTS_QUEUE, EXPORT_QUEUE } from './queues.config';

export interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

@Injectable()
export class QueueMonitorService {
  constructor(
    @InjectQueue(SCRAPING_QUEUE) private readonly scrapingQueue: Queue,
    @InjectQueue(ALERTS_QUEUE) private readonly alertsQueue: Queue,
    @InjectQueue(EXPORT_QUEUE) private readonly exportQueue: Queue,
  ) {}

  async getQueueStats(): Promise<QueueStats[]> {
    return Promise.all(
      [
        { name: SCRAPING_QUEUE, queue: this.scrapingQueue },
        { name: ALERTS_QUEUE, queue: this.alertsQueue },
        { name: EXPORT_QUEUE, queue: this.exportQueue },
      ].map(async ({ name, queue }) => {
        const counts = await queue.getJobCounts(
          'waiting',
          'active',
          'completed',
          'failed',
          'delayed',
        );
        return {
          name,
          waiting: counts.waiting ?? 0,
          active: counts.active ?? 0,
          completed: counts.completed ?? 0,
          failed: counts.failed ?? 0,
          delayed: counts.delayed ?? 0,
        };
      }),
    );
  }
}
