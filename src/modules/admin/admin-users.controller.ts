import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiPaginatedResponse,
  ResponseMessage,
  Roles,
} from '@common/decorators';
import { IdParamDto, PaginationQueryDto } from '@common/dto';
import { QueryUsersDto, UpdateUserDto } from '@modules/users/dto';
import { User, UserRole } from '@modules/users/entities';
import { AdminUserDetailDto, AdminUserRecordsParamDto } from './dto';
import { AdminUserDataService, AdminUsersService } from './services';

/**
 * Admin-only management of buyer and supplier accounts (admin accounts are
 * never listed or reachable here): view, edit and soft-delete. Admins
 * never create users (people sign up themselves) and there is no restore. A
 * signed-in user's own profile lives under `/auth/me` + `/auth/profile`.
 */
@ApiTags('Admin - Users')
@ApiBearerAuth('access-token')
@Roles(UserRole.ADMIN)
@ApiForbiddenResponse({ description: 'Admin role required' })
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly adminUsers: AdminUsersService,
    private readonly adminUserData: AdminUserDataService,
  ) {}

  @Get()
  @ResponseMessage('Users fetched successfully')
  @ApiOperation({ summary: 'List users with pagination, search and filters' })
  @ApiPaginatedResponse(User)
  findAll(@Query() query: QueryUsersDto) {
    return this.adminUsers.findAll(query);
  }

  @Get(':id')
  @ResponseMessage('User fetched successfully')
  @ApiOperation({
    summary:
      'Get a user together with their organization (connections, sync status) and a count of every record type they have',
  })
  @ApiOkResponse({ type: AdminUserDetailDto })
  @ApiNotFoundResponse({ description: 'User does not exist' })
  findOne(@Param() { id }: IdParamDto): Promise<AdminUserDetailDto> {
    return this.adminUserData.getDetail(id);
  }

  @Get(':id/records/:type')
  @ResponseMessage('User records fetched successfully')
  @ApiOperation({
    summary:
      'Paginated records of one type (vendors, expense-transactions, sales-transactions, customers, …) belonging to the user’s organization, newest first',
  })
  @ApiOkResponse({ description: 'Paginated list of the requested record type' })
  @ApiNotFoundResponse({
    description: 'User does not exist or has no organization',
  })
  findRecords(
    @Param() { id, type }: AdminUserRecordsParamDto,
    @Query() query: PaginationQueryDto,
  ) {
    return this.adminUserData.listRecords(id, type, query);
  }

  @Patch(':id')
  @ResponseMessage('User updated successfully')
  @ApiOperation({ summary: 'Update a user' })
  @ApiOkResponse({ type: User })
  @ApiNotFoundResponse({ description: 'User does not exist' })
  @ApiConflictResponse({ description: 'Email already in use' })
  update(
    @Param() { id }: IdParamDto,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<User> {
    return this.adminUsers.update(id, updateUserDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a user' })
  @ApiNotFoundResponse({ description: 'User does not exist' })
  remove(@Param() { id }: IdParamDto): Promise<void> {
    return this.adminUsers.remove(id);
  }
}
