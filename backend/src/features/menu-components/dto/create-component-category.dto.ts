import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateComponentCategoryDto {
  @ApiProperty({ description: 'Nom de la Component Category', example: 'Vinaigrette', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiProperty({ description: 'ID du Component Type parent', example: 'type-123', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  typeId?: string;

  @ApiProperty({ description: 'Alias front de typeId', example: 'type-123', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  componentTypeId?: string;
}
