import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsPositive } from 'class-validator';
import { ProductStatus } from '../product.entity';

// Only fields a user may change directly. status is limited to active/paused;
// 'error' is set only by the scraper worker.
export class UpdateProductDto {
  @ApiProperty({ required: false, example: 25.0 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  alertThreshold?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  alertEnabled?: boolean;

  @ApiProperty({ required: false, enum: [ProductStatus.ACTIVE, ProductStatus.PAUSED] })
  @IsOptional()
  @IsEnum([ProductStatus.ACTIVE, ProductStatus.PAUSED])
  status?: ProductStatus.ACTIVE | ProductStatus.PAUSED;
}
