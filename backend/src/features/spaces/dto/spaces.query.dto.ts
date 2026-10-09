import { PageLimitQueryDto } from '../../../shared/dto/list-query.dto';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Paramètres de query des routes du contrôleur, validés (types, bornes). Les noms et valeurs
 * par défaut sont ceux des anciens paramètres @Query('x') ; un paramètre inconnu est ignoré.
 */

export class SpacesGetShopDetailsQueryDto extends PageLimitQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  granular?: string;
}

export class SpacesGetEventTimelineBatchQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  eventIds?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  granularity?: string;
}
