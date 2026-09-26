import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { AppConfig } from './app.config';

const SWAGGER_UI_CDN = 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.32.13';

export const setupSwagger = (
  app: INestApplication,
  config: AppConfig,
): void => {
  if (!config.swagger.enabled) return;

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Ordara Analytics API')
      .setDescription('Ordara Analytics Backend REST API')
      .setVersion('1.0')
      // Global prefix + versioning are already baked into the generated paths,
      // so no .addServer() here — it would double up as /api/api/v1/...
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'access-token',
      )
      .build(),
    { operationIdFactory: (_controllerKey, methodKey) => methodKey },
  );

  SwaggerModule.setup(config.swagger.path, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customSiteTitle: 'Ordara Analytics API Docs',
    // Serverless bundles (Vercel) don't ship swagger-ui-dist's static files,
    // so load the UI assets from a CDN pinned to the installed version.
    customCssUrl: `${SWAGGER_UI_CDN}/swagger-ui.css`,
    customJs: [
      `${SWAGGER_UI_CDN}/swagger-ui-bundle.js`,
      `${SWAGGER_UI_CDN}/swagger-ui-standalone-preset.js`,
    ],
    customfavIcon: `${SWAGGER_UI_CDN}/favicon-32x32.png`,
  });
};
