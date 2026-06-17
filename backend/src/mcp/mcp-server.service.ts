import { Injectable } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { McpService } from './mcp.service';

@Injectable()
export class McpServerService {
  constructor(private readonly mcpService: McpService) {}

  // createServer() returns a fresh instance — safe for concurrent HTTP requests
  createServer(): McpServer {
    const server = new McpServer({
      name: 'market-pulse',
      version: '1.0.0',
    });

    server.registerTool(
      'analyze_price_trend',
      {
        description:
          'Analyze price history of a product and identify trend. Returns min, max, avg, median, std deviation and % change over N days.',
        inputSchema: {
          productId: z.string().describe('Product UUID'),
          days: z
            .number()
            .int()
            .min(7)
            .max(90)
            .describe('Number of days to analyze (7–90)'),
        },
      },
      async ({ productId, days }) => {
        try {
          const result = await this.mcpService.analyzePriceTrend(productId, days);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          };
        } catch (err) {
          return {
            content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
            isError: true,
          };
        }
      },
    );

    server.registerTool(
      'predict_best_buy_time',
      {
        description:
          'Based on 90-day historical price patterns, identify which day of week and day of month has the lowest average price.',
        inputSchema: {
          productId: z.string().describe('Product UUID'),
        },
      },
      async ({ productId }) => {
        try {
          const result = await this.mcpService.predictBestBuyTime(productId);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          };
        } catch (err) {
          return {
            content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
            isError: true,
          };
        }
      },
    );

    server.registerTool(
      'generate_market_report',
      {
        description:
          'Generate a comprehensive price report: trend stats + best buy time + buy/wait recommendation based on current price vs 90-day average.',
        inputSchema: {
          productId: z.string().describe('Product UUID'),
        },
      },
      async ({ productId }) => {
        try {
          const result = await this.mcpService.generateMarketReport(productId);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          };
        } catch (err) {
          return {
            content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
            isError: true,
          };
        }
      },
    );

    return server;
  }
}
