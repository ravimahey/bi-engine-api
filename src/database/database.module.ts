import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DATABASE_CONFIG_KEY } from '@config';
import type { PostgresDataSourceOptions } from 'typeorm/driver/postgres/PostgresDataSourceOptions.js';

/**
 * Async TypeORM wiring: connection settings come from validated config, never
 * from raw `process.env` reads scattered across the app.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const options =
          configService.getOrThrow<PostgresDataSourceOptions>(
            DATABASE_CONFIG_KEY,
          );

        return {
          ...options,
          // Entities registered by feature modules via TypeOrmModule.forFeature()
          // are picked up automatically — no central entity array to maintain.
          autoLoadEntities: true,
          retryAttempts: 5,
          retryDelay: 3000,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
