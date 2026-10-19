import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class OrderItemDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  itemId?: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  description: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  requestedQuantity: number;

  @ApiProperty({ default: 'unit' })
  @IsNotEmpty()
  @IsString()
  unit: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @ApiProperty({ required: false, default: 0 })
  @IsOptional()
  @IsNumber()
  taxRate?: number;
}

export class CreateOrderDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  buyerId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  quoteId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [OrderItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}

export class PackedItemDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  itemId?: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  description: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  packedQuantity: number;
}

export class PackOrderDto {
  @ApiProperty({ type: [PackedItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PackedItemDto)
  packedItems: PackedItemDto[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  adjustmentReason?: string;
}

export class RejectAdjustmentDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}
