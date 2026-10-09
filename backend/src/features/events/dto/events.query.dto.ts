import { PageLimitQueryDto } from '../../../shared/dto/list-query.dto';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Paramètres de query des routes du contrôleur, validés (types, bornes). Les noms et valeurs
 * par défaut sont ceux des anciens paramètres @Query('x') ; un paramètre inconnu est ignoré.
 */

export class EventsFindAllQueryDto extends PageLimitQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  spaceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  excludeSimulated?: string;
}

export class TeamsFindAllQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  eventCategoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  eventSubcategoryId?: string;
}
