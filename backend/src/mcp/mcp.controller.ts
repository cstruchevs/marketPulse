import { Controller, Get, Post, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { McpService, MarketReportResult } from './mcp.service';
import { ProductRepository } from '../products/repositories/product.repository';
import { NotFoundException } from '@nestjs/common';

@ApiTags('mcp')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('mcp')
export class McpController {
  constructor(
    private readonly mcpService: McpService,
    private readonly productRepo: ProductRepository,
  ) {}

  @Post('analyze/:productId')
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // Claude calls are expensive
  @ApiOperation({ summary: 'Analyze price trend with Claude AI' })
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
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Get structured market report (no Claude, data only)' })
  async report(
    @CurrentUser() user: AuthUser,
    @Param('productId', ParseUUIDPipe) productId: string,
  ): Promise<MarketReportResult> {
    await this.assertOwnership(productId, user.userId);
    return this.mcpService.generateMarketReport(productId);
  }

  private async assertOwnership(productId: string, userId: string): Promise<void> {
    const product = await this.productRepo.findByIdAndUserId(productId, userId);
    if (!product) throw new NotFoundException(`Product ${productId} not found`);
  }
}
