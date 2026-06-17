import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { ScraperApiClient } from './scraperapi.client';
import { AmazonParser } from './parsers/amazon.parser';
import { AliExpressParser } from './parsers/aliexpress.parser';
import { EbayParser } from './parsers/ebay.parser';
import { UnsupportedSiteException } from './exceptions/unsupported-site.exception';
import { IParser, ParsedProduct } from './interfaces/parser.interface';
import { Product } from '../products/product.entity';

export interface ScrapeResult {
  name: string;
  price: number;
  currency: string;
  imageUrl?: string;
  rawS3Key: string;
}

@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;

  private readonly parsers: Record<string, IParser> = {
    'amazon.com': new AmazonParser(),
    'www.amazon.com': new AmazonParser(),
    'aliexpress.com': new AliExpressParser(),
    'www.aliexpress.com': new AliExpressParser(),
    'ebay.com': new EbayParser(),
    'www.ebay.com': new EbayParser(),
  };

  constructor(
    private readonly scraperClient: ScraperApiClient,
    private readonly config: ConfigService,
  ) {
    this.bucket = config.getOrThrow<string>('S3_BUCKET_NAME');
    this.s3 = new S3Client({
      region: config.get('AWS_REGION') ?? 'us-east-1',
      endpoint: config.get('LOCALSTACK_ENDPOINT'),
      forcePathStyle: !!config.get('LOCALSTACK_ENDPOINT'), // required for LocalStack
    });
  }

  async scrapeProduct(product: Product, requestId?: string): Promise<ScrapeResult> {
    const parser = this.detectParser(product.url);

    // Amazon product pages need JS for price — enable render for amazon
    const hostname = new URL(product.url).hostname;
    const render = hostname.includes('amazon') || hostname.includes('aliexpress');

    const { html } = await this.scraperClient.scrapeUrl(
      product.url,
      { render, countryCode: 'us' },
      requestId,
    );

    // Always store raw HTML in S3 for debugging (per CLAUDE.md)
    const rawS3Key = await this.saveRawHtml(product.id, html);

    const parsed = parser.parse(html, product.url);
    if (!parsed) {
      this.logger.warn(
        `Parser returned null for product ${product.id} (${hostname}). ` +
          `Raw HTML saved at s3://${this.bucket}/${rawS3Key}`,
      );
      throw new Error(`Parser failed for ${product.url}. Raw HTML: ${rawS3Key}`);
    }

    this.logger.log(
      `Scraped product ${product.id}: price=${parsed.price} ${parsed.currency}`,
    );

    return { ...parsed, rawS3Key };
  }

  detectParser(url: string): IParser {
    const { hostname } = new URL(url);
    const parser = this.parsers[hostname];
    if (!parser) throw new UnsupportedSiteException(hostname);
    return parser;
  }

  private async saveRawHtml(productId: string, html: string): Promise<string> {
    const key = `raw/${productId}/${Date.now()}.html`;
    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: html,
          ContentType: 'text/html',
        }),
      );
    } catch (err) {
      // Don't fail the whole scrape if S3 write fails — just log it
      this.logger.error(`Failed to save raw HTML to S3: ${(err as Error).message}`);
    }
    return key;
  }
}
