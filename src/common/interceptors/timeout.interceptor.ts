import {
  CallHandler,
  ExecutionContext,
  Injectable,
  RequestTimeoutException,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  catchError,
  throwError,
  timeout,
  TimeoutError,
  type Observable,
} from 'rxjs';
import { REQUEST_TIMEOUT_KEY } from '../constants/app.constants';

/**
 * Fails slow handlers with 408 instead of letting sockets hang. Routes can
 * raise their own limit with `@RequestTimeout(ms)`.
 */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly timeoutMs: number,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const timeoutMs =
      this.reflector.getAllAndOverride<number | undefined>(
        REQUEST_TIMEOUT_KEY,
        [context.getHandler(), context.getClass()],
      ) ?? this.timeoutMs;

    return next.handle().pipe(
      timeout(timeoutMs),
      catchError((error: unknown) =>
        throwError(() =>
          error instanceof TimeoutError
            ? new RequestTimeoutException('Request took too long to process')
            : error,
        ),
      ),
    );
  }
}
