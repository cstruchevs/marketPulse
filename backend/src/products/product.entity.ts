import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
import { PriceHistory } from '../price-history/price-history.entity';

export enum ProductStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  ERROR = 'error',
}

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'text' })
  url: string;

  @Column({ length: 500, nullable: true })
  name: string;

  @Column({ name: 'image_url', type: 'text', nullable: true })
  imageUrl: string;

  @Column({ name: 'current_price', type: 'decimal', precision: 12, scale: 2, nullable: true })
  currentPrice: number;

  @Column({ length: 3, default: 'USD' })
  currency: string;

  @Column({ type: 'enum', enum: ProductStatus, default: ProductStatus.ACTIVE })
  status: ProductStatus;

  @Column({
    name: 'alert_threshold',
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  alertThreshold: number;

  @Column({ name: 'alert_enabled', default: false })
  alertEnabled: boolean;

  @Column({ name: 'last_scraped_at', type: 'timestamptz', nullable: true })
  lastScrapedAt: Date;

  @Column({ name: 'next_scrape_at', type: 'timestamptz', nullable: true })
  nextScrapeAt: Date;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string;

  @Column({ name: 'scrapes_count', default: 0 })
  scrapesCount: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => PriceHistory, (ph) => ph.product)
  priceHistory: PriceHistory[];
}
