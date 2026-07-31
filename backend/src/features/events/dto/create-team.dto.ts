import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTeamDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(100) name: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() eventCategoryId?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() eventSubcategoryId?: string | null;
}
