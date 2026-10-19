import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SignalsModule } from '@modules/signals/signals.module';
import {
  Quote,
  CommerceOrder,
  CommerceInvoice,
  CommercePayment,
} from './entities';
import {
  QuotesService,
  OrdersService,
  InvoicesService,
} from './services';
import { QuotesController } from './quotes.controller';
import { OrdersController } from './orders.controller';
import { InvoicesController } from './invoices.controller';
import { PaymentsController } from './payments.controller';
import { CommerceController } from './commerce.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Quote,
      CommerceOrder,
      CommerceInvoice,
      CommercePayment,
    ]),
    SignalsModule,
  ],
  controllers: [
    QuotesController,
    OrdersController,
    InvoicesController,
    PaymentsController,
    CommerceController,
  ],
  providers: [
    QuotesService,
    OrdersService,
    InvoicesService,
  ],
  exports: [
    QuotesService,
    OrdersService,
    InvoicesService,
  ],
})
export class CommerceModule {}
