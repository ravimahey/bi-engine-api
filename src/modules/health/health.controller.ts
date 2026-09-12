import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { Public, ResponseMessage } from '@common/decorators';
import {
  HEALTH_DB_TIMEOUT_MS,
  HEALTH_MAX_HEAP_BYTES,
  HEALTH_ROUTE_PATH,
} from './constants';

@ApiTags('Health')
// Version-neutral and outside the global prefix so probes hit a stable /health.
@Controller({ path: HEALTH_ROUTE_PATH, version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: TypeOrmHealthIndicator,
    private readonly memory: MemoryHealthIndicator,
  ) {}

  @Get()
  @Public()
  @HealthCheck()
  @ResponseMessage('Service is healthy')
  @ApiOperation({ summary: 'Liveness/readiness probe (DB + memory)' })
  check() {
    return this.health.check([
      () =>
        this.database.pingCheck('database', { timeout: HEALTH_DB_TIMEOUT_MS }),
      () => this.memory.checkHeap('memory_heap', HEALTH_MAX_HEAP_BYTES),
    ]);
  }
}
