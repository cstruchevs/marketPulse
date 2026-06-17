import { Injectable } from '@nestjs/common';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { McpService } from './mcp.service';

const TOOLS = [
  {
    name: 'analyze_price_trend',
    description:
      'Analyze price history of a product and identify trend. Returns min, max, avg, median, std deviation and % change over N days.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        productId: { type: 'string', description: 'Product UUID' },
        days: {
          type: 'number',
          description: 'Number of days to analyze (7–90)',
          minimum: 7,
          maximum: 90,
        },
      },
      required: ['productId', 'days'],
    },
  },
  {
    name: 'predict_best_buy_time',
    description:
      'Based on 90-day historical price patterns, identify which day of week and day of month has the lowest average price.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        productId: { type: 'string', description: 'Product UUID' },
      },
      required: ['productId'],
    },
  },
  {
    name: 'generate_market_report',
    description:
      'Generate a comprehensive price report: trend stats + best buy time + buy/wait recommendation based on current price vs 90-day average.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        productId: { type: 'string', description: 'Product UUID' },
      },
      required: ['productId'],
    },
  },
];

@Injectable()
export class McpServerService {
  constructor(private readonly mcpService: McpService) {}

  // Returns a fresh Server instance — safe for concurrent HTTP requests
  createServer(): Server {
    const server = new Server(
      { name: 'market-pulse', version: '1.0.0' },
      { capabilities: { tools: {} } },
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

    server.setRequestHandler(CallToolRequestSchema, async (req) => {
      const { name, arguments: args = {} } = req.params;

      try {
        let result: unknown;

        if (name === 'analyze_price_trend') {
          result = await this.mcpService.analyzePriceTrend(
            args['productId'] as string,
            args['days'] as number,
          );
        } else if (name === 'predict_best_buy_time') {
          result = await this.mcpService.predictBestBuyTime(args['productId'] as string);
        } else if (name === 'generate_market_report') {
          result = await this.mcpService.generateMarketReport(args['productId'] as string);
        } else {
          return {
            content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }],
          isError: true,
        };
      }
    });

    return server;
  }
}
