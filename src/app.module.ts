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
import { JwtAuthGuard, RolesGuard } from '@common/guards';
import {
  LoggingInterceptor,
  TimeoutInterceptor,
  TransformInterceptor,
} from '@common/interceptors';
import { getAppConfig } from '@common/utils';
import { aiConfig, appConfig, databaseConfig, validateEnv } from '@config';
import { DatabaseModule } from '@database/database.module';
import { AuthModule } from '@modules/auth/auth.module';
import { HealthModule } from '@modules/health/health.module';
import { UsersModule } from '@modules/users/users.module';
import { OrganizationsModule } from '@modules/organizations/organizations.module';
import { ProvidersModule } from '@modules/providers/providers.module';
import { QuickbooksModule } from '@modules/quickbooks/quickbooks.module';
import { XeroModule } from '@modules/xero/xero.module';
import { ImportsModule } from '@modules/imports/imports.module';
import { RecordsModule } from '@modules/records/records.module';
import { AnalyticsModule } from '@modules/analytics/analytics.module';
import { AdminModule } from '@modules/admin/admin.module';
import { AiModule } from '@modules/ai/ai.module';
import { DashboardModule } from '@modules/dashboard/dashboard.module';
import { SupportModule } from '@modules/support/support.module';
import { WalkthroughsModule } from '@modules/walkthroughs/walkthroughs.module';
import { SignalsModule } from '@modules/signals/signals.module';

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
      load: [appConfig, databaseConfig, aiConfig],
      validate: validateEnv,
    }),

    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const { throttle } = getAppConfig(configService);
        return [{ ttl: throttle.ttl, limit: throttle.limit }];
      },
    }),

    DatabaseModule,

    // ------------------------------------------------------------ feature modules
    HealthModule,
    AuthModule,
    UsersModule,
    OrganizationsModule,
    ProvidersModule,
    QuickbooksModule,
    XeroModule,
    ImportsModule,
    RecordsModule,
    AnalyticsModule,
    AdminModule,
    AiModule,
    DashboardModule,
    SupportModule,
    WalkthroughsModule,
    SignalsModule,
  ],
  providers: [
    // Order matters: interceptors registered first sit outermost in the chain,
    // so Logging wraps Timeout wraps Serializer wraps Transform.
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    {
      provide: APP_INTERCEPTOR,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        new TimeoutInterceptor(getAppConfig(configService).requestTimeoutMs),
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
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },

    {
      provide: APP_FILTER,
      inject: [HttpAdapterHost, ConfigService],
      useFactory: (
        httpAdapterHost: HttpAdapterHost,
        configService: ConfigService,
      ) =>
        new AllExceptionsFilter(
          httpAdapterHost,
          getAppConfig(configService).isProduction,
        ),
    },
  ],
})
export class AppModule {}
