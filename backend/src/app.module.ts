import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { getDatabaseConfig } from './config/database.config';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProductsModule } from './products/products.module';
import { PriceHistoryModule } from './price-history/price-history.module';
import { AlertsModule } from './alerts/alerts.module';
import { ScraperModule } from './scraper/scraper.module';

@Module({
  imports: [
    // Config — load .env globally
    ConfigModule.forRoot({ isGlobal: true }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: getDatabaseConfig,
    }),

    // Rate limiting — global ThrottlerGuard in providers below
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 60 }]),

    // Feature modules
    AuthModule,
    UsersModule,
    ProductsModule,
    PriceHistoryModule,
    AlertsModule,
    ScraperModule,
    // ScraperApiModule — Step 7
    // WorkersModule    — Step 8
    // SseModule        — Step 9
    // McpModule        — Step 10
    // StorageModule    — Step 11
    // ExportModule     — (Step 12)
  ],
  controllers: [AppController],
  providers: [
    // Apply ThrottlerGuard globally; individual routes use @Throttle() to override
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
