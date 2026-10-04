import { BadRequestException } from '@nestjs/common';
import { OrganizationProfileService } from './organization-profile.service';

describe('OrganizationProfileService', () => {
  const service = new OrganizationProfileService();

  const validAu = {
    country: 'AU',
    region: 'VIC',
    streetAddress: '12 Collins St',
    city: 'Melbourne',
    postcode: '3000',
    timezone: 'Australia/Sydney',
    businessNumber: '12 345 678 901',
  };

  it('accepts a consistent Australian profile', () => {
    expect(service.collectErrors(validAu)).toEqual({});
    expect(() => service.assertValid(validAu)).not.toThrow();
  });

  it('accepts an empty profile (admin-created, name-only organization)', () => {
    expect(service.collectErrors({})).toEqual({});
  });

  it('requires a country once any address detail is given', () => {
    expect(service.collectErrors({ postcode: '3000' })).toEqual({
      country: [expect.stringContaining('country is required')],
    });
  });

  it('rejects a region outside the country list', () => {
    const errors = service.collectErrors({ ...validAu, region: 'XX' });
    expect(Object.keys(errors)).toEqual(['region']);
  });

  it('rejects a time zone belonging to another country', () => {
    const errors = service.collectErrors({
      ...validAu,
      timezone: 'Asia/Kolkata',
    });
    expect(Object.keys(errors)).toEqual(['timezone']);
  });

  it('applies the postcode format of the selected country', () => {
    expect(service.collectErrors({ ...validAu, postcode: '411001' })).toEqual({
      postcode: [expect.stringContaining('AU postcode')],
    });
    expect(
      service.collectErrors({
        country: 'IN',
        region: 'Maharashtra',
        postcode: '411001',
        timezone: 'Asia/Kolkata',
      }),
    ).toEqual({});
  });

  it('validates ABN/ACN only for Australia', () => {
    expect(
      Object.keys(service.collectErrors({ ...validAu, businessNumber: '123' })),
    ).toEqual(['businessNumber']);
    expect(
      service.collectErrors({
        country: 'IN',
        businessNumber: '27AAAPL1234C1ZV',
      }),
    ).toEqual({});
  });

  it('throws the validation-pipe envelope with field details', () => {
    expect.assertions(2);
    try {
      service.assertValid({ ...validAu, postcode: 'abc' });
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        statusCode: 400,
        details: { postcode: [expect.any(String)] },
      });
    }
  });
});
