import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

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

  @ApiPropertyOptional({
    description:
      'Besoin prédit Event Predict en unités : { elementId: { itemId: number } } (calculé par ' +
      "l'écran, seul à connaître le scénario). Absent : celui de la feuille précédente.",
  })
  @IsOptional()
  @IsObject()
  predictedUnits?: Record<string, Record<string, number>>;
}
