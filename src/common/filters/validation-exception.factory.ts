import { BadRequestException } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

/**
 * Turns class-validator's nested error tree into a flat `{ field: [messages] }`
 * map so clients can bind errors to inputs instead of parsing strings.
 */
const flatten = (
  errors: ValidationError[],
  parentPath = '',
  acc: Record<string, string[]> = {},
): Record<string, string[]> => {
  for (const error of errors) {
    const path = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;

    if (error.constraints) {
      acc[path] = [...(acc[path] ?? []), ...Object.values(error.constraints)];
    }

    if (error.children?.length) {
      flatten(error.children, path, acc);
    }
  }

  return acc;
};

export const validationExceptionFactory = (errors: ValidationError[]) =>
  new BadRequestException({
    statusCode: 400,
    message: 'Validation failed',
    error: 'Bad Request',
    details: flatten(errors),
  });
