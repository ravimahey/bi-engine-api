import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';
import {
  WALKTHROUGH_TOUR_KEY_MAX_LENGTH,
  WALKTHROUGH_TOUR_KEY_PATTERN,
} from '../constants';

/** `:tourKey` path param — e.g. `onboarding:buyer` or `page:insights-overview`. */
export class TourKeyParamDto {
  @ApiProperty({ example: 'onboarding:supplier' })
  @IsString()
  @MaxLength(WALKTHROUGH_TOUR_KEY_MAX_LENGTH)
  @Matches(WALKTHROUGH_TOUR_KEY_PATTERN, {
    message:
      'tourKey may only contain lowercase letters, digits, ":", "_" and "-"',
  })
  tourKey: string;
}
