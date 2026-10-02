import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { RedisService } from '../../../core/redis/redis.service';

/**
 * Configuration des menus d'un espace : lecture, version allégée par shop et enregistrement.
 */
@Injectable()
export class SpaceMenuConfigurationService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  private readonly logger = new Logger(SpaceMenuConfigurationService.name);

  /**
   * Invalidations croisées après une écriture d'assignation menu : sans elles, le front
   * relisait des compteurs/lists périmés même avec un forceRefresh (cause racine des
   * « je dois hard-refresh » sur /space-menus).
   * ⚠️ Les motifs de clés dupliquent ceux de MenuItemsService.cacheKey et
   * SpaceCacheService.SPACE_SHOPS_CACHE_KEY — à garder synchronisés.
   */
  private async invalidateAfterAssignmentWrite(tenantId: string, spaceId: string) {
    await Promise.all([
      this.redis.deletePattern(`menu-items:${tenantId}:*`),
      this.redis.deletePattern(`spaces:shops:${tenantId}:${spaceId}*`),
    ]);
  }

  /**
   * Get menu assignments for all elements in a config
   * Returns { [elementId]: { [menuItemId]: boolean } }
   */
  async getMenuConfiguration(spaceId: string, configId: string, tenantId: string) {
    this.logger.debug(`Getting menu config for space=${spaceId} config=${configId} tenant=${tenantId}`);

    // Vérifie que la config appartient bien à CET espace ET à CE tenant — sans ce check,
    // n'importe quel utilisateur authentifié pouvait passer le configId d'un autre tenant et
    // récupérer sa matrice d'assignation menu (fuite cross-tenant, aucune vérification avant).
    const config = await this.prisma.config.findFirst({
      where: { id: configId, spaceId, space: { tenantId } },
      select: { id: true },
    });
    if (!config) {
      return { spaceId, configId, menuItems: {} };
    }

    // Get all elements belonging to floors/forecourt/externalMerch de cette config.
    // Assignations filtrées par configId : un élément v2 partagé entre configs ne doit
    // renvoyer QUE les lignes de la config demandée (scoping par configuration).
    const elements = await this.prisma.spaceElement.findMany({
      where: {
        OR: [
          { floor: { configId } },
          { forecourt: { configId } },
          { externalMerch: { configId } },
          { configurationElements: { some: { configId } } }, // Builder v2
        ],
      },
      select: {
        id: true,
        // BUG-058 (réplique du fix BUG-051) : un MenuItem soft-deleted ne doit jamais apparaître
        // dans la matrice d'assignation, même s'il a encore une ligne MenuAssignment.
        menuAssignments: {
          where: { configId, menuItem: { deletedAt: null } },
          select: { menuItemId: true, enabled: true },
        },
      },
    } as any);

    // Build the { elementId: { menuItemId: boolean } } map
    const menuItems: Record<string, Record<string, boolean>> = {};
    for (const el of elements) {
      if ((el as any).menuAssignments?.length) {
        menuItems[el.id] = {};
        for (const a of (el as any).menuAssignments) {
          menuItems[el.id][a.menuItemId] = a.enabled;
        }
      }
    }

    return { spaceId, configId, menuItems };
  }

  /**
   * Version LÉGÈRE de "menu items assignés par shop, pour tout un config" — un seul
   * appel/une seule requête au lieu de N appels à getShopMenu (un par shop), chacun
   * remontant la structure imbriquée complète (composants→ingrédients, pricing…).
   * Ne renvoie que ce dont la page Analyse a besoin pour reconstruire l'assignation
   * par shop : id/nom/catégorie/basePrice des articles ENABLED. Pas de pricing/recette
   * ici — si un futur consommateur en a besoin, utiliser getShopMenu (par shop).
   *
   * ⚠️ Règle DURE (BUG-199) : ne JAMAIS ajouter ici un champ volumineux porté par le
   * MenuItem (photo, description longue, blob…). La sélection est par ligne
   * d'assignation : tout champ ajouté est réémis autant de fois que l'article est
   * assigné à un PdV. C'est ce qui a fait passer cette réponse à 5,6 Mo / 53 s.
   */
  async getConfigShopMenuItemsLight(
    spaceId: string,
    configId: string,
    tenantId: string,
    options: { itemsScope?: 'config' | 'space'; shopsScope?: 'config' | 'space' } = {},
  ) {
    const config = await this.prisma.config.findFirst({
      where: { id: configId, spaceId, space: { tenantId } },
      select: { id: true },
    });
    if (!config) return {};

    // BUG-383-02 (règle Bertrand 2026-09-15) : pour l'inventaire pre/post-event, les PdV
    // restent ceux de LA configuration de l'event (les points de vente ouverts ce soir-là),
    // mais les articles à compter par PdV sont l'union de toutes les configurations de
    // l'espace : le stock est physique et le même quel que soit le match (foot et rugby
    // mélangés, assumé). `config` (défaut) garde le comportement historique (Analyse, Space Menu).
    const assignmentWhere =
      options.itemsScope === 'space'
        ? { enabled: true, menuItem: { deletedAt: null }, config: { spaceId } }
        : { configId, enabled: true, menuItem: { deletedAt: null } };

    // « Voir tout l'inventaire » (post-event) : dans certains cas il faut tout compter, donc
    // les PdV de TOUTES les configurations de l'espace, pas seulement ceux de l'event.
    // Défaut 'config' : les PdV ouverts pour l'event (règle BUG-383-02 inchangée).
    const elementConfig = options.shopsScope === 'space' ? { config: { spaceId } } : { configId };
    const elements = await this.prisma.spaceElement.findMany({
      where: {
        OR: [
          { floor: elementConfig },
          { forecourt: elementConfig },
          { externalMerch: elementConfig },
          { configurationElements: { some: elementConfig } }, // Builder v2
        ],
      },
      select: {
        id: true,
        name: true,
        // BUG-058 (réplique du fix BUG-051) : un MenuItem soft-deleted ne doit jamais apparaître
        // ici (sert la page Analyse) même s'il a encore une ligne MenuAssignment(enabled: true).
        menuAssignments: {
          where: assignmentWhere,
          select: {
            menuItem: {
              // basePrice : additif (2026-07-18) — permet à Space Inventory de
              // consommer ce batch au lieu d'un GET shop/:shopId par shop
              // (N+1, cf. fiche BUG-010 backend). Scalaire, coût nul.
              //
              // `picture` est VOLONTAIREMENT absent (BUG-199) : la sélection se fait
              // par ligne d'assignation, donc un article présent dans N PdV voyait sa
              // photo sérialisée N fois. Les photos sont stockées en base64 dans
              // MenuItem.picture — un seul article de 915 ko × 15 assignations = 13 Mo
              // sur une réponse dont tout le reste pèse 38 ko (53 s de chargement).
              // La vignette se résout depuis le catalogue (GET /menu-items, qui porte
              // `picture` UNE fois par article). Même réflexe que
              // `marketPriceSelectNoImage` dans menu-items.service.ts.
              select: {
                id: true,
                name: true,
                basePrice: true,
                productCategory: { select: { name: true } },
              },
            },
          },
        },
      } as any,
    });

    const out: Record<string, { shopName: string; items: { id: string; name: string; category: string; basePrice: number | null }[] }> = {};
    for (const el of elements as any[]) {
      const seen = new Set<string>();
      const items = (el.menuAssignments || [])
        .map((a: any) => a.menuItem)
        // Un même article assigné à ce PdV dans plusieurs configurations (itemsScope 'space') : une seule ligne.
        .filter((mi: any) => mi && !seen.has(mi.id) && seen.add(mi.id))
        .map((mi: any) => ({
          id: mi.id,
          name: mi.name,
          category: mi.productCategory?.name || '',
          basePrice: mi.basePrice != null ? Number(mi.basePrice) : null,
        }));
      if (items.length) out[el.id] = { shopName: el.name, items };
    }
    return out;
  }

  /**
   * Save menu assignments for elements in a config
   * Input: { [elementId]: { [menuItemId]: boolean } }
   */
  async saveMenuConfiguration(
    spaceId: string,
    configId: string,
    menuItems: Record<string, Record<string, boolean>>,
    tenantId: string,
  ) {
    this.logger.log(`Saving menu config for space=${spaceId} config=${configId} tenant=${tenantId}`);

    // Même vérification que getMenuConfiguration côté écriture : sans elle, un utilisateur
    // authentifié pouvait passer un elementId/menuItemId d'un AUTRE tenant et modifier ses
    // assignations menu (upsert MenuAssignment aveugle, aucune vérification avant). On ne
    // traite que les elementId qui appartiennent réellement à cette config+tenant, et les
    // menuItemId qui appartiennent réellement à ce tenant — le reste est silencieusement ignoré.
    const config = await this.prisma.config.findFirst({
      where: { id: configId, spaceId, space: { tenantId } },
      select: { id: true },
    });
    if (!config) {
      throw new NotFoundException('Configuration not found for this space/tenant');
    }

    const [validElements, validMenuItems] = await Promise.all([
      this.prisma.spaceElement.findMany({
        where: {
          id: { in: Object.keys(menuItems) },
          OR: [
            { floor: { configId } },
            { forecourt: { configId } },
            { externalMerch: { configId } },
            { configurationElements: { some: { configId } } }, // Builder v2
          ],
        },
        select: { id: true },
      }),
      // BUG-058 (réplique du fix BUG-051) : un menuItemId soft-deleted ne doit jamais être accepté
      // comme valide côté écriture, même si l'appelant l'envoie encore (state front périmé).
      this.prisma.menuItem.findMany({
        where: {
          id: { in: [...new Set(Object.values(menuItems).flatMap((items) => Object.keys(items)))] },
          tenantId,
          deletedAt: null,
        },
        select: { id: true },
      }),
    ]);
    const validElementIds = new Set(validElements.map((e) => e.id));
    const validMenuItemIds = new Set(validMenuItems.map((m) => m.id));

    // Ids réellement activés (calculés une seule fois, réutilisés par la transaction) —
    // BUG-063 : une valeur `enabled` non strictement booléenne (payload malformé) est ignorée
    // ici comme un id invalide, plutôt que de remonter jusqu'à Prisma sous forme d'erreur opaque.
    const enabledMenuItemIds = [
      ...new Set(
        Object.values(menuItems)
          .flatMap((items) => Object.entries(items))
          .filter(([menuItemId, enabled]) => enabled === true && validMenuItemIds.has(menuItemId))
          .map(([menuItemId]) => menuItemId),
      ),
    ];

    await this.prisma.$transaction(async (tx) => {
      // Upsert PARTIEL uniquement : ne touche QUE les menuItemId présents dans le payload.
      // ⚠️ Avant : un `deleteMany({menuItemId: {notIn: activeMenuItemIds}})` supprimait
      // TOUTE assignation de ce shop absente du payload — correct seulement si l'appelant
      // envoie l'état complet désiré. Or 2 des 3 appelants front envoient un DELTA (un seul
      // item togglé depuis SpaceMenuItemView, ou seulement les items modifiés depuis
      // ShopMenuItemsDrawer) : chaque toggle/save partiel effaçait silencieusement tous les
      // autres menu items déjà assignés à ce shop. Le 3e appelant (EventPredictView) envoie
      // déjà l'état complet ("préserve l'existant") donc rien ne change pour lui.
      const pairs = Object.entries(menuItems)
        .filter(([elementId]) => validElementIds.has(elementId))
        .flatMap(([elementId, items]) =>
          Object.entries(items)
            .filter(([menuItemId, enabled]) => validMenuItemIds.has(menuItemId) && typeof enabled === 'boolean')
            .map(([menuItemId, enabled]) => ({ elementId, menuItemId, enabled: enabled as boolean })),
        );
      // Trois requêtes au lieu d'un upsert par article : création des affectations absentes,
      // puis mise à jour groupée des articles activés et des articles désactivés.
      if (pairs.length) {
        await (tx as any).menuAssignment.createMany({
          data: pairs.map((p) => ({ elementId: p.elementId, menuItemId: p.menuItemId, configId, enabled: p.enabled })),
          skipDuplicates: true,
        });
        for (const enabled of [true, false]) {
          const byElement = new Map<string, string[]>();
          for (const p of pairs) {
            if (p.enabled !== enabled) continue;
            byElement.set(p.elementId, [...(byElement.get(p.elementId) ?? []), p.menuItemId]);
          }
          if (!byElement.size) continue;
          // eslint-disable-next-line no-await-in-loop -- deux passes (activés, désactivés), une requête chacune
          await (tx as any).menuAssignment.updateMany({
            where: {
              configId,
              enabled: !enabled,
              OR: [...byElement].map(([elementId, menuItemIds]) => ({ elementId, menuItemId: { in: menuItemIds } })),
            },
            data: { enabled },
          });
        }
      }

      // Attacher un item à un shop = l'associer à l'espace (condition 0) : lignes SpaceMenuItem
      // pour les items activés qui n'en ont pas encore. Sans ça, la vue « By Menu Item »
      // (GET /menu-items?spaceId= filtre sur l'association) affichait « Aucun menu item »
      // alors que des items venaient d'être attachés.
      // Additif uniquement : détacher d'un shop ne désassocie pas de l'espace.
      // (validMenuItemIds = déjà vérifiés tenant ; spaceId = vérifié via la config plus haut.)
      // BUG-059 : déplacé DANS la même transaction que les upserts menuAssignment ci-dessus —
      // avant, cette écriture tournait sur `this.prisma` après le commit de la transaction,
      // pouvant laisser des MenuAssignment(enabled:true) sans SpaceMenuItem correspondant si
      // cette 2e écriture échouait (l'item devient alors invisible partout malgré `enabled=true`,
      // exactement le bug que ce bloc a pour but de prévenir).
      if (enabledMenuItemIds.length) {
        await (tx as any).spaceMenuItem.createMany({
          data: enabledMenuItemIds.map((menuItemId) => ({ menuItemId, spaceId })),
          skipDuplicates: true,
        });
      }
    });

    // Compteurs shops (Redis 30s) + listes menu-items (Redis 60s) : sans invalidation,
    // même un refetch forceRefresh du front resservait l'état d'avant l'écriture.
    await this.invalidateAfterAssignmentWrite(tenantId, spaceId);

    return this.getMenuConfiguration(spaceId, configId, tenantId);
  }
}
