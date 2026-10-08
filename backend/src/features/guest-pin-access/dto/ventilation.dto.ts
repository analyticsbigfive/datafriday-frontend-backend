import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Accès « Ventilation » d'un match (bouton QR de Logistique). */
export class VentilationTargetDto {
  @ApiProperty({ description: "ID de l'espace" })
  @IsString()
  @IsNotEmpty()
  spaceId: string;

  @ApiProperty({ description: 'ID du match' })
  @IsString()
  @IsNotEmpty()
  eventId: string;
}

/**
 * Dépôt confirmé par un logisticien (accès PIN). Destination et article ne viennent
 * jamais du client : le serveur les lit sur la ligne `rowKey` de la feuille de
 * réarmement du match.
 */
export class GuestVentilationDepositDto {
  @ApiProperty({ description: 'Ligne de la feuille de réarmement (rowKey)' })
  @IsString()
  @IsNotEmpty()
  rowKey: string;

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
