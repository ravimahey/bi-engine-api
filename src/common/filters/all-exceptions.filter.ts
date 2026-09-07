import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Request, Response } from 'express';
import { EntityNotFoundError, QueryFailedError, TypeORMError } from 'typeorm';
import { PG_ERROR_CODES, REQUEST_ID_HEADER } from '../constants/app.constants';
import type { ErrorResponse } from '../interfaces/api-response.interface';

/** Numeric copy of the enum member so status comparisons stay type-safe. */
const SERVER_ERROR_THRESHOLD: number = HttpStatus.INTERNAL_SERVER_ERROR;

interface NormalizedError {
  status: number;
  message: string;
  error: string;
  details?: Record<string, string[]> | string[];
}

interface DriverError extends Error {
  code?: string;
  detail?: string;
  constraint?: string;
  column?: string;
  table?: string;
}

/**
 * Single global catch-all. Every error leaving the app — thrown HttpException,
 * TypeORM failure, or an unexpected crash — exits through here as one JSON shape.
 * Registered in AppModule via APP_FILTER so it also covers guards/interceptors.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly isProduction: boolean,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const normalized = this.normalize(exception);
    const requestId = request.headers?.[REQUEST_ID_HEADER] as
      string | undefined;

    const body: ErrorResponse = {
      success: false,
      statusCode: normalized.status,
      message: normalized.message,
      error: normalized.error,
      ...(normalized.details ? { details: normalized.details } : {}),
      timestamp: new Date().toISOString(),
      path:
        (httpAdapter.getRequestUrl(request) as string | undefined) ??
        request.url,
      ...(requestId ? { requestId } : {}),
      // Stack traces are a leak in production; keep them for local debugging only.
      ...(!this.isProduction && exception instanceof Error
        ? { stack: exception.stack }
        : {}),
    };

    this.log(exception, body, request);
    httpAdapter.reply(response, body, normalized.status);
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof HttpException)
      return this.fromHttpException(exception);
    if (exception instanceof QueryFailedError)
      return this.fromQueryFailed(
        exception.driverError as DriverError,
        exception.message,
      );
    if (exception instanceof EntityNotFoundError) {
      return {
        status: HttpStatus.NOT_FOUND,
        message: 'The requested resource was not found',
        error: 'Not Found',
      };
    }
    if (exception instanceof TypeORMError) {
      return {
        status: HttpStatus.INTERNAL_SERVER_ERROR,
        message: this.isProduction
          ? 'A database error occurred'
          : exception.message,
        error: 'Database Error',
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message:
        this.isProduction || !(exception instanceof Error)
          ? 'Internal server error'
          : exception.message,
      error: 'Internal Server Error',
    };
  }

  private fromHttpException(exception: HttpException): NormalizedError {
    const status = exception.getStatus();
    const payload = exception.getResponse();

    if (typeof payload === 'string') {
      return { status, message: payload, error: exception.name };
    }

    const record = payload as Record<string, unknown>;
    const rawMessage = record.message;

    // ValidationPipe hands us `message: string[]`; our custom exception factory
    // upgrades that to a field-keyed `details` map (see validation-exception.factory).
    const details = (record.details ??
      (Array.isArray(rawMessage) ? rawMessage : undefined)) as
      Record<string, string[]> | string[] | undefined;

    const message = Array.isArray(rawMessage)
      ? 'Validation failed'
      : ((rawMessage as string) ?? exception.message);

    return {
      status,
      message,
      error: (record.error as string) ?? exception.name,
      details,
    };
  }

  private fromQueryFailed(
    driverError: DriverError,
    rawMessage: string,
  ): NormalizedError {
    switch (driverError?.code) {
      case PG_ERROR_CODES.UNIQUE_VIOLATION:
        return {
          status: HttpStatus.CONFLICT,
          message: 'A record with these values already exists',
          error: 'Conflict',
          details: driverError.constraint
            ? [driverError.constraint]
            : undefined,
        };
      case PG_ERROR_CODES.FOREIGN_KEY_VIOLATION:
        return {
          status: HttpStatus.CONFLICT,
          message: 'Operation violates a relation constraint',
          error: 'Conflict',
        };
      case PG_ERROR_CODES.NOT_NULL_VIOLATION:
        return {
          status: HttpStatus.BAD_REQUEST,
          message: `Field "${driverError.column ?? 'unknown'}" is required`,
          error: 'Bad Request',
        };
      case PG_ERROR_CODES.CHECK_VIOLATION:
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'A value failed a database check constraint',
          error: 'Bad Request',
        };
      case PG_ERROR_CODES.INVALID_TEXT_REPRESENTATION:
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Malformed value supplied for one of the fields',
          error: 'Bad Request',
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: this.isProduction ? 'A database error occurred' : rawMessage,
          error: 'Database Error',
        };
    }
  }

  private log(exception: unknown, body: ErrorResponse, request: Request): void {
    const context = `${request.method} ${body.path}${body.requestId ? ` [${body.requestId}]` : ''}`;

    if (body.statusCode >= SERVER_ERROR_THRESHOLD) {
      this.logger.error(
        `${context} -> ${body.statusCode} ${body.message}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      return;
    }

    this.logger.warn(`${context} -> ${body.statusCode} ${body.message}`);
  }
}
