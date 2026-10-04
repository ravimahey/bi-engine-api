import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Not, Repository, type FindOptionsWhere } from 'typeorm';
import { paginate } from '@common/utils';
import type { Paginated } from '@common/types';
import { QueryUsersDto, UpdateUserDto } from '@modules/users/dto';
import { User, UserRole } from '@modules/users/entities';
import { UsersService } from '@modules/users/services';

/**
 * What an admin sees of the user base: owners and support users only. Admin
 * accounts (including the caller's own) never appear in lists and are
 * treated as not found by id, so an admin can't view, edit or delete another
 * admin through these routes.
 */
@Injectable()
export class AdminUsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
    private readonly usersService: UsersService,
  ) {}

  async findAll(query: QueryUsersDto): Promise<Paginated<User>> {
    const { page, limit, search, role, isActive, sortBy, order } = query;

    if (role === UserRole.ADMIN) {
      return paginate<User>([[], 0], page, limit);
    }

    const baseWhere: FindOptionsWhere<User> = {
      role: role ?? Not(UserRole.ADMIN),
      ...(isActive === undefined ? {} : { isActive }),
    };

    // An array of conditions is OR'ed by TypeORM — one branch per searchable column.
    const where: FindOptionsWhere<User> | FindOptionsWhere<User>[] = search
      ? [
          { ...baseWhere, email: ILike(`%${search}%`) },
          { ...baseWhere, firstName: ILike(`%${search}%`) },
          { ...baseWhere, lastName: ILike(`%${search}%`) },
        ]
      : baseWhere;

    const result = await this.usersRepository.findAndCount({
      where,
      order: { [sortBy]: order },
      skip: query.skip,
      take: limit,
    });

    return paginate(result, page, limit);
  }

  async findOne(id: string): Promise<User> {
    const user = await this.usersService.findOne(id);

    if (user.role === UserRole.ADMIN) {
      throw new NotFoundException(`User with id "${id}" was not found`);
    }

    return user;
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    await this.findOne(id);
    return this.usersService.update(id, dto);
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    return this.usersService.remove(id);
  }
}
