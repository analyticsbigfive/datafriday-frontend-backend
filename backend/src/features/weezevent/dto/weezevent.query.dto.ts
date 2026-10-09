import { PagePerPageQueryDto } from '../../../shared/dto/list-query.dto';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Paramètres de query des routes du contrôleur, validés (types, bornes). Les noms et valeurs
 * par défaut sont ceux des anciens paramètres @Query('x') ; un paramètre inconnu est ignoré.
 */

export class WeezeventResetSyncStateQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  integrationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  type?: string;
}

export class WeezeventGetEventsQueryDto extends PagePerPageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  integrationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  startDateFrom?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  startDateTo?: string;
}

export class WeezeventGetLocationsQueryDto extends PagePerPageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  integrationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  type?: string;
}

export class WeezeventGetMerchantsQueryDto extends PagePerPageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  integrationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  locationId?: string;
}

export class WeezeventGetProductsQueryDto extends PagePerPageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  integrationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  spaceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  onlySold?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  catalogSpaceId?: string;
}

export class WeezeventBackfillTransactionItemProductsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  integrationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  dryRun?: string;
}

export class WeezeventGetProductMappingsQueryDto extends PagePerPageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  integrationId?: string;
}

export class WeezeventGetOrdersQueryDto extends PagePerPageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  integrationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  eventId?: string;
}

export class WeezeventGetPricesQueryDto extends PagePerPageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  integrationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  eventId?: string;
}

export class WeezeventGetAttendeesQueryDto extends PagePerPageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  integrationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  eventId?: string;
}
