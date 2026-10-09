import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * Paramètres de query des routes du contrôleur, validés (types, bornes). Les noms et valeurs
 * par défaut sont ceux des anciens paramètres @Query('x') ; un paramètre inconnu est ignoré.
 */

export class LogisticsGetStockQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  configId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  eventId?: string;
}

export class LogisticsGetMarketPricesQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  itemKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  currentMarketPriceId?: string;
}

export class LogisticsGetHistoryQueryDto {
  @IsOptional()
  @Matches(/^\d*$/)
  limit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  cursor?: string;
}

export class LogisticsGetLossesQueryDto {
  @IsOptional()
  @Matches(/^\d*$/)
  limit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  cursor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  includeArchived?: string;
}

export class LogisticsListSimulatedSalesQueryDto {
  @IsOptional()
  @Matches(/^\d*$/)
  limit?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  cursor?: string;
}
