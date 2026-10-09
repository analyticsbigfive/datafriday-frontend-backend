import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

/** Un accès « Ventilation » (une combinaison de matchs) : arrêter, reprendre, nouveau PIN. */
export class VentilationWindowDto {
  @ApiProperty({ description: "ID de l'espace" })
  @IsString()
  @IsNotEmpty()
  spaceId: string;

  @ApiProperty({ description: "ID de l'accès (renvoyé par ensure)" })
  @IsString()
  @IsNotEmpty()
  windowId: string;
}

/**
 * Combinaison de matchs du bandeau Logistique : un accès et un PIN par combinaison
 * (décision Ulrich du 2026-10-09).
 */
export class VentilationSelectionDto {
  @ApiProperty({ description: "ID de l'espace" })
  @IsString()
  @IsNotEmpty()
  spaceId: string;

  @ApiProperty({ description: 'Matchs choisis', type: [String] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  eventIds: string[];
}

/**
 * Dépôt confirmé par un logisticien (accès PIN). Deux formes :
 * - `rowKey` : ligne de la feuille de réarmement du match, le serveur y lit la
 *   destination et l'article ;
 * - `storageId` + `itemName` : dépôt dans un espace de stockage du match sans ligne
 *   prévue (section « Espaces de stockage », maquette Bertrand du 2026-10-09) ; le
 *   serveur vérifie que le stockage est dans le périmètre et l'article sur la feuille.
 */
export class GuestVentilationDepositDto {
  @ApiPropertyOptional({ description: 'Ligne de la feuille de réarmement (rowKey)' })
  @ValidateIf((o) => !o.storageId)
  @IsString()
  @IsNotEmpty()
  rowKey?: string;

  @ApiPropertyOptional({ description: 'Espace de stockage (dépôt hors ligne de feuille)' })
  @ValidateIf((o) => !o.rowKey)
  @IsString()
  @IsNotEmpty()
  storageId?: string;

  @ApiPropertyOptional({ description: "Nom de l'article (avec storageId)" })
  @ValidateIf((o) => !o.rowKey)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  itemName?: string;

  @ApiProperty({ description: 'Nombre de packs déposés (entier ≥ 0)' })
  @IsInt()
  @Min(0)
  // Borne de saisie : un dépôt de logisticien n'atteint jamais ces volumes.
  @Max(10000)
  @Type(() => Number)
  packed: number;

  @ApiProperty({ description: "Nombre d'unités en vrac déposées (≥ 0)" })
  @IsNumber()
  @Min(0)
  @Max(1000000)
  @Type(() => Number)
  loose: number;

  @ApiPropertyOptional({ description: 'Prénom du logisticien (décision #78)' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  depositorName?: string;
}
