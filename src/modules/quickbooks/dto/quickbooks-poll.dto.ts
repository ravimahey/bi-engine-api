import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsUUID,
  registerDecorator,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidationOptions,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { QUICKBOOKS_POLL_ENTITY_ORDER } from '../constants';
import type { QuickbooksPollEntity } from '../constants';

@ValidatorConstraint({ name: 'IsOnOrAfterDate', async: false })
class IsOnOrAfterDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const [relatedProperty] = args.constraints as [string];
    const relatedValue = (args.object as Record<string, unknown>)[
      relatedProperty
    ];
    // Only enforce ordering once both sides look like dates — malformed
    // input is already reported by each field's own `@IsDateString`.
    if (typeof value !== 'string' || typeof relatedValue !== 'string') {
      return true;
    }
    return new Date(value) >= new Date(relatedValue);
  }

  defaultMessage(args: ValidationArguments): string {
    const [relatedProperty] = args.constraints as [string];
    return `${args.property} must not be before ${relatedProperty}`;
  }
}

/** Cross-field check: the decorated property must be on/after `property`. */
function IsOnOrAfterDate(
  property: string,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [property],
      validator: IsOnOrAfterDateConstraint,
    });
  };
}

/** Request body for `POST /quickbooks/poll` — triggers a historical/date-range sync. */
export class QuickbooksPollDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'Organization to sync — resolves the ProviderConnection to poll',
  })
  @IsUUID('4')
  organizationId: string;

  @ApiProperty({
    example: '2026-01-05',
    description: 'Inclusive start of the requested range (YYYY-MM-DD)',
  })
  @IsDateString()
  fromDate: string;

  @ApiProperty({
    example: '2026-09-13',
    description: 'Inclusive end of the requested range (YYYY-MM-DD)',
  })
  @IsDateString()
  @IsOnOrAfterDate('fromDate', {
    message: 'toDate must not be before fromDate',
  })
  toDate: string;

  @ApiPropertyOptional({
    enum: QUICKBOOKS_POLL_ENTITY_ORDER,
    isArray: true,
    description:
      'Restrict the poll to these entities (default: every supported entity, in dependency order)',
  })
  @IsOptional()
  @IsArray()
  @IsIn(QUICKBOOKS_POLL_ENTITY_ORDER, { each: true })
  entities?: QuickbooksPollEntity[];
}
