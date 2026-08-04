import { IsString, IsArray, IsObject, IsOptional, IsInt } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// NOTE : ce DTO ne sert qu'à DOCUMENTER (Swagger) la forme d'un plan de
// réarmement. Les endpoints reçoivent un `Record<string, unknown>` et NE
// L'APPLIQUENT PAS en validation stricte : le ValidationPipe global
// (whitelist + forbidNonWhitelisted) s'exécute avant tout pipe de route et
// stripperait les blobs de la photo (`restockLines`, `shoppingGroups`…) —
// le plan se sauvegarderait vide, sans la moindre erreur. La whitelist réelle
// est appliquée dans le service (WRITABLE_SCALARS / WRITABLE_JSON).
// Même contrat que RestockStateDto.
export class RestockPlanDto {
  @ApiProperty({ description: 'Nom libre du plan', example: 'AJA-OM — 01/11' })
  @IsString()
  name: string;

  @ApiProperty({ description: "Source de l'objectif ('forecast' | 'sales')", example: 'forecast' })
  @IsString()
  objectiveSource: string;

  @ApiPropertyOptional({ nullable: true, description: 'Event de référence (mode Ventes)' })
  @IsOptional()
  @IsString()
  referenceEventId?: string | null;

  @ApiProperty({ type: [String], description: 'Events couverts par le plan' })
  @IsArray()
  selectedEventIds: string[];

  @ApiProperty({ description: '[{ id, name, date }] — libellés dénormalisés des events' })
  @IsArray()
  eventsSnapshot: unknown[];

  @ApiProperty({ description: 'Étape 1 figée : réglages par article' })
  @IsArray()
  stockLines: unknown[];

  @ApiProperty({ description: 'Étape 2 figée : lignes à déposer (shop × article)' })
  @IsArray()
  restockLines: unknown[];

  @ApiProperty({ description: "Mode de la feuille de course ('finished' | 'ingredients')" })
  @IsString()
  shoppingMode: string;

  @ApiProperty({ description: 'Étape 3 figée : groupes fournisseur' })
  @IsArray()
  shoppingGroups: unknown[];

  @ApiProperty({
    description:
      "Coefficients d'explosion recette FIGÉS (itemKey → ingrédients) : servent à recalculer la feuille quand une quantité est corrigée, sans relire le catalogue vivant",
  })
  @IsObject()
  recipeCoeffs: Record<string, unknown>;

  @ApiProperty({ description: 'Corrections manuelles (rowKey → quantité)' })
  @IsObject()
  lineOverrides: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Nombre de lignes de la photo (recalculé serveur)' })
  @IsOptional()
  @IsInt()
  lineCount?: number;

  @ApiPropertyOptional({
    description: 'Contexte de fabrication : snapshotAt, unmatchedStorage, dégradations connues',
  })
  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown> | null;
}
