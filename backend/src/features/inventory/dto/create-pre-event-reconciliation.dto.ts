import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

/**
 * Création d'une réconciliation PRE-event (attendu vs compté).
 * Les LIGNES sont construites CÔTÉ SERVEUR
 * (inventory.service.createPreEventReconciliation) — le client, potentiellement
 * sans la permission `front.fb.preInventoryExpected`, n'a jamais eu les
 * quantités attendues et ne peut donc pas les fournir.
 *
 * Seul le BESOIN PRÉDIT vient du client : il est calculé à partir de la version
 * Event Predict marquée par défaut, dont le scénario (menuConfig,
 * quantityAdjustments, explosion recette) vit côté front. Le réimplémenter ici
 * donnerait deux moteurs de prédiction qui divergeraient.
 */
export class CreatePreEventReconciliationDto {
  @ApiProperty({ description: "ID de l'événement FUTUR compté (cible de la réconciliation)" })
  @IsString()
  eventId: string;

  @ApiPropertyOptional({
    description:
      'Besoin prédit Event Predict en unités : { elementId: { itemId: number } }. Absent = ' +
      'aucun scénario de référence → colonnes prédit/écart à null (jamais 0 fabriqué).',
  })
  @IsOptional()
  @IsObject()
  predictedUnits?: Record<string, Record<string, number>>;
}
