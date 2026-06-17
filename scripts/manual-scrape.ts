#!/usr/bin/env ts-node
/**
 * Manual scraper — run from the repo root:
 *
 *   npx ts-node -r tsconfig-paths/register scripts/manual-scrape.ts <URL>
 *
 * Or add to backend/package.json scripts:
 *   "scrape": "ts-node -r tsconfig-paths/register ../scripts/manual-scrape.ts"
 *
 * Requires SCRAPER_API_KEY in .env (or environment)
 * Supported: amazon.com, aliexpress.com, ebay.com
 */

import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

import axios from 'axios';
import * as cheerio from 'cheerio';
import { AmazonParser } from '../backend/src/scraper/parsers/amazon.parser';
import { AliExpressParser } from '../backend/src/scraper/parsers/aliexpress.parser';
import { EbayParser } from '../backend/src/scraper/parsers/ebay.parser';
import { IParser } from '../backend/src/scraper/interfaces/parser.interface';

const SCRAPERAPI_BASE = 'https://api.scraperapi.com';

const PARSERS: Record<string, IParser> = {
  'amazon.com': new AmazonParser(),
  'www.amazon.com': new AmazonParser(),
  'aliexpress.com': new AliExpressParser(),
  'www.aliexpress.com': new AliExpressParser(),
  'ebay.com': new EbayParser(),
  'www.ebay.com': new EbayParser(),
};

async function main(): Promise<void> {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: ts-node scripts/manual-scrape.ts <URL>');
    console.error('');
    console.error('Supported sites:');
    console.error('  https://www.amazon.com/dp/...');
    console.error('  https://www.aliexpress.com/item/...');
    console.error('  https://www.ebay.com/itm/...');
    process.exit(1);
  }

  const apiKey = process.env.SCRAPER_API_KEY;
  if (!apiKey) {
    console.error('Error: SCRAPER_API_KEY not set in environment or .env file');
    process.exit(1);
  }

  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    console.error(`Error: invalid URL "${url}"`);
    process.exit(1);
  }

  const parser = PARSERS[hostname];
  if (!parser) {
    console.error(`Error: unsupported site "${hostname}"`);
    console.error(`Supported: ${Object.keys(PARSERS).join(', ')}`);
    process.exit(1);
  }

  const render = hostname.includes('amazon') || hostname.includes('aliexpress');

  console.log(`\n🔍 Scraping: ${url}`);
  console.log(`   Parser:  ${hostname}`);
  console.log(`   Render:  ${render ? 'yes (headless Chrome)' : 'no'}`);
  console.log('   ...\n');

  const start = Date.now();
  let html: string;

  try {
    const resp = await axios.get(SCRAPERAPI_BASE, {
      params: {
        api_key: apiKey,
        url,
        render: render ? 'true' : undefined,
        country_code: 'us',
      },
      timeout: 60_000,
    });
    html = resp.data as string;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error(`ScraperAPI error: ${err.response?.status} ${err.message}`);
    } else {
      console.error(`Network error: ${(err as Error).message}`);
    }
    process.exit(1);
  }

  const duration = Date.now() - start;
  console.log(`✅ Fetched HTML in ${duration}ms (${html.length} bytes)`);

  const result = parser.parse(html, url);

  if (!result) {
    console.error('\n❌ Parser returned null — selectors may have changed.');
    console.error(
      '   Tip: Check CSS selectors in the parser file.',
    );
    // Save HTML locally for inspection
    const fs = await import('fs');
    const debugPath = path.join(__dirname, 'debug-last-response.html');
    fs.writeFileSync(debugPath, html);
    console.error(`   Raw HTML saved to: ${debugPath}`);
    process.exit(1);
  }

  console.log('\n📦 Parsed result:');
  console.log(`   Name:     ${result.name}`);
  console.log(`   Price:    ${result.currency} ${result.price}`);
  console.log(`   Image:    ${result.imageUrl ?? '(none)'}`);
  console.log('');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
