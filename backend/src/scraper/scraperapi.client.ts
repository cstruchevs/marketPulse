import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { SecretsService } from '../config/secrets.service';

export interface ScraperOptions {
  render?: boolean;       // headless Chrome (JS rendering)
  countryCode?: string;   // geo: 'us', 'de', 'cn', etc.
  premium?: boolean;      // premium residential proxies
}

export interface ScraperResult {
  html: string;
  statusCode: number;
  durationMs: number;
  attempts: number;
}

const SCRAPERAPI_BASE = 'https://api.scraperapi.com';
const TIMEOUT_MS = 60_000;
const MAX_RETRIES = 3;

@Injectable()
export class ScraperApiClient {
  private readonly logger = new Logger(ScraperApiClient.name);
  private readonly http: AxiosInstance;

  constructor(private readonly secrets: SecretsService) {
    this.http = axios.create({ timeout: TIMEOUT_MS });
  }

  async scrapeUrl(
    url: string,
    options: ScraperOptions = {},
    requestId?: string,
  ): Promise<ScraperResult> {
    const apiKey = await this.secrets.getScraperApiKey();
    const start = Date.now();
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const resp = await this.http.get(SCRAPERAPI_BASE, {
          params: {
            api_key: apiKey,
            url,
            render: options.render ? 'true' : undefined,
            country_code: options.countryCode ?? 'us',
            premium: options.premium ? 'true' : undefined,
          },
        });

        const durationMs = Date.now() - start;
        this.logger.log(
          `[${requestId ?? '-'}] scraped ${url} status=${resp.status} duration=${durationMs}ms attempt=${attempt}`,
        );

        return {
          html: resp.data as string,
          statusCode: resp.status,
          durationMs,
          attempts: attempt,
        };
      } catch (err) {
        lastError = err as Error;
        const status = axios.isAxiosError(err) ? err.response?.status : null;

        if (status === 429) {
          // Rate limited — exponential backoff
          const delay = Math.pow(2, attempt) * 1000;
          this.logger.warn(
            `[${requestId ?? '-'}] ScraperAPI 429 on attempt ${attempt}, retrying in ${delay}ms`,
          );
          await sleep(delay);
          continue;
        }

        // Non-retryable error
        if (attempt === MAX_RETRIES) break;
        await sleep(1000 * attempt);
      }
    }

    throw new Error(
      `ScraperAPI failed after ${MAX_RETRIES} attempts for ${url}: ${lastError?.message}`,
    );
  }

  async checkAccountStatus(): Promise<{ requestsUsed: number; requestsLimit: number }> {
    const apiKey = await this.secrets.getScraperApiKey();
    const resp = await this.http.get<{ requestCount: number; requestLimit: number }>(
      'https://api.scraperapi.com/account',
      { params: { api_key: apiKey } },
    );
    return {
      requestsUsed: resp.data.requestCount,
      requestsLimit: resp.data.requestLimit,
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
