import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from '../products/product.entity';

// This entity maps to a PostgreSQL table partitioned by scraped_at (RANGE partitioning).
// Always include scraped_at in WHERE clauses for partition pruning.
// The actual PK in the DB is (id, scraped_at) — managed via migration, not synchronize.
@Entity('price_history')
export class PriceHistory {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: number;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @ManyToOne(() => Product, (p) => p.priceHistory, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  price: number;

  @Column({ length: 3 })
  currency: string;

  @Column({ name: 'scraped_at', type: 'timestamptz' })
  scrapedAt: Date;

  @Column({ name: 'raw_data_s3_key', type: 'text', nullable: true })
  rawDataS3Key: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
