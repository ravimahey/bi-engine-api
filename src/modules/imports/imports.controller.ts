import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseFilePipeBuilder,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, type AuthenticatedUser } from '@common/decorators';
import { IdParamDto } from '@common/dto';
import { IMPORT_DEFINITIONS, MAX_IMPORT_FILE_BYTES } from './constants';
import { ListImportsQueryDto, ValidateImportDto } from './dto';
import { ImportHistoryService, ImportsService } from './services';

@ApiTags('Imports')
@Controller('imports')
export class ImportsController {
  constructor(
    private readonly importsService: ImportsService,
    private readonly history: ImportHistoryService,
  ) {}

  @Get('definitions')
  @ApiOperation({
    summary:
      'The 10 import templates in the order they must be imported — columns, formats, examples and rules. Drives the in-app guide and template downloads.',
  })
  getDefinitions() {
    return IMPORT_DEFINITIONS;
  }

  @Post('validate')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_IMPORT_FILE_BYTES, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'organizationId', 'importType'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: '.csv or .xlsx, max 5 MB',
        },
        organizationId: { type: 'string', format: 'uuid' },
        importType: { type: 'string' },
      },
    },
  })
  @ApiOperation({
    summary:
      'Parse and check a CSV/Excel file against its template without saving any business data. Returns every error/warning with its row number, a summary and a preview; commit it with POST /imports/:id/commit.',
  })
  validate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ValidateImportDto,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({
          maxSize: MAX_IMPORT_FILE_BYTES,
          message: 'The file is larger than 5 MB. Split it into smaller files.',
        })
        .build({
          fileIsRequired: true,
          errorHttpStatusCode: HttpStatus.BAD_REQUEST,
        }),
    )
    file: Express.Multer.File,
  ) {
    return this.importsService.validate(
      file,
      dto.organizationId,
      dto.importType,
      user,
    );
  }

  @Post(':id/commit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Write a validated import into the canonical records — all rows in one transaction, or nothing. Only allowed once, with zero errors, within 24 hours of validation.',
  })
  commit(@CurrentUser() user: AuthenticatedUser, @Param() { id }: IdParamDto) {
    return this.importsService.commit(id, user);
  }

  @Post(':id/discard')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel a validated import without saving it' })
  discard(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
  ): Promise<void> {
    return this.importsService.discard(id, user);
  }

  @Get()
  @ApiOperation({ summary: "An organization's import history, newest first" })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListImportsQueryDto,
  ) {
    return this.history.list(query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One import with its errors/warnings' })
  findOne(@CurrentUser() user: AuthenticatedUser, @Param() { id }: IdParamDto) {
    return this.importsService.findOne(id, user);
  }
}
