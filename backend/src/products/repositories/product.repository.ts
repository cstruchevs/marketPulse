import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product, ProductStatus } from '../product.entity';

@Injectable()
export class ProductRepository {
  constructor(
    @InjectRepository(Product)
    private readonly repo: Repository<Product>,
  ) {}

  // For internal workers only — skips user ownership check
  findById(id: string): Promise<Product | null> {
    return this.repo.findOne({ where: { id } });
  }

  // BOLA guard — always filter by userId so one user can't access another's products
  findByIdAndUserId(id: string, userId: string): Promise<Product | null> {
    return this.repo.findOne({ where: { id, userId } });
  }

  findByUserId(userId: string): Promise<Product[]> {
    return this.repo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  // Uses partial index idx_products_next_scrape (WHERE status = 'active')
  findDueForScraping(): Promise<Product[]> {
    return this.repo
      .createQueryBuilder('p')
      .where('p.nextScrapeAt <= :now', { now: new Date() })
      .andWhere('p.status = :status', { status: ProductStatus.ACTIVE })
      .getMany();
  }

  async updateAfterScrape(
    id: string,
    price: number,
    status: ProductStatus,
    nextScrapeAt: Date,
    errorMessage?: string,
  ): Promise<void> {
    await this.repo.update(id, {
      currentPrice: price,
      status,
      lastScrapedAt: new Date(),
      nextScrapeAt,
      // null clears the column; TypeORM's DeepPartial doesn't include null in typings but accepts it at runtime
      errorMessage: (errorMessage ?? null) as string,
      ...(status === ProductStatus.ACTIVE && { scrapesCount: () => '"scrapes_count" + 1' }),
    });
  }

  save(product: Product): Promise<Product> {
    return this.repo.save(product);
  }

  create(data: Partial<Product>): Product {
    return this.repo.create(data);
  }

  async remove(product: Product): Promise<void> {
    await this.repo.remove(product);
  }
}
