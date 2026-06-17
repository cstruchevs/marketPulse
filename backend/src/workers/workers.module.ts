import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScrapingProcessor } from './scraping.processor';
import { AlertsProcessor } from './alerts.processor';
import { ExportProcessor } from './export.processor';
import { ScrapingScheduler } from './scraping.scheduler';
import { QueueMonitorService } from './queue-monitor.service';
import { ScraperModule } from '../scraper/scraper.module';
import { ProductsModule } from '../products/products.module';
import { PriceHistoryModule } from '../price-history/price-history.module';
import { SCRAPING_QUEUE, ALERTS_QUEUE, EXPORT_QUEUE } from './queues.config';
import { redisProvider } from '../config/redis.provider';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: SCRAPING_QUEUE },
      { name: ALERTS_QUEUE },
      { name: EXPORT_QUEUE },
    ),
    ScraperModule,
    ProductsModule,
    PriceHistoryModule,
  ],
  providers: [
    redisProvider,
    ScrapingProcessor,
    AlertsProcessor,
    ExportProcessor,
    ScrapingScheduler,
    QueueMonitorService,
  ],
  exports: [QueueMonitorService, BullModule],
})
export class WorkersModule {}
