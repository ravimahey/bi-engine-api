import { SetMetadata } from '@nestjs/common';
import { RESPONSE_MESSAGE_KEY } from '../constants/app.constants';

/**
 * Overrides the default success message in the response envelope:
 * `@ResponseMessage('User created successfully')`
 */
export const ResponseMessage = (message: string) =>
  SetMetadata(RESPONSE_MESSAGE_KEY, message);
