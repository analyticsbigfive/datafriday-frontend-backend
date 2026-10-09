import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * Paramètres de query des routes du contrôleur, validés (types, bornes). Les noms et valeurs
 * par défaut sont ceux des anciens paramètres @Query('x') ; un paramètre inconnu est ignoré.
 */

export class AnalyseGetTimelineQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  startTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  endTime?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  shopId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  menuItemId?: string;

  @IsOptional()
  @Matches(/^\d*$/)
  limit?: string;
}
