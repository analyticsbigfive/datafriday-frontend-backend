import { PageLimitQueryDto } from '../../../shared/dto/list-query.dto';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { MINUTE_LOCAL_PATTERN } from '../live-delta.util';

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

  /** Écran Live : seulement les minutes locales >= since (format « YYYY-MM-DDTHH:mm »). */
  @IsOptional()
  @Matches(MINUTE_LOCAL_PATTERN, { message: 'since doit être une minute locale « YYYY-MM-DDTHH:mm »' })
  since?: string;
}

export class SpacesGetTransactionBasketsBatchQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  eventIds?: string;

  /** Écran Live : seulement les minutes locales >= since (format « YYYY-MM-DDTHH:mm »). */
  @IsOptional()
  @Matches(MINUTE_LOCAL_PATTERN, { message: 'since doit être une minute locale « YYYY-MM-DDTHH:mm »' })
  since?: string;
}
