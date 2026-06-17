import { Module } from '@nestjs/common';
import { McpService } from './mcp.service';
import { McpController } from './mcp.controller';
import { ProductsModule } from '../products/products.module';
import { PriceHistoryModule } from '../price-history/price-history.module';

@Module({
  imports: [ProductsModule, PriceHistoryModule],
  controllers: [McpController],
  providers: [McpService],
})
export class McpModule {}
