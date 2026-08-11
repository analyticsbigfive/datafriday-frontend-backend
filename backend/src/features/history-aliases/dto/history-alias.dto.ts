import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateHistoryAliasDto {
  @ApiProperty({ description: 'ID de l\'espace (portée de l\'alias)' })
  @IsString()
  spaceId: string;

  @ApiPropertyOptional({
    description: 'ID catalogue de l\'article source, quand il existe (les items timeline peuvent être synthétiques)',
  })
  @IsOptional()
  @IsString()
  sourceMenuItemId?: string;

  @ApiProperty({ description: 'Nom brut de l\'article source (clé de résolution timeline)' })
  @IsString()
  @MaxLength(300)
  sourceName: string;

  @ApiProperty({ description: 'ID catalogue de l\'article cible (reçoit les prévisions)' })
  @IsString()
  targetMenuItemId: string;
}
