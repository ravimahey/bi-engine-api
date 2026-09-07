import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { REQUEST_ID_HEADER } from '../constants/app.constants';

/** Correlation id for the current request, useful for logging inside services. */
export const RequestId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return (request.headers[REQUEST_ID_HEADER] as string) ?? '';
  },
);
