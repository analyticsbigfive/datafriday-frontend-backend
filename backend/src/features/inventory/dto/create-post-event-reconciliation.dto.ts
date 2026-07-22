import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

/**
 * Une ligne de réconciliation post-événement (article × PdV/storage).
 * Format ADDITIF au format des lignes de reset logistique (StockReconciliation.lines) :
 * mêmes clés d'identité (elementId/itemKey), champs sold/pred/left/missing en plus.
 * Les champs numériques nullables restent null quand la source manque (pas de 0
 * trompeur : pas de scénario Event Predict → predictedUnits null, pas
 * d'inventaire pré-événement → leftFromSales/missingUnits null).
 */
export class PostEventReconciliationLineDto {
  @ApiProperty({ description: 'ID du PdV/storage (SpaceElement)' })
  @IsString()
  elementId: string;

  @ApiPropertyOptional({ description: 'Nom du PdV/storage (dénormalisé pour l’export)' })
  @IsOptional()
  @IsString()
  elementName?: string;

  @ApiProperty({ description: "ID de l'article (MenuItem)" })
  @IsString()
  itemKey: string;

  @ApiPropertyOptional({ description: "Nom de l'article (dénormalisé)" })
  @IsOptional()
  @IsString()
  itemName?: string;

  @ApiProperty({ description: "Unités vendues pendant l'événement", type: Number })
  @IsNumber()
  @Type(() => Number)
  soldUnits: number;

  @ApiPropertyOptional({ description: 'Unités prédites (scénario Event Predict) — null sans scénario', type: Number })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  predictedUnits?: number | null;

  @ApiPropertyOptional({ description: 'Restant théorique = pré-événement − vendues — null sans inventaire pré-événement', type: Number })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  leftFromSales?: number | null;

  @ApiProperty({ description: 'Unités comptées (inventaire post-événement)', type: Number })
  @IsNumber()
  @Type(() => Number)
  countedUnits: number;

  @ApiPropertyOptional({ description: 'Manquant = leftFromSales − compté — null si leftFromSales null', type: Number })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  missingUnits?: number | null;

  @ApiPropertyOptional({ description: 'Valorisation du manquant (coût unitaire) — null sans coût', type: Number })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  missingValue?: number | null;

  @ApiPropertyOptional({ description: 'Coût unitaire utilisé pour missingValue', type: Number })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  unitCost?: number | null;
}

export class CreatePostEventReconciliationDto {
  @ApiProperty({ description: "ID de l'événement réconcilié" })
  @IsString()
  eventId: string;

  @ApiPropertyOptional({ description: "Nom de l'événement (dénormalisé pour la liste)" })
  @IsOptional()
  @IsString()
  eventName?: string;

  // Pas de champ summary : les chips (Diff %, Miss €) se recalculent depuis les
  // lignes à l'affichage — le document reste self-contained sans colonne en plus.
  @ApiProperty({ description: 'Lignes article × PdV', type: [PostEventReconciliationLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PostEventReconciliationLineDto)
  lines: PostEventReconciliationLineDto[];
}
