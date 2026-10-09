import { PageLimitSearchQueryDto } from '../../../shared/dto/list-query.dto';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Paramètres de query des routes du contrôleur, validés (types, bornes). Les noms et valeurs
 * par défaut sont ceux des anciens paramètres @Query('x') ; un paramètre inconnu est ignoré.
 */

export class MarketPriceTypesFindAllQueryDto extends PageLimitSearchQueryDto {
}

export class MarketPriceCategoriesFindAllQueryDto extends PageLimitSearchQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  typeId?: string;
}
