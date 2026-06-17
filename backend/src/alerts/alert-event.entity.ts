import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from '../products/product.entity';
import { User } from '../users/user.entity';

export enum AlertType {
  PRICE_DROP = 'price_drop',
  PRICE_SPIKE = 'price_spike',
  ERROR = 'error',
}

@Entity('alert_events')
export class AlertEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'enum', enum: AlertType })
  type: AlertType;

  @Column({ name: 'old_price', type: 'decimal', precision: 12, scale: 2 })
  oldPrice: number;

  @Column({ name: 'new_price', type: 'decimal', precision: 12, scale: 2 })
  newPrice: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  threshold: number;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
