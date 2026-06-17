import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScraperQueueService } from './scraper-queue.service';
import { ScraperService } from './scraper.service';
import { ScraperApiClient } from './scraperapi.client';
import { SecretsService } from '../config/secrets.service';
import { SCRAPING_QUEUE } from '../workers/queues.config';

@Module({
  imports: [BullModule.registerQueue({ name: SCRAPING_QUEUE })],
  providers: [ScraperQueueService, ScraperService, ScraperApiClient, SecretsService],
  exports: [ScraperQueueService, ScraperService, ScraperApiClient, SecretsService],
})
export class ScraperModule {}
