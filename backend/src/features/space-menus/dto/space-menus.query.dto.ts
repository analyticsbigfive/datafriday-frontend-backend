import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Paramètres de query des routes du contrôleur, validés (types, bornes). Les noms et valeurs
 * par défaut sont ceux des anciens paramètres @Query('x') ; un paramètre inconnu est ignoré.
 */

export class SpaceMenusGetShopAvailableMenuItemsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  configId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  enabledOnly?: string;
}

export class SpaceMenusGetStorageInventoryQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  shopIds?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  configId?: string;
}

export class SpaceMenusGetConfigShopMenuItemsLightQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  itemsScope?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  shopsScope?: string;
}
