import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

/**
 * Contexte de la réconciliation post-event envoyé par l'écran staff (document Bertrand
 * 2026-10-06, lot 4b) : les colonnes que seul le navigateur sait calculer (prédit Event
 * Predict au grain inventaire, coût d'un article vendu tel quel, unité et conditionnement).
 * Le serveur tient le document ; il reprend ces colonnes ligne à ligne.
 */
export class PostEventContextDto {
  @ApiProperty({ description: "ID de l'événement" })
  @IsString()
  eventId: string;

  @ApiProperty({
    description: '[{ elementId, itemKey, predictedUnits, unitCost, unit, unitsPerPack, packaging }]',
    type: [Object],
  })
  @IsArray()
  lines: Array<Record<string, unknown>>;

  @ApiPropertyOptional({ description: 'Provenance du prédit (version Event Predict)' })
  @IsOptional()
  @IsString()
  predictedSource?: string;
}
