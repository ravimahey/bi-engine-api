import { BadRequestException, Injectable } from '@nestjs/common';
import { COUNTRY_RULES, isCountryCode, type CountryRule } from '../constants';
import type { OrganizationProfileValues } from '../types';

/** Fields that only make sense once a country is known. */
const COUNTRY_DEPENDENT_FIELDS = [
  'region',
  'streetAddress',
  'city',
  'postcode',
  'timezone',
  'businessNumber',
] as const satisfies readonly (keyof OrganizationProfileValues)[];

/**
 * Cross-field rules for an organization's business profile that a DTO
 * decorator can't express on its own: the region list, postcode format,
 * time zone and business-number format all depend on `country`. Errors use
 * the same `{ field: [messages] }` envelope as the global validation pipe,
 * so clients bind them to inputs the same way.
 */
@Injectable()
export class OrganizationProfileService {
  /** Throws a 400 with field-level details when the profile is inconsistent. */
  assertValid(values: OrganizationProfileValues): void {
    const details = this.collectErrors(values);
    if (Object.keys(details).length > 0) {
      throw new BadRequestException({
        statusCode: 400,
        message: 'Validation failed',
        error: 'Bad Request',
        details,
      });
    }
  }

  collectErrors(values: OrganizationProfileValues): Record<string, string[]> {
    const errors: Record<string, string[]> = {};
    const add = (field: string, message: string) => {
      errors[field] = [...(errors[field] ?? []), message];
    };

    const { country } = values;
    if (!country) {
      const needsCountry = COUNTRY_DEPENDENT_FIELDS.some(
        (field) => !!values[field],
      );
      if (needsCountry) {
        add(
          'country',
          'country is required when address or business number details are provided',
        );
      }
      return errors;
    }
    if (!isCountryCode(country)) {
      add('country', `country "${country}" is not supported`);
      return errors;
    }

    const rule: CountryRule = COUNTRY_RULES[country];
    const { region, postcode, timezone, businessNumber } = values;

    if (region && rule.regions && !rule.regions.includes(region)) {
      add('region', `region must be one of: ${rule.regions.join(', ')}`);
    }
    if (timezone && !rule.timezones.includes(timezone)) {
      add('timezone', `timezone must be one of: ${rule.timezones.join(', ')}`);
    }
    if (postcode && !rule.postcode.test(postcode)) {
      add(
        'postcode',
        `postcode must be a valid ${country} postcode (e.g. ${rule.postcodeExample})`,
      );
    }
    if (
      businessNumber &&
      rule.businessNumber &&
      !rule.businessNumber.test(businessNumber.replace(/\s/g, ''))
    ) {
      add('businessNumber', `businessNumber ${rule.businessNumberMessage}`);
    }

    return errors;
  }
}
