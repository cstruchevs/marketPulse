import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SCRAPING_QUEUE, SCRAPE_PRODUCT_JOB } from '../workers/queues.config';

@Injectable()
export class ScraperQueueService {
  private readonly logger = new Logger(ScraperQueueService.name);

  constructor(@InjectQueue(SCRAPING_QUEUE) private readonly queue: Queue) {}

  async enqueue(productId: string): Promise<void> {
    await this.queue.add(
      SCRAPE_PRODUCT_JOB,
      { productId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 30_000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
        // Deduplicate: one job per product at a time (jobId acts as dedup key in BullMQ)
        jobId: `scrape:${productId}:${Date.now()}`,
      },
    );
    this.logger.log(`Enqueued scrape job for product ${productId}`);
  }
}
