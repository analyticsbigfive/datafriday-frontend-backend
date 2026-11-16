import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Lecture groupée du détail de composants (`GET /menu-components/by-ids?ids=a,b,c`).
 *
 * Pourquoi : la feuille de course et le réarmement lisaient la recette de CHAQUE composant par
 * `GET /menu-components/:id` (43 appels à chaque ouverture d'Event Predict ou de Commandes, dont
 * la moitié refusée par le limiteur). La liste `GET /menu-components` porte les mêmes relations mais
 * elle est en cache Redis 1 h et `replaceIngredients` / `replaceChildren` ne l'invalident pas : une
 * recette modifiée y resterait périmée. Cette lecture-ci ne passe PAS par le cache et utilise le
 * même `include` que le détail : même contenu que `GET /menu-components/:id`, en une requête.
 */

/** Plafond d'ids par appel : au-delà, l'appelant découpe (la requête reste une URL). */
export const MENU_COMPONENT_BY_IDS_MAX = 100;

/** `"a,b,,a"` devient `['a', 'b']` : sans vide ni doublon, ordre d'arrivée conservé. */
export function parseComponentIds(raw: string): string[] {
  const ids = [...new Set(String(raw ?? '').split(',').map((s) => s.trim()).filter(Boolean))];
  if (ids.length > MENU_COMPONENT_BY_IDS_MAX) {
    throw new BadRequestException(`Trop d'identifiants (${ids.length}), ${MENU_COMPONENT_BY_IDS_MAX} au maximum par appel.`);
  }
  return ids;
}

/**
 * Filtre de lecture. Même règle d'accès que `findOne` / `findAll` : un compte restreint voit les
 * composants communs (sans espace) et ceux de ses espaces ; un composant hors périmètre ou supprimé
 * est simplement absent de la réponse (là où le détail répondait 403 / 404).
 */
export function buildByIdsWhere(
  ids: string[],
  tenantId: string,
  visible: 'ALL' | string[],
): Prisma.MenuComponentWhereInput {
  const where: Prisma.MenuComponentWhereInput = { id: { in: ids }, tenantId, deletedAt: null };
  if (visible !== 'ALL') {
    where.OR = [{ spaceIds: { isEmpty: true } }, { spaceIds: { hasSome: visible } }];
  }
  return where;
}
