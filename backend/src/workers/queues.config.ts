export const SCRAPING_QUEUE = 'scraping';
export const ALERTS_QUEUE = 'alerts';
export const EXPORT_QUEUE = 'export';

export const SCRAPE_PRODUCT_JOB = 'scrape-product';
export const SEND_PRICE_ALERT_JOB = 'send-price-alert';
export const GENERATE_CSV_EXPORT_JOB = 'generate-csv-export';

export const JOB_DEFAULTS = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 30_000 },
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 50 },
} as const;
