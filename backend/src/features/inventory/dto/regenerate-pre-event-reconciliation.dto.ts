import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RegeneratePreEventReconciliationDto {
  @ApiProperty({ description: "ID de l'événement (match) dont on régénère la feuille pre-event" })
  @IsString()
  eventId: string;

  @ApiPropertyOptional({
    description: "PDV dont le comptage vient d'être terminé (archivé dans meta, informatif)",
  })
  @IsOptional()
  @IsString()
  elementId?: string;
}
