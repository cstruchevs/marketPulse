import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PriceHistory } from './price-history.entity';

export interface PriceStats {
  min: number;
  max: number;
  avg: number;
  count: number;
}

const DEFAULT_LOOKBACK_DAYS = 90;

@Injectable()
export class PriceHistoryRepository {
  constructor(
    @InjectRepository(PriceHistory)
    private readonly repo: Repository<PriceHistory>,
  ) {}

  // Always include scraped_at in WHERE for PostgreSQL partition pruning
  findByProductId(
    productId: string,
    limit = 100,
    offset = 0,
    dateFrom?: Date,
    dateTo?: Date,
  ): Promise<PriceHistory[]> {
    const from = dateFrom ?? this.daysAgo(DEFAULT_LOOKBACK_DAYS);
    const to = dateTo ?? new Date();

    return this.repo
      .createQueryBuilder('ph')
      .select(['ph.id', 'ph.price', 'ph.currency', 'ph.scrapedAt'])
      .where('ph.productId = :productId', { productId })
      .andWhere('ph.scrapedAt >= :from', { from })
      .andWhere('ph.scrapedAt <= :to', { to })
      .orderBy('ph.scrapedAt', 'DESC')
      .limit(limit)
      .offset(offset)
      .getMany();
  }

  findLatestPrice(productId: string): Promise<PriceHistory | null> {
    return this.repo
      .createQueryBuilder('ph')
      .where('ph.productId = :productId', { productId })
      .andWhere('ph.scrapedAt >= :from', { from: this.daysAgo(DEFAULT_LOOKBACK_DAYS) })
      .orderBy('ph.scrapedAt', 'DESC')
      .limit(1)
      .getOne();
  }

  // Returns 2 most recent entries — used to compute priceChange %
  findTwoMostRecent(productId: string): Promise<PriceHistory[]> {
    return this.repo
      .createQueryBuilder('ph')
      .select(['ph.id', 'ph.price', 'ph.scrapedAt'])
      .where('ph.productId = :productId', { productId })
      .andWhere('ph.scrapedAt >= :from', { from: this.daysAgo(DEFAULT_LOOKBACK_DAYS) })
      .orderBy('ph.scrapedAt', 'DESC')
      .limit(2)
      .getMany();
  }

  // Use a Read Replica connection for analytics queries in production
  async findPriceStats(productId: string, days: number): Promise<PriceStats | null> {
    const result = await this.repo
      .createQueryBuilder('ph')
      .select('MIN(ph.price)', 'min')
      .addSelect('MAX(ph.price)', 'max')
      .addSelect('AVG(ph.price)', 'avg')
      .addSelect('COUNT(ph.id)', 'count')
      .where('ph.productId = :productId', { productId })
      .andWhere('ph.scrapedAt >= :from', { from: this.daysAgo(days) })
      .getRawOne<{ min: string; max: string; avg: string; count: string }>();

    if (!result || result.count === '0') return null;

    return {
      min: Number(result.min),
      max: Number(result.max),
      avg: Math.round(Number(result.avg) * 100) / 100,
      count: Number(result.count),
    };
  }

  save(entry: Partial<PriceHistory>): Promise<PriceHistory> {
    return this.repo.save(this.repo.create(entry));
  }

  private daysAgo(days: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d;
  }
}
