import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ExpenseTransaction,
  ExpenseTransactionLine,
  Item,
  Vendor,
} from '@modules/records/entities';
import { Signal } from './entities';
import {
  SignalsFeedService,
  SignalsService,
  SupplierPriceIncreaseService,
} from './services';
import { SignalsController } from './signals.controller';

/**
 * Signals — the attention inbox and supplier price increase resolution workflow.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Signal,
      ExpenseTransaction,
      ExpenseTransactionLine,
      Item,
      Vendor,
    ]),
  ],
  controllers: [SignalsController],
  providers: [SignalsService, SignalsFeedService, SupplierPriceIncreaseService],
  exports: [SignalsService, SupplierPriceIncreaseService],
})
export class SignalsModule {}
