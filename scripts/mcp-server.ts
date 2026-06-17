#!/usr/bin/env ts-node
/**
 * Standalone MCP Server — stdio transport для Claude Desktop / Cursor / Windsurf
 *
 * Как запустить вручную (для теста):
 *   cd backend && npm run mcp
 *
 * Claude Desktop config (~/.config/claude/claude_desktop_config.json):
 * {
 *   "mcpServers": {
 *     "market-pulse": {
 *       "command": "node",
 *       "args": ["/absolute/path/to/marketPulse/backend/dist/mcp-server.js"],
 *       "env": {
 *         "DATABASE_URL": "postgresql://mp_user:mp_secret@localhost:5432/market_pulse",
 *         "ANTHROPIC_API_KEY": "sk-ant-...",
 *         "NODE_ENV": "development"
 *       }
 *     }
 *   }
 * }
 *
 * ВАЖНО: MCP использует stdout для протокола, все логи ДОЛЖНЫ идти в stderr.
 * Поэтому NestJS логгер отключён ({ logger: false }).
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getDatabaseConfig } from '../backend/src/config/database.config';
import { McpModule } from '../backend/src/mcp/mcp.module';
import { McpServerService } from '../backend/src/mcp/mcp-server.service';

// Lightweight module — only what MCP tools need (no HTTP server, no BullMQ, no SSE)
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getDatabaseConfig,
    }),
    McpModule,
  ],
})
class McpStandaloneModule {}

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(McpStandaloneModule, {
    logger: false, // stdout must be clean for MCP stdio protocol
  });

  const mcpServerService = app.get(McpServerService);
  const server = mcpServerService.createServer();
  const transport = new StdioServerTransport();

  process.stderr.write('[market-pulse MCP] Starting on stdio transport...\n');

  await server.connect(transport);

  process.stderr.write('[market-pulse MCP] Ready. Waiting for requests.\n');

  // Keep process alive — MCP server runs until Claude Desktop disconnects
  process.on('SIGINT', async () => {
    process.stderr.write('[market-pulse MCP] Shutting down...\n');
    await server.close();
    await app.close();
    process.exit(0);
  });
}

main().catch((err) => {
  process.stderr.write(`[market-pulse MCP] Fatal error: ${(err as Error).message}\n`);
  process.exit(1);
});
