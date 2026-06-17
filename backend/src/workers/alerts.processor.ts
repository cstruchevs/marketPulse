import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { ConfigService } from '@nestjs/config';
import { ProductRepository } from '../products/repositories/product.repository';
import { ALERTS_QUEUE, SEND_PRICE_ALERT_JOB } from './queues.config';
// AlertEvent and UsersRepository will be wired in once the modules expose them
// For now we import what's available and log the rest

interface AlertJobData {
  productId: string;
  userId: string;
  oldPrice: number;
  newPrice: number;
  threshold: number;
}

@Processor(ALERTS_QUEUE)
export class AlertsProcessor extends WorkerHost {
  private readonly logger = new Logger(AlertsProcessor.name);
  private readonly ses: SESClient;
  private readonly fromEmail: string;

  constructor(
    private readonly productRepo: ProductRepository,
    private readonly config: ConfigService,
  ) {
    super();
    this.fromEmail = config.get('AWS_SES_FROM_EMAIL') ?? 'alerts@marketpulse.app';
    this.ses = new SESClient({
      region: config.get('AWS_REGION') ?? 'us-east-1',
      endpoint: config.get('LOCALSTACK_ENDPOINT'),
    });
  }

  async process(job: Job<AlertJobData>): Promise<void> {
    if (job.name !== SEND_PRICE_ALERT_JOB) return;

    const { productId, userId, oldPrice, newPrice, threshold } = job.data;

    const product = await this.productRepo.findById(productId);
    if (!product) {
      this.logger.warn(`Product ${productId} not found for alert — skipping`);
      return;
    }

    // Guard: user may have disabled alerts after this job was enqueued
    if (!product.alertEnabled) {
      this.logger.log(`Alerts disabled for product ${productId} — skipping`);
      return;
    }

    const productName = product.name ?? product.url;
    const priceDiff = ((oldPrice - newPrice) / oldPrice) * 100;

    this.logger.log(
      `Sending price alert for product ${productId}: ` +
        `${oldPrice} → ${newPrice} (${priceDiff.toFixed(1)}% drop, threshold=${threshold})`,
    );

    await this.sendEmail(userId, productName, oldPrice, newPrice, threshold, product.url);

    // SSE notification will be added in Step 9 when SseService is available
    this.logger.log(`SSE notification stub: userId=${userId} price=${newPrice}`);
  }

  private async sendEmail(
    userId: string,
    productName: string,
    oldPrice: number,
    newPrice: number,
    threshold: number,
    url: string,
  ): Promise<void> {
    const subject = `Price Drop Alert: ${productName}`;
    const body = [
      `Good news! The price dropped below your threshold.`,
      ``,
      `Product: ${productName}`,
      `Previous price: $${oldPrice.toFixed(2)}`,
      `Current price: $${newPrice.toFixed(2)}`,
      `Your threshold: $${threshold.toFixed(2)}`,
      ``,
      `View product: ${url}`,
      ``,
      `— MarketPulse`,
    ].join('\n');

    try {
      await this.ses.send(
        new SendEmailCommand({
          Source: this.fromEmail,
          Destination: {
            // userId is email in dev; in prod fetch from UsersService (wired in Step 9)
            ToAddresses: [userId],
          },
          Message: {
            Subject: { Data: subject, Charset: 'UTF-8' },
            Body: { Text: { Data: body, Charset: 'UTF-8' } },
          },
        }),
      );
      this.logger.log(`Price alert email sent to user ${userId}`);
    } catch (err) {
      this.logger.error(`SES send failed: ${(err as Error).message}`);
      throw err;
    }
  }
}
