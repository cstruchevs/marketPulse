import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { ProductRepository } from '../products/repositories/product.repository';
import { PriceHistoryRepository } from '../price-history/price-history.repository';
import { PriceHistory } from '../price-history/price-history.entity';

export interface PriceTrendResult {
  productId: string;
  productName: string | null;
  days: number;
  dataPoints: number;
  min: number;
  max: number;
  avg: number;
  median: number;
  stdDev: number;
  changePercent: number | null;
  currentPrice: number | null;
  history: { date: string; price: number }[];
}

export interface BestBuyTimeResult {
  productId: string;
  byDayOfWeek: Record<string, number>;   // 'Mon' → avgPrice
  byDayOfMonth: Record<number, number>;  // 1..31 → avgPrice
  bestDayOfWeek: string;
  bestDayOfMonth: number;
}

export interface MarketReportResult {
  trend: PriceTrendResult;
  bestBuyTime: BestBuyTimeResult;
  recommendation: 'buy_now' | 'wait';
  recommendationReason: string;
  currentVsAvg: number; // % diff between currentPrice and 90-day avg
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);
  private readonly anthropic: Anthropic;

  constructor(
    private readonly productRepo: ProductRepository,
    private readonly priceHistoryRepo: PriceHistoryRepository,
    private readonly config: ConfigService,
  ) {
    this.anthropic = new Anthropic({
      apiKey: config.getOrThrow<string>('ANTHROPIC_API_KEY'),
    });
  }

  // ── Tool handlers ────────────────────────────────────────────────────────────

  async analyzePriceTrend(productId: string, days: number): Promise<PriceTrendResult> {
    const product = await this.productRepo.findById(productId);
    if (!product) throw new NotFoundException(`Product ${productId} not found`);

    const history = await this.priceHistoryRepo.findByProductId(productId, 500, 0,
      new Date(Date.now() - days * 24 * 60 * 60 * 1000),
    );

    if (!history.length) {
      return {
        productId,
        productName: product.name,
        days,
        dataPoints: 0,
        min: 0, max: 0, avg: 0, median: 0, stdDev: 0,
        changePercent: null,
        currentPrice: product.currentPrice ? Number(product.currentPrice) : null,
        history: [],
      };
    }

    const prices = history.map((h) => Number(h.price));
    const sorted = [...prices].sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
    const median = sorted[Math.floor(sorted.length / 2)];
    const stdDev = Math.sqrt(
      prices.reduce((s, p) => s + Math.pow(p - avg, 2), 0) / prices.length,
    );

    const first = prices[prices.length - 1]; // oldest (DESC order)
    const last = prices[0];                  // newest
    const changePercent = first !== 0 ? ((last - first) / first) * 100 : null;

    return {
      productId,
      productName: product.name,
      days,
      dataPoints: prices.length,
      min: round2(min),
      max: round2(max),
      avg: round2(avg),
      median: round2(median),
      stdDev: round2(stdDev),
      changePercent: changePercent !== null ? round2(changePercent) : null,
      currentPrice: product.currentPrice ? Number(product.currentPrice) : null,
      history: history.map((h) => ({
        date: h.scrapedAt.toISOString().split('T')[0],
        price: Number(h.price),
      })),
    };
  }

  async predictBestBuyTime(productId: string): Promise<BestBuyTimeResult> {
    const product = await this.productRepo.findById(productId);
    if (!product) throw new NotFoundException(`Product ${productId} not found`);

    const history = await this.priceHistoryRepo.findByProductId(productId, 500, 0,
      new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    );

    const byDow: Record<string, number[]> = {};
    const byDom: Record<number, number[]> = {};

    for (const h of history) {
      const d = new Date(h.scrapedAt);
      const dow = DAY_NAMES[d.getDay()];
      const dom = d.getDate();
      const price = Number(h.price);

      (byDow[dow] ??= []).push(price);
      (byDom[dom] ??= []).push(price);
    }

    const avgByDow = Object.fromEntries(
      Object.entries(byDow).map(([k, v]) => [k, round2(v.reduce((s, p) => s + p, 0) / v.length)]),
    );
    const avgByDom = Object.fromEntries(
      Object.entries(byDom).map(([k, v]) => [
        Number(k),
        round2(v.reduce((s, p) => s + p, 0) / v.length),
      ]),
    ) as Record<number, number>;

    const bestDayOfWeek =
      Object.entries(avgByDow).sort((a, b) => a[1] - b[1])[0]?.[0] ?? 'Mon';
    const bestDayOfMonth =
      Object.entries(avgByDom)
        .sort((a, b) => Number(a[1]) - Number(b[1]))[0]?.[0] ?? '1';

    return {
      productId,
      byDayOfWeek: avgByDow,
      byDayOfMonth: avgByDom,
      bestDayOfWeek,
      bestDayOfMonth: Number(bestDayOfMonth),
    };
  }

  async generateMarketReport(productId: string): Promise<MarketReportResult> {
    const [trend, bestBuyTime] = await Promise.all([
      this.analyzePriceTrend(productId, 90),
      this.predictBestBuyTime(productId),
    ]);

    const currentPrice = trend.currentPrice ?? trend.avg;
    const currentVsAvg = trend.avg !== 0
      ? round2(((currentPrice - trend.avg) / trend.avg) * 100)
      : 0;

    // Simple buy signal: current price is below average
    const recommendation: 'buy_now' | 'wait' =
      currentVsAvg <= -5 ? 'buy_now' : 'wait';

    const recommendationReason =
      recommendation === 'buy_now'
        ? `Current price ($${currentPrice}) is ${Math.abs(currentVsAvg)}% below the 90-day average ($${trend.avg})`
        : `Current price ($${currentPrice}) is ${currentVsAvg >= 0 ? 'at or above' : 'only slightly below'} the 90-day average ($${trend.avg}). Best day to buy: ${bestBuyTime.bestDayOfWeek}`;

    return { trend, bestBuyTime, recommendation, recommendationReason, currentVsAvg };
  }

  // ── Claude AI analysis ───────────────────────────────────────────────────────

  async analyzeWithClaude(productId: string): Promise<string> {
    const tools: Anthropic.Tool[] = [
      {
        name: 'analyze_price_trend',
        description: 'Analyze price history of a product and identify trend',
        input_schema: {
          type: 'object' as const,
          properties: {
            productId: { type: 'string', description: 'Product UUID' },
            days: { type: 'number', description: 'Number of days to analyze (7-90)' },
          },
          required: ['productId', 'days'],
        },
      },
      {
        name: 'predict_best_buy_time',
        description: 'Based on historical price patterns, suggest optimal time to buy',
        input_schema: {
          type: 'object' as const,
          properties: {
            productId: { type: 'string', description: 'Product UUID' },
          },
          required: ['productId'],
        },
      },
      {
        name: 'generate_market_report',
        description: 'Generate a comprehensive price analysis report for a product',
        input_schema: {
          type: 'object' as const,
          properties: {
            productId: { type: 'string', description: 'Product UUID' },
          },
          required: ['productId'],
        },
      },
    ];

    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content:
          `Analyze the price trend for product ID: ${productId}. ` +
          `Use the available tools to get price data, then provide: ` +
          `1) Overall price trend analysis, 2) Whether now is a good time to buy, ` +
          `3) When prices are typically lowest. Be concise and actionable.`,
      },
    ];

    // Agentic loop — Claude may call multiple tools before giving a final answer
    while (true) {
      const response = await this.anthropic.messages.create({
        model: 'claude-opus-4-6',
        max_tokens: 1024,
        tools,
        messages,
      });

      messages.push({ role: 'assistant', content: response.content });

      if (response.stop_reason === 'end_turn') {
        const textBlock = response.content.find((b) => b.type === 'text');
        return textBlock ? (textBlock as Anthropic.TextBlock).text : '';
      }

      // Process tool calls
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== 'tool_use') continue;

        const input = block.input as Record<string, unknown>;
        let result: unknown;

        try {
          if (block.name === 'analyze_price_trend') {
            result = await this.analyzePriceTrend(
              input.productId as string,
              input.days as number,
            );
          } else if (block.name === 'predict_best_buy_time') {
            result = await this.predictBestBuyTime(input.productId as string);
          } else if (block.name === 'generate_market_report') {
            result = await this.generateMarketReport(input.productId as string);
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        } catch (err) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: `Error: ${(err as Error).message}`,
            is_error: true,
          });
        }
      }

      messages.push({ role: 'user', content: toolResults });
    }
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
