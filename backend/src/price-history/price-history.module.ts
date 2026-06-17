import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PriceHistory } from './price-history.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PriceHistory])],
  exports: [TypeOrmModule],
})
export class PriceHistoryModule {}
