import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../config/redis.provider';
import { ScraperService } from '../scraper/scraper.service';
import { ProductRepository } from '../products/repositories/product.repository';
import { PriceHistoryRepository } from '../price-history/price-history.repository';
import { ProductStatus } from '../products/product.entity';
import {
  SCRAPING_QUEUE,
  SCRAPE_PRODUCT_JOB,
  ALERTS_QUEUE,
  SEND_PRICE_ALERT_JOB,
  JOB_DEFAULTS,
} from './queues.config';

interface ScrapeJobData {
  productId: string;
}

interface AlertJobData {
  productId: string;
  userId: string;
  oldPrice: number;
  newPrice: number;
  threshold: number;
}

const LOCK_TTL_SECONDS = 300;
const SCRAPE_INTERVAL_MINUTES = 60;

@Processor(SCRAPING_QUEUE)
export class ScrapingProcessor extends WorkerHost {
  private readonly logger = new Logger(ScrapingProcessor.name);

  constructor(
    private readonly scraperService: ScraperService,
    private readonly productRepo: ProductRepository,
    private readonly priceHistoryRepo: PriceHistoryRepository,
    @InjectQueue(ALERTS_QUEUE) private readonly alertsQueue: Queue,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    super();
  }

  async process(job: Job<ScrapeJobData>): Promise<void> {
    if (job.name !== SCRAPE_PRODUCT_JOB) return;

    const { productId } = job.data;
    const lockKey = `product:lock:${productId}`;

    const product = await this.productRepo.findById(productId);
    if (!product) {
      this.logger.warn(`Product ${productId} not found — skipping job`);
      return;
    }

    if (product.status === ProductStatus.PAUSED) {
      this.logger.log(`Product ${productId} is paused — skipping`);
      return;
    }

    // Distributed lock: prevent duplicate concurrent scrapes for same product
    const locked = await this.redis.set(lockKey, '1', 'EX', LOCK_TTL_SECONDS, 'NX');
    if (!locked) {
      this.logger.log(`Product ${productId} is already being scraped (lock active)`);
      return;
    }

    const oldPrice = product.currentPrice ? Number(product.currentPrice) : null;

    try {
      const result = await this.scraperService.scrapeProduct(product, job.id);

      const scrapedAt = new Date();
      await this.priceHistoryRepo.save({
        productId,
        price: result.price,
        currency: result.currency,
        scrapedAt,
        rawDataS3Key: result.rawS3Key,
      });

      const nextScrapeAt = new Date(Date.now() + SCRAPE_INTERVAL_MINUTES * 60 * 1000);
      await this.productRepo.updateAfterScrape(
        productId,
        result.price,
        ProductStatus.ACTIVE,
        nextScrapeAt,
      );

      // Populate name/image on first scrape
      if ((!product.name || !product.imageUrl) && (result.name || result.imageUrl)) {
        if (!product.name) product.name = result.name;
        if (!product.imageUrl && result.imageUrl) product.imageUrl = result.imageUrl;
        await this.productRepo.save(product);
      }

      // Trigger alert if price dropped below threshold
      if (
        product.alertEnabled &&
        product.alertThreshold &&
        result.price <= Number(product.alertThreshold)
      ) {
        const alertData: AlertJobData = {
          productId,
          userId: product.userId,
          oldPrice: oldPrice ?? result.price,
          newPrice: result.price,
          threshold: Number(product.alertThreshold),
        };
        await this.alertsQueue.add(SEND_PRICE_ALERT_JOB, alertData, JOB_DEFAULTS);
        this.logger.log(
          `Price alert queued for product ${productId}: ${result.price} <= ${product.alertThreshold}`,
        );
      }
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Scrape failed for product ${productId}: ${message}`);

      await this.productRepo.updateAfterScrape(
        productId,
        oldPrice ?? 0,
        ProductStatus.ERROR,
        new Date(Date.now() + SCRAPE_INTERVAL_MINUTES * 60 * 1000),
        message,
      );

      throw err; // let BullMQ apply exponential backoff retry
    } finally {
      await this.redis.del(lockKey);
    }
  }
}
