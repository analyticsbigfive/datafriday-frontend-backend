import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Paramètres de query des routes du contrôleur, validés (types, bornes). Les noms et valeurs
 * par défaut sont ceux des anciens paramètres @Query('x') ; un paramètre inconnu est ignoré.
 */

export class MappingsGetLocationSpaceMappingsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  limit?: number;
}

export class MappingsGetLocationShopMappingsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  locationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  spaceId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  limit?: number;
}

export class MappingsGetMerchantElementMappingsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  locationId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  limit?: number;
}

export class MappingsGetProductMappingsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  locationId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  includeSales?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  integrationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  fromDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  toDate?: string;
}
