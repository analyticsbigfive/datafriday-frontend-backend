import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Raisons exposées à l'API pour un mouvement MANUEL. `SALE` et `INVENTORY_RESET`
 * sont réservés au serveur (dérivation ventes / reset) et refusés ici.
 */
export const MANUAL_MOVEMENT_REASONS = [
  'DELIVERY',
  'TRANSFER_SHOP',
  'TRANSFER_STORAGE',
  'EXPIRY',
  'OTHER',
] as const;
export type ManualMovementReason = (typeof MANUAL_MOVEMENT_REASONS)[number];

export class CreateMovementDto {
  @ApiProperty({ description: "ID de l'espace (scoping)" })
  @IsString()
  @IsNotEmpty()
  spaceId: string;

  @ApiProperty({ description: 'ID du PDV ou storage (SpaceElement) concerné' })
  @IsString()
  @IsNotEmpty()
  elementId: string;

  @ApiProperty({
    description:
      "Clé de la denrée = nom du référentiel d'inventaire (itemName market price, nom d'ingrédient/composant ou de menu item)",
  })
  @IsString()
  @IsNotEmpty()
  itemKey: string;

  @ApiProperty({ enum: ['add', 'remove'], description: 'Sens du mouvement' })
  @IsIn(['add', 'remove'])
  direction: 'add' | 'remove';

  @ApiProperty({ description: 'Nombre de packs (entier ≥ 0)' })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  packed: number;

  @ApiProperty({ description: "Nombre d'unités en vrac (décimal ≥ 0)" })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  loose: number;

  @ApiProperty({ enum: MANUAL_MOVEMENT_REASONS })
  @IsIn(MANUAL_MOVEMENT_REASONS as unknown as string[])
  reason: ManualMovementReason;

  @ApiPropertyOptional({ description: 'PDV/Storage source (add) ou destination (remove) — requis pour TRANSFER_*' })
  @IsOptional()
  @IsString()
  counterpartyElementId?: string;

  @ApiPropertyOptional({ description: 'Date limite de consommation — requise pour EXPIRY' })
  @IsOptional()
  @IsISO8601()
  expiryDate?: string;

  @ApiPropertyOptional({ description: 'Raison libre — requise pour OTHER' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ description: 'Market price sélectionné dans le popup (fixe unitsPerPack)' })
  @IsOptional()
  @IsString()
  marketPriceId?: string;

  @ApiPropertyOptional({ description: "Menu item si l'item du référentiel est un produit readyForSale" })
  @IsOptional()
  @IsString()
  menuItemId?: string;
}

/** BUG-259-02 : confirmation d'un transfert PENDING. Omis = quantités déclarées à l'émission. */
export class ConfirmTransferDto {
  @ApiPropertyOptional({ description: 'Packs réellement reçus (défaut : quantité déclarée à l’émission)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  packed?: number;

  @ApiPropertyOptional({ description: 'Vrac réellement reçu (défaut : quantité déclarée à l’émission)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  loose?: number;
}

export class ResetLineDto {
  @ApiProperty({ description: 'ID du PDV ou storage (SpaceElement)' })
  @IsString()
  @IsNotEmpty()
  elementId: string;

  @ApiProperty({ description: 'Clé de la denrée (nom du référentiel)' })
  @IsString()
  @IsNotEmpty()
  itemKey: string;

  @ApiProperty({ description: "Packs comptés à l'inventaire" })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  countedPacked: number;

  @ApiProperty({ description: "Unités vrac comptées à l'inventaire" })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  countedLoose: number;

  @ApiPropertyOptional({ description: 'Unités par pack (si connu du référentiel front)' })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Type(() => Number)
  unitsPerPack?: number;
}

export class InventoryResetDto {
  @ApiPropertyOptional({ description: "Event de l'inventaire de référence" })
  @IsOptional()
  @IsString()
  eventId?: string;

  @ApiPropertyOptional({ description: "Nom de l'event (dénormalisé pour la liste Réconciliation)" })
  @IsOptional()
  @IsString()
  eventName?: string;

  @ApiProperty({ type: [ResetLineDto], description: 'Valeurs comptées, mappées sur le référentiel Logistic' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResetLineDto)
  lines: ResetLineDto[];
}

export class SimulateSaleLineDto {
  @ApiProperty({ description: 'Menu item vendu (doit être mappé à un produit Weezevent)' })
  @IsString()
  @IsNotEmpty()
  menuItemId: string;

  @ApiProperty({ description: 'Quantité vendue (entier ≥ 1)' })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity: number;
}

export class SimulateSaleDto {
  @ApiProperty({ description: 'PDV (SpaceElement) sur lequel simuler la vente' })
  @IsString()
  @IsNotEmpty()
  elementId: string;

  @ApiProperty({ type: [SimulateSaleLineDto], description: 'Lignes de la vente simulée (menu item × quantité)' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SimulateSaleLineDto)
  lines: SimulateSaleLineDto[];

  @ApiPropertyOptional({
    description:
      "Mode réel : ignore le refus checkConsumptionFeasibility (config de stock incomplète) et se comporte comme le pipeline webhook réel, qui n'a jamais ce garde-fou. Défaut false (mode strict, comportement historique).",
  })
  @IsOptional()
  @IsBoolean()
  realMode?: boolean;

  @ApiPropertyOptional({
    description:
      "Rattache la vente à un Event/SalesEvent datés aujourd'hui (créés/réutilisés si besoin, tagués isSimulated) au lieu du SalesEvent déjà stocké sur la location — sinon la vente n'apparaît jamais sous un filtre \"Aujourd'hui\" côté Analyse/Live. Défaut false (comportement historique, inchangé).",
  })
  @IsOptional()
  @IsBoolean()
  ensureLiveEvent?: boolean;
}
