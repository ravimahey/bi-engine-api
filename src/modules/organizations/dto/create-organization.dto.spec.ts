import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { validationExceptionFactory } from '@common/filters';
import { CreateOrganizationDto } from './create-organization.dto';
import { UpdateOrganizationDto } from './update-organization.dto';

/** Same options as the global pipe in `app.module.ts`. */
const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: {
    enableImplicitConversion: false,
    exposeDefaultValues: true,
  },
  stopAtFirstError: false,
  exceptionFactory: validationExceptionFactory,
});

const validate = (body: unknown) =>
  pipe.transform(body, { type: 'body', metatype: CreateOrganizationDto });

/** Exactly what the frontend onboarding wizard sends (`toCreateOrganizationPayload`). */
const wizardPayload = {
  name: '  Green Chili ',
  tradingName: null,
  businessNumber: '12 345 678 901',
  country: 'AU',
  region: 'VIC',
  streetAddress: '12 Collins St',
  city: 'Melbourne',
  postcode: '3000',
  timezone: 'Australia/Sydney',
  businessTypes: ['restaurant', 'cafe'],
  locationCount: '2-5',
  monthlyVolume: '50k-250k',
  goals: ['reduce-costs'],
  integrations: ['xero'],
};

const detailsOf = async (body: unknown) => {
  try {
    await validate(body);
  } catch (error) {
    const response = (error as BadRequestException).getResponse();
    return (response as { details: Record<string, string[]> }).details;
  }
  throw new Error('expected validation to fail');
};

describe('CreateOrganizationDto (global ValidationPipe)', () => {
  it('accepts the onboarding wizard payload without a slug', async () => {
    const dto = (await validate(wizardPayload)) as CreateOrganizationDto;
    expect(dto.name).toBe('Green Chili');
    expect(dto.slug).toBeUndefined();
    expect(dto.businessTypes).toEqual(['restaurant', 'cafe']);
  });

  it('still accepts a bare name-only organization', async () => {
    await expect(validate({ name: 'Admin Org' })).resolves.toBeDefined();
  });

  it('rejects option values the UI never offers', async () => {
    const details = await detailsOf({
      ...wizardPayload,
      businessTypes: ['spaceship'],
      locationCount: '1000',
      integrations: ['myob'],
      country: 'FR',
    });
    expect(Object.keys(details).sort()).toEqual([
      'businessTypes',
      'country',
      'integrations',
      'locationCount',
    ]);
  });

  it('does not inject isActive into a partial update', async () => {
    const dto = (await pipe.transform(
      { name: 'Renamed' },
      { type: 'body', metatype: UpdateOrganizationDto },
    )) as UpdateOrganizationDto;
    expect(dto).not.toHaveProperty('isActive');
  });

  it('rejects unknown keys (forbidNonWhitelisted)', async () => {
    const details = await detailsOf({ ...wizardPayload, suburb: 'Melbourne' });
    expect(Object.keys(details)).toEqual(['suburb']);
  });
});
