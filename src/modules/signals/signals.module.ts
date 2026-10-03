import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Signal } from './entities';
import { SignalsFeedService, SignalsService } from './services';
import { SignalsController } from './signals.controller';

/**
 * Signals — the attention inbox. It points at things that happened in other
 * modules and owns only the notification state (unread/read/dismissed); it
 * never recomputes or copies what Commerce, the BI engine or Integrations
 * already own.
 *
 * Dependency direction: producers import this module and call the exported
 * `SignalsService` when their own state changes. This module imports no
 * producer back, so it can never grow into a second Commerce or BI engine.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Signal])],
  controllers: [SignalsController],
  providers: [SignalsService, SignalsFeedService],
  exports: [SignalsService],
})
export class SignalsModule {}
