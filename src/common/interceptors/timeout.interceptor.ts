import {
  CallHandler,
  ExecutionContext,
  Injectable,
  RequestTimeoutException,
  type NestInterceptor,
} from '@nestjs/common';
import {
  catchError,
  throwError,
  timeout,
  TimeoutError,
  type Observable,
} from 'rxjs';

/** Fails slow handlers with 408 instead of letting sockets hang. */
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(private readonly timeoutMs: number) {}

  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      timeout(this.timeoutMs),
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
