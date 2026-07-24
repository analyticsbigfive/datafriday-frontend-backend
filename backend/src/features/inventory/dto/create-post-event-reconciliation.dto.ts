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

/**
 * Ventes écartées du calcul faute de jointure (BUG-238) : un record de ventes
 * dont le PdV (nom normalisé) ou l'article ne correspond à rien dans le
 * référentiel compté n'entre pas dans `soldUnits` — la ligne concernée affiche
 * alors 0 vendu et un manquant fabriqué. Persister le compte rend l'écart
 * lisible a posteriori.
 */
export class SalesUnjoinedDto {
  @ApiPropertyOptional({ description: 'Noms de PdV vendeurs absents du périmètre compté', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  shopNames?: string[];

  @ApiPropertyOptional({ description: "Noms d'articles vendus non rattachables à un article inventorié", type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  itemNames?: string[];

  @ApiPropertyOptional({ description: 'Unités vendues écartées au total', type: Number })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  units?: number;
}

export class CreatePostEventReconciliationDto {
  @ApiProperty({ description: "ID de l'événement réconcilié" })
  @IsString()
  eventId: string;

  @ApiPropertyOptional({
    description:
      "Provenance du stock de départ (BUG-241) : 'pre-event' = comptage d'avant-match du même " +
      "événement ; 'previous-post-event' = comptage d'après-match du match précédent (approximation, " +
      'les mouvements Logistic intermédiaires ne sont pas déduits) ; absent = aucun stock de départ.',
  })
  @IsOptional()
  @IsString()
  preEventSource?: string;

  @ApiPropertyOptional({ description: 'Ventes écartées faute de jointure (BUG-238)', type: SalesUnjoinedDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SalesUnjoinedDto)
  salesUnjoined?: SalesUnjoinedDto;

  @ApiPropertyOptional({ description: 'Comptage au moment de la génération (articles comptés / total)', type: [Number] })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  countedProgress?: number[];

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
