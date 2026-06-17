import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

@Injectable()
export class SecretsService implements OnModuleInit {
  private readonly logger = new Logger(SecretsService.name);
  private readonly client: SecretsManagerClient;
  private readonly isDev: boolean;

  // Simple in-memory cache: secretName → { value, fetchedAt }
  private readonly cache = new Map<string, { value: string; fetchedAt: number }>();

  constructor(private readonly config: ConfigService) {
    this.isDev = config.get('NODE_ENV') !== 'production';
    this.client = new SecretsManagerClient({
      region: config.get('AWS_REGION') ?? 'us-east-1',
      endpoint: config.get('LOCALSTACK_ENDPOINT'), // set in dev for LocalStack
    });
  }

  async onModuleInit(): Promise<void> {
    // Pre-warm the most important secret at startup
    try {
      await this.getScraperApiKey();
    } catch (err) {
      this.logger.warn(`Could not pre-fetch SCRAPER_API_KEY at startup: ${(err as Error).message}`);
    }
  }

  async getScraperApiKey(): Promise<string> {
    if (this.isDev) {
      return this.config.getOrThrow<string>('SCRAPER_API_KEY');
    }
    return this.getSecret('market-pulse/scraper-api-key');
  }

  private async getSecret(secretName: string): Promise<string> {
    const cached = this.cache.get(secretName);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return cached.value;
    }

    this.logger.log(`Fetching secret ${secretName} from Secrets Manager`);
    const resp = await this.client.send(
      new GetSecretValueCommand({ SecretId: secretName }),
    );

    const value = resp.SecretString ?? '';
    this.cache.set(secretName, { value, fetchedAt: Date.now() });
    return value;
  }
}
