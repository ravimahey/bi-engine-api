import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuickbooksConnection } from './entities';
import { QuickbooksController } from './quickbooks.controller';
import { QuickbooksAuthService, QuickbooksService } from './services';

@Module({
  imports: [TypeOrmModule.forFeature([QuickbooksConnection])],
  controllers: [QuickbooksController],
  providers: [QuickbooksAuthService, QuickbooksService],
})
export class QuickbooksModule {}
