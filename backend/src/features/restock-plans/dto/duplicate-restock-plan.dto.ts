import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DuplicateRestockPlanDto {
  @ApiPropertyOptional({ description: 'Nom de la copie (défaut : nom source + « (copie) »)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;
}
