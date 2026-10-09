import { Injectable } from '@nestjs/common';

/**
 * Périmètre d'un shop : appartenance au tenant, espace et configuration de rattachement.
 */
@Injectable()
export class SpaceMenuScopeService {

  /**
   * Condition 0 (spec utilisateur 2026-07-03) : un menu item n'est visible sur
   * /space-menus (Available OU Not Available) que s'il est associé à l'espace.
   * Association = STRICTEMENT une ligne `SpaceMenuItem` (table relationnelle, un item
   * peut appartenir à 1..N espaces) pour ce spaceId — alimentée par le select « Space »
   * du formulaire d'édition (contrat API `spaceIds` inchangé). Aucune ligne = associé
   * à aucun espace = invisible partout.
   * ⚠️ Pas de repli sur les MenuAssignment existants : une 1re version incluait les
   * items « déjà attachés à un shop de l'espace » (heal legacy) — explicitement
   * rejetée par l'utilisateur (item au champ Space vide qui s'affichait quand même).
   */
  spaceAssociationWhere(spaceId: string) {
    return { spaceLinks: { some: { spaceId } } };
  }

  /**
   * Config effective d'un shop pour lire ses assignations menu :
   * configId explicite (fourni par le front) > config du parent v1 (floor/forecourt/
   * externalMerch) > PREMIÈRE adhésion v2 (ordre createdAt — repli rétro-compat pour les
   * appelants qui n'envoient pas encore de configId ; arbitraire quand l'élément est
   * partagé entre configs, le front doit TOUJOURS l'envoyer).
   */
  resolveShopConfigId(
    shop: { floor?: any; forecourt?: any; externalMerch?: any; configurationElements?: any[] },
    explicitConfigId?: string,
  ): string | null {
    if (explicitConfigId) return explicitConfigId;
    const v1Config = shop.floor?.config ?? shop.forecourt?.config ?? shop.externalMerch?.config;
    return v1Config?.id ?? shop.configurationElements?.[0]?.configId ?? null;
  }

  /**
   * BUG-061 : clause d'appartenance tenant d'un SpaceElement (shop), dupliquée à l'identique
   * dans getShopMenu/getShopAvailableMenuItems/getShopInventory/getStorageInventory avant cette
   * factorisation — un shop appartient au tenant via son floor/forecourt/externalMerch (builder
   * v1) ou sa zone (builder v2, `ConfigurationElement`).
   */
  tenantShopOwnershipWhere(tenantId: string) {
    return {
      OR: [
        { floor: { config: { space: { tenantId } } } },
        { forecourt: { config: { space: { tenantId } } } },
        { externalMerch: { config: { space: { tenantId } } } },
        { zone: { space: { tenantId } } }, // Builder v2
      ],
    };
  }

  /**
   * BUG-061 : résolution du spaceId d'un shop — dupliquée à l'identique dans les 4 mêmes
   * méthodes. ⚠️ Suppose que le `select` Prisma de l'appelant inclut bien `spaceId` sur
   * floor/forecourt/externalMerch.config ET sur zone (cause racine de BUG-060 : un `select`
   * qui l'omettait empêchait silencieusement la résolution).
   */
  resolveShopSpaceId(shop: {
    floor?: any;
    forecourt?: any;
    externalMerch?: any;
    zone?: any;
  }): string | null {
    const config = shop.floor?.config ?? shop.forecourt?.config ?? shop.externalMerch?.config ?? null;
    return config?.spaceId ?? shop.zone?.spaceId ?? null;
  }
}
