import type { ConfigService } from '@nestjs/config';
import { APP_CONFIG_KEY, type AppConfig } from '@config';

/**
 * Resolves the validated `AppConfig` off `ConfigService` — the one call every
 * config-reading provider needs, pulled out so it isn't repeated inline in
 * every controller helper / module `useFactory`.
 */
export const getAppConfig = (configService: ConfigService): AppConfig =>
  configService.getOrThrow<AppConfig>(APP_CONFIG_KEY);
