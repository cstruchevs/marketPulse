import { ApiProperty } from '@nestjs/swagger';
import { Product, ProductStatus } from '../product.entity';

// Never expose: userId, passwordHash, rawDataS3Key, nextScrapeAt internals
export class ProductResponseDto {
  @ApiProperty() id: string;
  @ApiProperty() url: string;
  @ApiProperty({ nullable: true }) name: string | null;
  @ApiProperty({ nullable: true }) imageUrl: string | null;
  @ApiProperty({ nullable: true, type: Number }) currentPrice: number | null;
  @ApiProperty() currency: string;
  @ApiProperty({ enum: ProductStatus }) status: ProductStatus;
  @ApiProperty({ nullable: true, type: Number }) alertThreshold: number | null;
  @ApiProperty() alertEnabled: boolean;
  @ApiProperty({ nullable: true }) lastScrapedAt: Date | null;
  @ApiProperty({ nullable: true }) nextScrapeAt: Date | null;
  @ApiProperty({ nullable: true }) errorMessage: string | null;
  @ApiProperty() scrapesCount: number;
  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'Price change % vs previous scrape, null if < 2 data points',
  })
  priceChange: number | null;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;

  static from(product: Product, priceChange: number | null = null): ProductResponseDto {
    const dto = new ProductResponseDto();
    dto.id = product.id;
    dto.url = product.url;
    dto.name = product.name ?? null;
    dto.imageUrl = product.imageUrl ?? null;
    dto.currentPrice = product.currentPrice != null ? Number(product.currentPrice) : null;
    dto.currency = product.currency;
    dto.status = product.status;
    dto.alertThreshold = product.alertThreshold != null ? Number(product.alertThreshold) : null;
    dto.alertEnabled = product.alertEnabled;
    dto.lastScrapedAt = product.lastScrapedAt ?? null;
    dto.nextScrapeAt = product.nextScrapeAt ?? null;
    dto.errorMessage = product.errorMessage ?? null;
    dto.scrapesCount = product.scrapesCount;
    dto.priceChange = priceChange != null ? Math.round(priceChange * 100) / 100 : null;
    dto.createdAt = product.createdAt;
    dto.updatedAt = product.updatedAt;
    return dto;
  }
}
