import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RefreshToken } from '../auth/refresh-token.entity';

export interface UserSettings {
  scrapeInterval: number;
  emailAlerts: boolean;
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255, unique: true })
  email: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ length: 100, nullable: true })
  name: string;

  @Column({
    type: 'jsonb',
    default: () => `'{"scrapeInterval": 60, "emailAlerts": false}'`,
  })
  settings: UserSettings;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => RefreshToken, (rt) => rt.user, { cascade: ['remove'] })
  refreshTokens: RefreshToken[];
}
