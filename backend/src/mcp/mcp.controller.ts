import {
  Controller,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
  UseGuards,
  Req,
  Res,
  Body,
  NotFoundException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { McpService, MarketReportResult } from './mcp.service';
import { McpServerService } from './mcp-server.service';
import { ProductRepository } from '../products/repositories/product.repository';

@ApiTags('mcp')
@Controller('mcp')
export class McpController {
  constructor(
    private readonly mcpService: McpService,
    private readonly mcpServerService: McpServerService,
    private readonly productRepo: ProductRepository,
  ) {}

  // ── AI analysis endpoints (require JWT) ──────────────────────────────────────

  @Post('analyze/:productId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Analyze price trend with Claude AI (agentic loop)' })
  @ApiResponse({ status: 200, schema: { properties: { analysis: { type: 'string' } } } })
  async analyze(
    @CurrentUser() user: AuthUser,
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<{ analysis: string }> {
    await this.assertOwnership(productId, user.userId);
    const analysis = await this.mcpService.analyzeWithClaude(productId);
    return { analysis };
  }

  @Get('report/:productId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Structured market report (no Claude, raw data only)' })
  async report(
    @CurrentUser() user: AuthUser,
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<MarketReportResult> {
    await this.assertOwnership(productId, user.userId);
    return this.mcpService.generateMarketReport(productId);
  }

  // ── MCP Streamable HTTP endpoint (no JWT — auth is handled by MCP client) ───
  // Claude Desktop / Cursor / any MCP client connects here.
  // POST /api/mcp/server  — MCP JSON-RPC requests
  // GET  /api/mcp/server  — SSE stream for server-sent messages
  // DELETE /api/mcp/server — close session

  @Post('server')
  @ApiOperation({ summary: 'MCP Streamable HTTP endpoint for MCP clients (Claude Desktop etc.)' })
  async handleMcpPost(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: unknown,
  ): Promise<void> {
    await this.handleMcpRequest(req, res, body);
  }

  @Get('server')
  async handleMcpGet(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.handleMcpRequest(req, res, undefined);
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private async handleMcpRequest(
    req: Request,
    res: Response,
    body: unknown,
  ): Promise<void> {
    // Stateless mode: each request gets a fresh transport + server instance.
    // No session state is kept between requests.
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    const server = this.mcpServerService.createServer();
    await server.connect(transport);

    res.on('close', () => void server.close());

    await transport.handleRequest(req, res, body);
  }

  private async assertOwnership(productId: string, userId: string): Promise<void> {
    const product = await this.productRepo.findByIdAndUserId(productId, userId);
    if (!product) throw new NotFoundException(`Product ${productId} not found`);
  }
}
