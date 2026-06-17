import * as cheerio from 'cheerio';
import { IParser, ParsedProduct } from '../interfaces/parser.interface';

// eBay — chosen as third marketplace because:
// - Stable, well-documented CSS selectors
// - No heavy JS rendering required for most listings
// - Major US marketplace with millions of products
export class EbayParser implements IParser {
  parse(html: string, _url: string): ParsedProduct | null {
    const $ = cheerio.load(html);

    // Title: .x-item-title__mainTitle or legacy #itemTitle
    const name =
      $('.x-item-title__mainTitle .ux-textspans--BOLD').text().trim() ||
      $('.x-item-title__mainTitle .ux-textspans').text().trim() ||
      $('#itemTitle').text().replace(/Details about\s*/i, '').trim();
    if (!name) return null;

    // Price: .x-price-primary or legacy #prcIsum
    const priceText =
      $('.x-price-primary .ux-textspans').first().text().trim() ||
      $('#prcIsum').attr('content') ||
      $('#prcIsum').text().trim();

    const priceMatch = priceText.match(/[\d,]+\.?\d*/);
    if (!priceMatch) return null;

    const price = parseFloat(priceMatch[0].replace(/,/g, ''));
    if (isNaN(price) || price <= 0) return null;

    // Currency: look for $ prefix or meta tag
    const currencyMeta = $('meta[itemprop="priceCurrency"]').attr('content');
    const currency = currencyMeta ?? (priceText.startsWith('$') ? 'USD' : 'USD');

    // Main image
    const imageUrl =
      $('.ux-image-carousel-item.active img').attr('src') ||
      $('#icImg').attr('src') ||
      undefined;

    return { name, price, currency, imageUrl };
  }
}
