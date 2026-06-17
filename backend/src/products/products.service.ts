import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ProductRepository } from './repositories/product.repository';
import { PriceHistoryRepository } from '../price-history/price-history.repository';
import { ScraperQueueService } from '../scraper/scraper-queue.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PriceHistoryQueryDto } from './dto/price-history-query.dto';
import { ProductResponseDto } from './dto/product-response.dto';
import { PriceHistory } from '../price-history/price-history.entity';
import { ProductStatus } from './product.entity';

@Injectable()
export class ProductsService {
  constructor(
    private readonly productRepo: ProductRepository,
    private readonly priceHistoryRepo: PriceHistoryRepository,
    private readonly scraperQueue: ScraperQueueService,
  ) {}

  async create(userId: string, dto: CreateProductDto): Promise<ProductResponseDto> {
    const product = this.productRepo.create({
      userId,
      url: dto.url,
      alertThreshold: dto.alertThreshold,
      alertEnabled: dto.alertEnabled ?? false,
      status: ProductStatus.ACTIVE,
      nextScrapeAt: new Date(),
    });

    const saved = await this.productRepo.save(product);
    await this.scraperQueue.enqueue(saved.id);

    return ProductResponseDto.from(saved, null);
  }

  async findAll(userId: string): Promise<ProductResponseDto[]> {
    const products = await this.productRepo.findByUserId(userId);
    // priceChange is omitted in list view (too expensive per row)
    return products.map((p) => ProductResponseDto.from(p, null));
  }

  async findOne(id: string, userId: string): Promise<ProductResponseDto> {
    const product = await this.findOwnedProduct(id, userId);
    const priceChange = await this.computePriceChange(id);
    return ProductResponseDto.from(product, priceChange);
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateProductDto,
  ): Promise<ProductResponseDto> {
    const product = await this.findOwnedProduct(id, userId);

    if (dto.alertThreshold !== undefined) product.alertThreshold = dto.alertThreshold;
    if (dto.alertEnabled !== undefined) product.alertEnabled = dto.alertEnabled;
    if (dto.status !== undefined) product.status = dto.status;

    const saved = await this.productRepo.save(product);
    const priceChange = await this.computePriceChange(id);
    return ProductResponseDto.from(saved, priceChange);
  }

  async remove(id: string, userId: string): Promise<void> {
    const product = await this.findOwnedProduct(id, userId);
    await this.productRepo.remove(product);
  }

  async triggerScrape(id: string, userId: string): Promise<{ queued: boolean }> {
    const product = await this.findOwnedProduct(id, userId);

    if (product.status === ProductStatus.PAUSED) {
      throw new ForbiddenException('Cannot trigger scrape for a paused product');
    }

    await this.scraperQueue.enqueue(product.id);
    return { queued: true };
  }

  async getPriceHistory(
    id: string,
    userId: string,
    query: PriceHistoryQueryDto,
  ): Promise<PriceHistory[]> {
    await this.findOwnedProduct(id, userId);
    return this.priceHistoryRepo.findByProductId(
      id,
      query.limit,
      query.offset,
      query.dateFrom,
      query.dateTo,
    );
  }

  private async findOwnedProduct(id: string, userId: string) {
    const product = await this.productRepo.findByIdAndUserId(id, userId);
    if (!product) {
      throw new NotFoundException(`Product ${id} not found`);
    }
    return product;
  }

  private async computePriceChange(productId: string): Promise<number | null> {
    const [latest, previous] = await this.priceHistoryRepo.findTwoMostRecent(productId);
    if (!latest || !previous) return null;

    const latestPrice = Number(latest.price);
    const previousPrice = Number(previous.price);
    if (previousPrice === 0) return null;

    return ((latestPrice - previousPrice) / previousPrice) * 100;
  }
}
