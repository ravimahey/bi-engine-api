import { PartialType } from '@nestjs/swagger';
import { CreateOrganizationDto } from './create-organization.dto';

/** Every CreateOrganizationDto rule stays in force, but each field becomes optional. */
export class UpdateOrganizationDto extends PartialType(CreateOrganizationDto) {}
