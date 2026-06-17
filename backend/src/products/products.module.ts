import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './product.entity';

// Full implementation in Step 6
@Module({
  imports: [TypeOrmModule.forFeature([Product])],
  exports: [TypeOrmModule],
})
export class ProductsModule {}
