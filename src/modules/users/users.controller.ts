import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ApiPaginatedResponse,
  Roles,
  ResponseMessage,
} from '@common/decorators';
import { IdParamDto } from '@common/dto';
import { CreateUserDto, QueryUsersDto, UpdateUserDto } from './dto';
import { User, UserRole } from './entities/user.entity';
import { UsersService } from './users.service';

/**
 * Admin-only user management (list/create/edit/deactivate any account).
 * A signed-in user's own profile lives under `/auth/me` + `/auth/profile`
 * instead — see AuthController.
 */
@ApiTags('Users')
@ApiBearerAuth('access-token')
@Roles(UserRole.ADMIN)
@ApiForbiddenResponse({ description: 'Admin role required' })
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @ResponseMessage('User created successfully')
  @ApiOperation({ summary: 'Create a user' })
  @ApiCreatedResponse({ type: User })
  @ApiConflictResponse({ description: 'Email already in use' })
  create(@Body() createUserDto: CreateUserDto): Promise<User> {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @ResponseMessage('Users fetched successfully')
  @ApiOperation({ summary: 'List users with pagination, search and filters' })
  @ApiPaginatedResponse(User)
  findAll(@Query() query: QueryUsersDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @ResponseMessage('User fetched successfully')
  @ApiOperation({ summary: 'Get a single user' })
  @ApiOkResponse({ type: User })
  @ApiNotFoundResponse({ description: 'User does not exist' })
  findOne(@Param() { id }: IdParamDto): Promise<User> {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ResponseMessage('User updated successfully')
  @ApiOperation({ summary: 'Update a user' })
  @ApiOkResponse({ type: User })
  update(
    @Param() { id }: IdParamDto,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<User> {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a user' })
  remove(@Param() { id }: IdParamDto): Promise<void> {
    return this.usersService.remove(id);
  }

  @Patch(':id/restore')
  @ResponseMessage('User restored successfully')
  @ApiOperation({ summary: 'Restore a soft-deleted user' })
  @ApiOkResponse({ type: User })
  restore(@Param() { id }: IdParamDto): Promise<User> {
    return this.usersService.restore(id);
  }
}
