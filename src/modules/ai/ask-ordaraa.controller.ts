import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '@common/decorators';
import type { AuthenticatedUser } from '@common/decorators';
import { AI_THROTTLE } from './constants';
import { AskAnswerDto, AskQuestionDto } from './dto';
import { AskOrdaraaService } from './services';

/**
 * "Ask Ordaraa": natural-language questions answered only from approved,
 * tenant-scoped backend tools. Thin: DTO validation (global pipe) -> one
 * service call -> return. `POST` because the question is a body, but it
 * reads only, so it answers 200 rather than 201.
 */
@ApiTags('AI')
@ApiBearerAuth('access-token')
@Throttle({ default: AI_THROTTLE })
@Controller('ai')
export class AskOrdaraaController {
  constructor(private readonly askOrdaraa: AskOrdaraaService) {}

  @Post('ask')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Ask a question about your spend data; answered from BI tools, with the raw facts returned alongside — must be your own organization, unless admin',
  })
  @ApiOkResponse({ type: AskAnswerDto })
  @ApiForbiddenResponse({ description: 'Not your organization' })
  @ApiServiceUnavailableResponse({
    description: 'AI is disabled or could not answer right now',
  })
  ask(@CurrentUser() user: AuthenticatedUser, @Body() body: AskQuestionDto) {
    return this.askOrdaraa.ask(body, user);
  }
}
