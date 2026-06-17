import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './product.entity';
import { PriceHistory } from '../price-history/price-history.entity';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProductRepository } from './repositories/product.repository';
import { PriceHistoryRepository } from '../price-history/price-history.repository';
import { ScraperModule } from '../scraper/scraper.module';

@Module({
  imports: [TypeOrmModule.forFeature([Product, PriceHistory]), ScraperModule],
  controllers: [ProductsController],
  providers: [ProductsService, ProductRepository, PriceHistoryRepository],
  exports: [ProductsService, ProductRepository],
})
export class ProductsModule {}
