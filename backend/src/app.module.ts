import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { getDatabaseConfig } from './config/database.config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProductsModule } from './products/products.module';
import { PriceHistoryModule } from './price-history/price-history.module';
import { AlertsModule } from './alerts/alerts.module';
import { ScraperModule } from './scraper/scraper.module';
import { WorkersModule } from './workers/workers.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getDatabaseConfig,
    }),

    // BullMQ root — connects to Redis once, shared by all queues
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          url: config.getOrThrow<string>('REDIS_URL'),
          maxRetriesPerRequest: null,
        },
      }),
    }),

    // Cron jobs (@Cron decorator)
    ScheduleModule.forRoot(),

    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }]),

    AuthModule,
    UsersModule,
    ProductsModule,
    PriceHistoryModule,
    AlertsModule,
    ScraperModule,
    WorkersModule,
    // SseModule  — Step 9
    // McpModule  — Step 10
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
