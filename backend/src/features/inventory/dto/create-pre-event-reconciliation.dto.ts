import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

/**
 * Création d'une réconciliation PRE-event (attendu vs compté).
 * Volontairement minimal : les lignes sont construites CÔTÉ SERVEUR
 * (inventory.service.createPreEventReconciliation) — le client, potentiellement
 * sans la permission `front.fb.preInventoryExpected`, n'a jamais eu les
 * quantités attendues et ne peut donc pas les fournir.
 */
export class CreatePreEventReconciliationDto {
  @ApiProperty({ description: "ID de l'événement FUTUR compté (cible de la réconciliation)" })
  @IsString()
  eventId: string;
}
