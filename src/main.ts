import type { IncomingMessage, ServerResponse } from 'node:http';
import { Logger, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { API_VERSION, REQUEST_ID_HEADER } from '@common/constants';
import { APP_CONFIG_KEY, type AppConfig } from '@config';
import { setupSwagger } from '@config/swagger.config';
import { HEALTH_ROUTE_PATH } from '@modules/health/constants';

async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  const config = app.get(ConfigService).getOrThrow<AppConfig>(APP_CONFIG_KEY);

  // Security + transport basics.
  app.use(helmet());
  app.use(compression());
  // Auth strategies read the access/refresh JWTs off httpOnly cookies.
  app.use(cookieParser());
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    exposedHeaders: [REQUEST_ID_HEADER],
  });

  // /api/v1/... — the version lives in the URL, the prefix is configurable.
  app.setGlobalPrefix(config.apiPrefix, { exclude: [HEALTH_ROUTE_PATH] });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: API_VERSION,
  });

  setupSwagger(app, config);

  return app;
}

async function bootstrap(): Promise<void> {
  const app = await createApp();
  const config = app.get(ConfigService).getOrThrow<AppConfig>(APP_CONFIG_KEY);

  // Flush pending work (DB pool, in-flight requests) on SIGTERM/SIGINT.
  app.enableShutdownHooks();

  await app.listen(config.port);

  const logger = new Logger('Bootstrap');
  logger.log(`Environment : ${config.env}`);
  logger.log(
    `API         : ${await app.getUrl()}/${config.apiPrefix}/v${API_VERSION}`,
  );
  if (config.swagger.enabled) {
    logger.log(`Swagger     : ${await app.getUrl()}/${config.swagger.path}`);
  }
}

// Serverless (Vercel): reuse one initialised app across warm invocations.
let serverlessApp: Promise<NestExpressApplication> | undefined;

async function getServerlessApp(): Promise<NestExpressApplication> {
  serverlessApp ??= createApp().then((app) => app.init());
  return serverlessApp;
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const app = await getServerlessApp();
  app.getHttpAdapter().getInstance()(req, res);
}

// Vercel sets VERCEL=1 and invokes the default export instead of listening.
if (!process.env.VERCEL) {
  void bootstrap();
}
