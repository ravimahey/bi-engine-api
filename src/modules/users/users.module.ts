import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  // forFeature registers the repository AND (with autoLoadEntities) the entity.
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UsersController],
  providers: [UsersService],
  // Exported so sibling modules (e.g. auth) can inject UsersService.
  exports: [UsersService],
})
export class UsersModule {}
