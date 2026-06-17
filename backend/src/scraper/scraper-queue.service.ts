import { Injectable, Logger } from '@nestjs/common';

// Stub — Step 8 replaces this with BullMQ enqueue logic
@Injectable()
export class ScraperQueueService {
  private readonly logger = new Logger(ScraperQueueService.name);

  async enqueue(productId: string): Promise<void> {
    this.logger.log(`[stub] Scrape job queued for product ${productId}`);
  }
}
