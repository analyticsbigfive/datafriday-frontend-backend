import { PageLimitSearchQueryDto } from '../../../shared/dto/list-query.dto';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Paramètres de query des routes du contrôleur, validés (types, bornes). Les noms et valeurs
 * par défaut sont ceux des anciens paramètres @Query('x') ; un paramètre inconnu est ignoré.
 */

export class MenuItemsFindAllQueryDto extends PageLimitSearchQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  spaceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  typeId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  readyForSale?: string;
}

export class ProductTypesFindAllQueryDto extends PageLimitSearchQueryDto {
}

export class ProductCategoriesFindAllQueryDto extends PageLimitSearchQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  typeId?: string;
}
