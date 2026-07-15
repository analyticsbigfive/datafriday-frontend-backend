import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreateComponentTypeDto {
  @ApiProperty({ description: 'Nom du Component Type', example: 'Sauce' })
  @IsString()
  name: string;
}
