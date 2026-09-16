import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Test = 'test',
  Staging = 'staging',
  Production = 'production',
}

export enum QuickbooksEnvironment {
  Sandbox = 'sandbox',
  Production = 'production',
}

const toBoolean = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string')
      return ['true', '1', 'yes'].includes(value.toLowerCase());
    return value;
  });

/**
 * Single source of truth for every environment variable the app consumes.
 * Validated once at boot — the process refuses to start on a bad/missing value
 * instead of failing later at runtime.
 */
export class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  @Transform(({ value }: { value: unknown }) => parseInt(value as string, 10))
  PORT: number = 3000;

  @IsString()
  @IsOptional()
  API_PREFIX: string = 'api';

  @IsString()
  @IsOptional()
  CORS_ORIGINS: string = '*';

  // ---------------------------------------------------------------- database
  @IsString()
  DB_HOST: string;

  @IsInt()
  @Min(1)
  @Max(65535)
  @Transform(({ value }: { value: unknown }) => parseInt(value as string, 10))
  DB_PORT: number = 5432;

  @IsString()
  DB_USERNAME: string;

  @IsString()
  DB_PASSWORD: string;

  @IsString()
  DB_NAME: string;

  @IsString()
  @IsOptional()
  DB_SCHEMA: string = 'public';

  @IsBoolean()
  @IsOptional()
  @toBoolean()
  DB_SYNCHRONIZE: boolean = false;

  @IsBoolean()
  @IsOptional()
  @toBoolean()
  DB_LOGGING: boolean = false;

  @IsBoolean()
  @IsOptional()
  @toBoolean()
  DB_SSL: boolean = false;

  @IsBoolean()
  @IsOptional()
  @toBoolean()
  DB_RUN_MIGRATIONS: boolean = false;

  @IsInt()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseInt(value as string, 10))
  DB_POOL_SIZE: number = 10;

  // ------------------------------------------------------------------- misc
  @IsString()
  @IsOptional()
  @MinLength(1)
  SWAGGER_PATH: string = 'docs';

  @IsBoolean()
  @IsOptional()
  @toBoolean()
  SWAGGER_ENABLED: boolean = true;

  @IsInt()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseInt(value as string, 10))
  THROTTLE_TTL: number = 60000;

  @IsInt()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseInt(value as string, 10))
  THROTTLE_LIMIT: number = 100;

  // ------------------------------------------------------------------- auth
  @IsString()
  JWT_ACCESS_SECRET: string;

  @IsString()
  JWT_REFRESH_SECRET: string;

  @IsString()
  @IsOptional()
  JWT_ACCESS_EXPIRES_IN: string = '15m';

  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRES_IN: string = '7d';

  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_ID: string = 'mock-client-id';

  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_SECRET: string = 'mock-client-secret';

  @IsString()
  @IsOptional()
  GOOGLE_CALLBACK_URL: string =
    'http://localhost:3000/api/v1/auth/google/callback';

  @IsString()
  @IsOptional()
  FRONTEND_URL: string = 'http://localhost:3000';

  @IsString()
  @IsOptional()
  COOKIE_DOMAIN: string = '';

  @IsInt()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseInt(value as string, 10))
  OTP_EXPIRES_MINUTES: number = 15;

  // ------------------------------------------------------------------- mail
  @IsString()
  @IsOptional()
  SMTP_HOST: string = 'smtp.ethereal.email';

  @IsInt()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parseInt(value as string, 10))
  SMTP_PORT: number = 587;

  @IsString()
  @IsOptional()
  SMTP_USER: string = '';

  @IsString()
  @IsOptional()
  SMTP_PASS: string = '';

  @IsString()
  @IsOptional()
  SMTP_FROM: string = 'Ordara Analytics <noreply@ordara.com>';

  // --------------------------------------------------------------- cloudinary
  @IsString()
  @IsOptional()
  CLOUDINARY_CLOUD_NAME: string = '';

  @IsString()
  @IsOptional()
  CLOUDINARY_API_KEY: string = '';

  @IsString()
  @IsOptional()
  CLOUDINARY_API_SECRET: string = '';

  // --------------------------------------------------------------- quickbooks
  @IsString()
  @IsOptional()
  QUICKBOOKS_CLIENT_ID: string = '';

  @IsString()
  @IsOptional()
  QUICKBOOKS_CLIENT_SECRET: string = '';

  @IsEnum(QuickbooksEnvironment)
  @IsOptional()
  QUICKBOOKS_ENVIRONMENT: QuickbooksEnvironment = QuickbooksEnvironment.Sandbox;

  @IsString()
  @IsOptional()
  QUICKBOOKS_REDIRECT_URI: string =
    'http://localhost:3000/api/quickbooks/callback';

  // ------------------------------------------------------------- providers
  // AES-256-GCM key encrypting every provider_connections access/refresh
  // token at rest — 32 bytes, hex or base64. The dev-only fallback below
  // only works because resolveTokenEncryptionKey() accepts it; production
  // MUST set a real one (`openssl rand -hex 32`) or token encryption is
  // trivially reversible by anyone with this repo.
  @IsString()
  @IsOptional()
  TOKEN_ENCRYPTION_KEY: string =
    '0000000000000000000000000000000000000000000000000000000000000000';
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: false,
    exposeDefaultValues: true,
  });

  const errors = validateSync(validated, {
    skipMissingProperties: false,
    whitelist: false,
  });

  if (errors.length > 0) {
    const details = errors
      .map(
        (e) =>
          `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
      )
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return validated;
}
