import {
  ClassSerializerInterceptor,
  Module,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  APP_FILTER,
  APP_GUARD,
  APP_INTERCEPTOR,
  APP_PIPE,
  HttpAdapterHost,
  Reflector,
} from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import {
  AllExceptionsFilter,
  validationExceptionFactory,
} from '@common/filters';
import {
  LoggingInterceptor,
  TimeoutInterceptor,
  TransformInterceptor,
} from '@common/interceptors';
import {
  APP_CONFIG_KEY,
  appConfig,
  databaseConfig,
  validateEnv,
  type AppConfig,
} from '@config';
import { DatabaseModule } from '@database/database.module';
import { HealthModule } from '@modules/health/health.module';
import { UsersModule } from '@modules/users/users.module';

@Module({
  imports: [
    // Global config: .env is validated once at boot, then injected everywhere.
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      envFilePath: [
        `.env.${process.env.NODE_ENV ?? 'development'}.local`,
        '.env.local',
        '.env',
      ],
      load: [appConfig, databaseConfig],
      validate: validateEnv,
    }),

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const { throttle } =
          configService.getOrThrow<AppConfig>(APP_CONFIG_KEY);
        return [{ ttl: throttle.ttl, limit: throttle.limit }];
      },
    }),

    DatabaseModule,

    // ------------------------------------------------------------ feature modules
    HealthModule,
    UsersModule,
  ],
  providers: [
    // Order matters: interceptors registered first sit outermost in the chain,
    // so Logging wraps Timeout wraps Serializer wraps Transform.
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    {
      provide: APP_INTERCEPTOR,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        new TimeoutInterceptor(
          configService.getOrThrow<AppConfig>(APP_CONFIG_KEY).requestTimeoutMs,
        ),
    },
    {
      provide: APP_INTERCEPTOR,
      inject: [Reflector],
      useFactory: (reflector: Reflector) => new TransformInterceptor(reflector),
    },
    // Applies @Exclude()/@Expose() so entities never leak secrets over the wire.
    { provide: APP_INTERCEPTOR, useClass: ClassSerializerInterceptor },

    // Global validation: strips unknown keys, rejects extras, coerces types.
    {
      provide: APP_PIPE,
      useFactory: () =>
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
          transformOptions: {
            enableImplicitConversion: false,
            exposeDefaultValues: true,
          },
          stopAtFirstError: false,
          exceptionFactory: validationExceptionFactory,
        }),
    },

    { provide: APP_GUARD, useClass: ThrottlerGuard },

    {
      provide: APP_FILTER,
      inject: [HttpAdapterHost, ConfigService],
      useFactory: (
        httpAdapterHost: HttpAdapterHost,
        configService: ConfigService,
      ) =>
        new AllExceptionsFilter(
          httpAdapterHost,
          configService.getOrThrow<AppConfig>(APP_CONFIG_KEY).isProduction,
        ),
    },
  ],
})
export class AppModule {}
