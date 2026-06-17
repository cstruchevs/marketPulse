import * as cheerio from 'cheerio';
import { IParser, ParsedProduct } from '../interfaces/parser.interface';

export class AmazonParser implements IParser {
  parse(html: string, _url: string): ParsedProduct | null {
    const $ = cheerio.load(html);

    const name = $('#productTitle').text().trim();
    if (!name) return null;

    // Price can appear in two formats on Amazon:
    // 1. .a-price-whole + .a-price-fraction  (e.g. "29" + "99")
    // 2. .a-offscreen (hidden full-price string, e.g. "$29.99")
    let price: number | null = null;

    const whole = $('.a-price-whole').first().text().replace(/[^0-9]/g, '');
    const fraction = $('.a-price-fraction').first().text().replace(/[^0-9]/g, '');

    if (whole) {
      price = parseFloat(`${whole}.${fraction || '00'}`);
    } else {
      // Fallback: hidden offscreen price string
      const offscreen = $('.a-offscreen').first().text().trim();
      const match = offscreen.match(/[\d,]+\.?\d*/);
      if (match) price = parseFloat(match[0].replace(/,/g, ''));
    }

    if (!price || isNaN(price)) return null;

    // Main product image — prefer data-old-hires (high-res), fallback to src
    const imageEl = $('#landingImage, #imgBlkFront').first();
    const imageUrl =
      imageEl.attr('data-old-hires') ||
      imageEl.attr('src') ||
      undefined;

    return { name, price, currency: 'USD', imageUrl };
  }
}
