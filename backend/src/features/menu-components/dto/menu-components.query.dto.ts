import { IsString, Matches, MaxLength } from 'class-validator';
import { PageLimitQueryDto } from '../../../shared/dto/list-query.dto';

/**
 * Paramètres de query des routes du contrôleur, validés (types, bornes). Les noms et valeurs
 * par défaut sont ceux des anciens paramètres @Query('x') ; un paramètre inconnu est ignoré.
 */

export class MenuComponentsFindAllQueryDto extends PageLimitQueryDto {
}

/** `ids` : identifiants séparés par des virgules (100 au maximum, contrôlé par le service). */
export class MenuComponentsByIdsQueryDto {
  @IsString()
  @MaxLength(5000)
  @Matches(/^[A-Za-z0-9_-]+(,[A-Za-z0-9_-]*)*$/, { message: 'ids doit être une liste d identifiants séparés par des virgules' })
  ids: string;
}
