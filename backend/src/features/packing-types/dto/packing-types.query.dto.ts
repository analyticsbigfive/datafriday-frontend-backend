import { PageLimitSearchQueryDto } from '../../../shared/dto/list-query.dto';

/**
 * Paramètres de query des routes du contrôleur, validés (types, bornes). Les noms et valeurs
 * par défaut sont ceux des anciens paramètres @Query('x') ; un paramètre inconnu est ignoré.
 */

export class PackingTypesFindAllQueryDto extends PageLimitSearchQueryDto {
}
