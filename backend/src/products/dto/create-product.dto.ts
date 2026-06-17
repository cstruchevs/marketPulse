import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsPositive, IsUrl, MaxLength } from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'https://www.amazon.com/dp/B08N5WRWNW' })
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2000)
  url: string;

  @ApiProperty({ required: false, example: 29.99 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  alertThreshold?: number;

  @ApiProperty({ required: false, example: false })
  @IsOptional()
  @IsBoolean()
  alertEnabled?: boolean;
}
