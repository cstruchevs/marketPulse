import { Module } from '@nestjs/common';
import { SseService } from './sse.service';
import { SseController } from './sse.controller';
import { redisProvider } from '../config/redis.provider';

@Module({
  controllers: [SseController],
  providers: [SseService, redisProvider],
  exports: [SseService],
})
export class SseModule {}
