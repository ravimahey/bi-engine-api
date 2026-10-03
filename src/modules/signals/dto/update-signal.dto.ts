import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { USER_SETTABLE_SIGNAL_STATUSES } from '../constants';
import { SignalStatus } from '../entities';

/** A user can mark a signal read or dismiss it — never set it back to unread or edit its content. */
export class UpdateSignalDto {
  @ApiProperty({ enum: USER_SETTABLE_SIGNAL_STATUSES })
  @IsIn(USER_SETTABLE_SIGNAL_STATUSES, {
    message: `status must be one of: ${USER_SETTABLE_SIGNAL_STATUSES.join(', ')}`,
  })
  status: SignalStatus.READ | SignalStatus.DISMISSED;
}
