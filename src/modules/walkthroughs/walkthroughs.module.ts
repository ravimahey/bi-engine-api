import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserWalkthrough } from './entities';
import { WalkthroughsService } from './services';
import { WalkthroughsController } from './walkthroughs.controller';

/**
 * Stores each user's progress through the frontend's role-based guided
 * tours (onboarding + per-page tours). The tours themselves — steps,
 * targets, copy — live entirely in the frontend; this module only
 * remembers who has seen/finished/skipped what.
 */
@Module({
  imports: [TypeOrmModule.forFeature([UserWalkthrough])],
  controllers: [WalkthroughsController],
  providers: [WalkthroughsService],
})
export class WalkthroughsModule {}
