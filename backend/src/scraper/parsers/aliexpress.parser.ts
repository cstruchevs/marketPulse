import * as cheerio from 'cheerio';
import { IParser, ParsedProduct } from '../interfaces/parser.interface';

// AliExpress embeds product data in window.runParams = {...} inside a <script> tag.
// The JSON contains pageComponent.componentData.priceComponent and titleComponent.
const RUN_PARAMS_RE = /window\.runParams\s*=\s*(\{[\s\S]*?\});\s*(?:window\.|var )/;

export class AliExpressParser implements IParser {
  parse(html: string, _url: string): ParsedProduct | null {
    const match = html.match(RUN_PARAMS_RE);
    if (!match) return this.parseFallbackHtml(html);

    try {
      const data = JSON.parse(match[1]) as Record<string, unknown>;
      const components = (data?.data as Record<string, unknown>)?.pageComponent as
        | { componentData?: Record<string, unknown> }
        | undefined;

      const price = this.extractPrice(components?.componentData);
      const name = this.extractName(components?.componentData);
      if (!price || !name) return this.parseFallbackHtml(html);

      return { name, price, currency: 'USD' };
    } catch {
      return this.parseFallbackHtml(html);
    }
  }

  private extractPrice(
    componentData: Record<string, unknown> | undefined,
  ): number | null {
    if (!componentData) return null;
    const priceComp = componentData['priceComponent'] as
      | { discountPrice?: { formattedPrice?: string }; originalPrice?: { formattedPrice?: string } }
      | undefined;

    const raw =
      priceComp?.discountPrice?.formattedPrice ??
      priceComp?.originalPrice?.formattedPrice;
    if (!raw) return null;

    const numStr = raw.replace(/[^0-9.]/g, '');
    const val = parseFloat(numStr);
    return isNaN(val) ? null : val;
  }

  private extractName(
    componentData: Record<string, unknown> | undefined,
  ): string | null {
    if (!componentData) return null;
    const titleComp = componentData['titleComponent'] as
      | { subject?: string }
      | undefined;
    return titleComp?.subject?.trim() ?? null;
  }

  // Fallback for pages that don't expose window.runParams (rare cases)
  private parseFallbackHtml(html: string): ParsedProduct | null {
    const $ = cheerio.load(html);

    const name =
      $('h1[data-pl="product-title"]').text().trim() ||
      $('.product-title-text').text().trim();
    if (!name) return null;

    const priceText =
      $('.product-price-value').first().text().trim() ||
      $('[class*="price"]').first().text().trim();
    const match = priceText.match(/[\d,]+\.?\d*/);
    if (!match) return null;

    const price = parseFloat(match[0].replace(/,/g, ''));
    if (isNaN(price)) return null;

    return { name, price, currency: 'USD' };
  }
}
