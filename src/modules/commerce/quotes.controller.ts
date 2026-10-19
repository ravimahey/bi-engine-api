import {
  Body,
  Controller,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthenticatedUser,
  ResponseMessage,
} from '@common/decorators';
import { IdParamDto } from '@common/dto';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { Quote } from './entities/quote.entity';
import { QuotesService } from './services/quotes.service';

@ApiTags('Commerce - Quotes')
@ApiBearerAuth('access-token')
@ApiForbiddenResponse({ description: 'Caller has no organization yet' })
@Controller('quotes')
export class QuotesController {
  constructor(private readonly quotesService: QuotesService) {}

  @Post()
  @ResponseMessage('Quote created successfully')
  @ApiOperation({ summary: 'Create a new commercial quote' })
  @ApiOkResponse({ type: Quote })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateQuoteDto,
  ): Promise<Quote> {
    return this.quotesService.create(user.organizationId!, dto);
  }

  @Get()
  @ResponseMessage('Quotes fetched successfully')
  @ApiOperation({ summary: 'List all quotes for current organization' })
  @ApiOkResponse({ type: [Quote] })
  findAll(@CurrentUser() user: AuthenticatedUser): Promise<Quote[]> {
    return this.quotesService.findAll(user.organizationId!);
  }

  @Get(':id')
  @ResponseMessage('Quote fetched successfully')
  @ApiOperation({ summary: 'Get quote by ID' })
  @ApiOkResponse({ type: Quote })
  @ApiNotFoundResponse({ description: 'Quote not found' })
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
  ): Promise<Quote> {
    return this.quotesService.findOne(user.organizationId!, id);
  }

  @Post(':id/send')
  @ResponseMessage('Quote sent successfully')
  @ApiOperation({ summary: 'Mark quote as sent' })
  @ApiOkResponse({ type: Quote })
  send(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
  ): Promise<Quote> {
    return this.quotesService.send(user.organizationId!, id);
  }

  @Post(':id/accept')
  @ResponseMessage('Quote accepted successfully')
  @ApiOperation({ summary: 'Accept quote' })
  @ApiOkResponse({ type: Quote })
  accept(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
  ): Promise<Quote> {
    return this.quotesService.accept(user.organizationId!, id);
  }

  @Post(':id/decline')
  @ResponseMessage('Quote declined successfully')
  @ApiOperation({ summary: 'Decline quote' })
  @ApiOkResponse({ type: Quote })
  decline(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
  ): Promise<Quote> {
    return this.quotesService.decline(user.organizationId!, id);
  }

  @Post(':id/convert-to-order')
  @ResponseMessage('Quote converted to order successfully')
  @ApiOperation({ summary: 'Convert an accepted quote into a confirmed order' })
  convertToOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param() { id }: IdParamDto,
  ) {
    return this.quotesService.convertToOrder(user.organizationId!, id);
  }
}
