import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { map, type Observable } from 'rxjs';
import {
  RESPONSE_MESSAGE_KEY,
  REQUEST_ID_HEADER,
} from '../constants/app.constants';
import {
  isPaginated,
  type SuccessResponse,
} from '../types/api-response.interface';

/**
 * Wraps every successful handler return value in the standard envelope, so
 * controllers stay free to return plain entities/DTOs.
 * Paginated services return `{ items, meta }` — meta is hoisted next to data.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  SuccessResponse<unknown>
> {
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<SuccessResponse<unknown>> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const message =
      this.reflector.getAllAndOverride<string>(RESPONSE_MESSAGE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 'Success';

    return next.handle().pipe(
      map((payload) => {
        const statusCode = response.statusCode ?? HttpStatus.OK;
        const requestId = request.headers?.[REQUEST_ID_HEADER] as
          string | undefined;

        const base = {
          success: true as const,
          statusCode,
          message,
          timestamp: new Date().toISOString(),
          path: request.url,
          ...(requestId ? { requestId } : {}),
        };

        return isPaginated(payload)
          ? { ...base, data: payload.items, meta: payload.meta }
          : { ...base, data: payload ?? null };
      }),
    );
  }
}
