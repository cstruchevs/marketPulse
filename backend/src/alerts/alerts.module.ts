import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertEvent } from './alert-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AlertEvent])],
  exports: [TypeOrmModule],
})
export class AlertsModule {}
