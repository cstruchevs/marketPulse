import { Module } from '@nestjs/common';
import { ScraperQueueService } from './scraper-queue.service';

@Module({
  providers: [ScraperQueueService],
  exports: [ScraperQueueService],
})
export class ScraperModule {}
