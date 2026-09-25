import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { WALKTHROUGH_MAX_STEP } from '../constants';
import { WalkthroughStatus } from '../entities';

export class UpdateWalkthroughDto {
  @ApiProperty({ enum: WalkthroughStatus })
  @IsEnum(WalkthroughStatus, {
    message: `status must be one of: ${Object.values(WalkthroughStatus).join(', ')}`,
  })
  status: WalkthroughStatus;

  /** Zero-based index of the step the user is on (or finished on). Defaults to 0. */
  @ApiProperty({ required: false, minimum: 0, example: 4 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(WALKTHROUGH_MAX_STEP)
  currentStep?: number;
}
