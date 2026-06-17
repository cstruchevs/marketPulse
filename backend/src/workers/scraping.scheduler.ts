import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ProductRepository } from '../products/repositories/product.repository';
import {
  SCRAPING_QUEUE,
  SCRAPE_PRODUCT_JOB,
  JOB_DEFAULTS,
} from './queues.config';

@Injectable()
export class ScrapingScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(ScrapingScheduler.name);

  constructor(
    @InjectQueue(SCRAPING_QUEUE) private readonly queue: Queue,
    private readonly productRepo: ProductRepository,
  ) {}

  // Runs on startup to catch any products whose nextScrapeAt is in the past
  async onApplicationBootstrap(): Promise<void> {
    this.logger.log('Bootstrap: scheduling overdue scrape jobs...');
    await this.enqueueOverdueProducts();
  }

  // Every 5 minutes: find products due for scraping and enqueue them
  @Cron('*/5 * * * *')
  async scheduleDueScrapes(): Promise<void> {
    await this.enqueueOverdueProducts();
  }

  private async enqueueOverdueProducts(): Promise<void> {
    const products = await this.productRepo.findDueForScraping();
    if (!products.length) return;

    // Fetch waiting + active job IDs to avoid duplicates
    const existingJobs = await this.queue.getJobs(['waiting', 'active']);
    const enqueuedIds = new Set(
      existingJobs.map((j) => (j.data as { productId: string }).productId),
    );

    let enqueued = 0;
    for (const product of products) {
      if (enqueuedIds.has(product.id)) continue;

      await this.queue.add(
        SCRAPE_PRODUCT_JOB,
        { productId: product.id },
        { ...JOB_DEFAULTS, jobId: `scrape:${product.id}:${Date.now()}` },
      );
      enqueued++;
    }

    if (enqueued > 0) {
      this.logger.log(`Scheduled ${enqueued} scrape job(s) (${products.length} due)`);
    }
  }
}
