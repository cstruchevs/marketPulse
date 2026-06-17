import { Module } from '@nestjs/common';
import { McpService } from './mcp.service';
import { McpServerService } from './mcp-server.service';
import { McpController } from './mcp.controller';
import { ProductsModule } from '../products/products.module';
import { PriceHistoryModule } from '../price-history/price-history.module';

@Module({
  imports: [ProductsModule, PriceHistoryModule],
  controllers: [McpController],
  providers: [McpService, McpServerService],
  exports: [McpServerService],
})
export class McpModule {}
