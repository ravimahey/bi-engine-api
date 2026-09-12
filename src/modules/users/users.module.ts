import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities';
import {
  PasswordService,
  UserCredentialsService,
  UsersService,
} from './services';
import { UsersController } from './users.controller';

@Module({
  // forFeature registers the repository AND (with autoLoadEntities) the entity.
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UsersController],
  providers: [UsersService, PasswordService, UserCredentialsService],
  // Exported so sibling modules (e.g. auth) can inject these.
  exports: [UsersService, PasswordService, UserCredentialsService],
})
export class UsersModule {}
