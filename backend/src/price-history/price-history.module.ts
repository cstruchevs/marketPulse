import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PriceHistory } from './price-history.entity';
import { PriceHistoryRepository } from './price-history.repository';

@Module({
  imports: [TypeOrmModule.forFeature([PriceHistory])],
  providers: [PriceHistoryRepository],
  exports: [TypeOrmModule, PriceHistoryRepository],
})
export class PriceHistoryModule {}
