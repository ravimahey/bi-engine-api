import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { tap, type Observable } from 'rxjs';
import { REQUEST_ID_HEADER } from '../constants/app.constants';

/**
 * Assigns/propagates a request id and logs method, path, status and duration.
 * The id is echoed on the response header so clients can quote it in bug reports.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const requestId =
      (request.headers[REQUEST_ID_HEADER] as string) ?? randomUUID();
    request.headers[REQUEST_ID_HEADER] = requestId;
    response.setHeader(REQUEST_ID_HEADER, requestId);

    const { method, url } = request;
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () =>
          this.logger.log(
            `${method} ${url} ${response.statusCode} +${Date.now() - startedAt}ms [${requestId}]`,
          ),
        // Failures are logged with full context by AllExceptionsFilter.
        error: () => undefined,
      }),
    );
  }
}
