import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Paramètres de query des routes du contrôleur, validés (types, bornes). Les noms et valeurs
 * par défaut sont ceux des anciens paramètres @Query('x') ; un paramètre inconnu est ignoré.
 */

export class WeezeventAnalyticsGetSalesByProductQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  eventId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  fromDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  toDate?: string;
}

export class WeezeventAnalyticsGetSalesByEventQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  fromDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  toDate?: string;
}

export class WeezeventAnalyticsGetMarginAnalysisQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  eventId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  fromDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  toDate?: string;
}

export class WeezeventAnalyticsGetTopProductsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  eventId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  fromDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  toDate?: string;
}
