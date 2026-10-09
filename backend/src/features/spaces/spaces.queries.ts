import { Prisma } from '@prisma/client';
import { SqlClient } from '../../core/database/sql-client';

/** Existence de l'espace et ses PdV (shops) avec leur rattachement Weezevent, en un seul aller-retour. */
export function spaceShopsPayload(db: SqlClient, tenantId: string, spaceId: string, configFilter: Prisma.Sql, shopTypes: string[]): Promise<Array<{ space_exists: boolean; shops: any }>> {
  return db.$queryRaw<Array<{ space_exists: boolean; shops: any }>>(Prisma.sql`
      WITH target_configs AS (
        SELECT c.id, c.name
        FROM "Config" c
        JOIN "Space" sp ON sp.id = c."spaceId" AND sp."tenantId" = ${tenantId}
        WHERE c."spaceId" = ${spaceId}
        ${configFilter}
      ),
      floor_shops AS (
        SELECT se.id, se.name, se.slug, se.type::text AS type, se."shopTypes", se.attributes, se.image, se.notes,
               f."configId" AS "configId", tc.name AS "configName",
               f.id AS "locationId", f.name AS "locationName", f.level::text AS "floorLevel"
        FROM "SpaceElement" se
        JOIN "Floor" f ON f.id = se."floorId"
        JOIN target_configs tc ON tc.id = f."configId"
        -- zoneId IS NULL : un élément migré en v2 ne sort que par la branche zone_shops
        WHERE se.type::text = ANY(${shopTypes}) AND se."zoneId" IS NULL
      ),
      forecourt_shops AS (
        SELECT se.id, se.name, se.slug, se.type::text AS type, se."shopTypes", se.attributes, se.image, se.notes,
               fc."configId" AS "configId", tc.name AS "configName",
               fc.id AS "locationId", fc.name AS "locationName", 'forecourt' AS "floorLevel"
        FROM "SpaceElement" se
        JOIN "Forecourt" fc ON fc.id = se."forecourtId"
        JOIN target_configs tc ON tc.id = fc."configId"
        WHERE se.type::text = ANY(${shopTypes}) AND se."zoneId" IS NULL
      ),
      externalmerch_shops AS (
        SELECT se.id, se.name, se.slug, se.type::text AS type, se."shopTypes", se.attributes, se.image, se.notes,
               em."configId" AS "configId", tc.name AS "configName",
               em.id AS "locationId", em.name AS "locationName", 'externalmerch' AS "floorLevel"
        FROM "SpaceElement" se
        JOIN "ExternalMerch" em ON em.id = se."externalMerchId"
        JOIN target_configs tc ON tc.id = em."configId"
        WHERE se.type::text = ANY(${shopTypes}) AND se."zoneId" IS NULL
      ),
      -- Builder v2 : éléments rattachés à une Zone (par ESPACE). Le scoping par config
      -- passe par les adhésions ConfigurationElement ; sous-types v2 exposés en
      -- "shopTypes" (compat consommateurs). floorLevel : FLOOR → level, sinon la zone.
      --
      -- UNE LIGNE PAR (élément, config), PAS par élément. Un élément v2 est PARTAGÉ entre
      -- configs (créer une config par clonage copie ses adhésions, cf. builder-v2.service
      -- createConfiguration). Un DISTINCT ON (se.id) seul n'émettait qu'une ligne par
      -- élément, taguée de son adhésion la PLUS ANCIENNE (ORDER BY ce."createdAt") : toute
      -- config clonée disparaissait de la réponse « toutes configs », et les consommateurs
      -- qui refiltrent côté client sur configId (EventPredictView, SpaceRestockView)
      -- voyaient 0 point de vente alors que Space Menus — qui passe ?configId= et
      -- court-circuite ce DISTINCT — en listait (BUG-286-01). Le DISTINCT ON est CONSERVÉ
      -- sur le couple, mais c'est un no-op garanti par la PK ConfigurationElement
      -- @@id([configId, elementId]) : au plus une adhésion par (config, élément).
      -- Corollaire : le menuItemsCount du LEFT JOIN LATERAL plus bas (scopé sur
      -- a."configId") devient enfin juste pour CHAQUE config, et plus seulement pour la
      -- plus ancienne.
      zone_shops AS (
        SELECT DISTINCT ON (se.id, ce."configId")
               se.id, se.name, se.slug, se.type::text AS type,
               CASE WHEN cardinality(se.subtypes) > 0 THEN se.subtypes ELSE se."shopTypes" END AS "shopTypes",
               se.attributes, se.image, se.notes,
               ce."configId" AS "configId", tc.name AS "configName",
               z.id AS "locationId", z.name AS "locationName",
               CASE z.kind::text
                 WHEN 'FLOOR' THEN z.level::text
                 WHEN 'FORECOURT' THEN 'forecourt'
                 ELSE 'externalmerch'
               END AS "floorLevel"
        FROM "SpaceElement" se
        JOIN "Zone" z ON z.id = se."zoneId" AND z."spaceId" = ${spaceId}
        JOIN "ConfigurationElement" ce ON ce."elementId" = se.id
        JOIN target_configs tc ON tc.id = ce."configId"
        WHERE se.type::text = ANY(${shopTypes})
        -- Postgres impose que les expressions du DISTINCT ON soient les premières de
        -- l'ORDER BY, dans le même ordre. Plus de départage sur ce."createdAt" : le
        -- couple (élément, config) est déjà unique.
        ORDER BY se.id, ce."configId"
      ),
      all_shops AS (
        SELECT * FROM floor_shops
        UNION ALL
        SELECT * FROM forecourt_shops
        UNION ALL
        SELECT * FROM externalmerch_shops
        UNION ALL
        SELECT * FROM zone_shops
      ),
      enriched AS (
        -- BUG-320-02 : un "LEFT JOIN WeezeventLocationShopMapping" simple duplique la ligne du
        -- shop quand PLUSIEURS locations (typiquement une par intégration, cas de 2 intégrations
        -- mappées au même space, chacune mappant sa propre location vers le même SpaceElement —
        -- LocationShopMapping.spaceElementId n'a aucune contrainte unique) pointent vers le même
        -- SpaceElement. Sous-requêtes scalaires : au plus UNE ligne par (élément, config), quel
        -- que soit le nombre de mappings pointant vers cet élément. weezeventLocationId/
        -- isMappedToWeezevent ne sont consommés par aucun front connu aujourd'hui (grep exhaustif)
        -- — conservés pour compat, "OR logique" sur isMappedToWeezevent plutôt qu'un pick arbitraire.
        SELECT
          a.*,
          (
            SELECT wm."weezeventLocationId" FROM "WeezeventLocationShopMapping" wm
            WHERE wm."spaceElementId" = a.id AND wm."tenantId" = ${tenantId}
            ORDER BY wm."weezeventLocationId" LIMIT 1
          ) AS "weezeventLocationId",
          EXISTS(
            SELECT 1 FROM "WeezeventLocationShopMapping" wm
            WHERE wm."spaceElementId" = a.id AND wm."tenantId" = ${tenantId}
          ) AS "isMappedToWeezevent",
          COALESCE(ma.cnt, 0) AS "menuItemsCount"
        FROM all_shops a
        LEFT JOIN LATERAL (
          -- Compteur scopé par la config de la ligne : un élément v2 partagé porte une
          -- assignation PAR config — sans ce filtre, le badge sommerait toutes les configs.
          SELECT COUNT(*)::int AS cnt FROM "MenuAssignment" m
          WHERE m."elementId" = a.id AND m.enabled = true AND m."configId" = a."configId"
        ) ma ON true
      )
      SELECT
        EXISTS(SELECT 1 FROM "Space" WHERE id = ${spaceId} AND "tenantId" = ${tenantId}) AS space_exists,
        -- ORDER BY explicite : sans lui, l'ordre des lignes est arbitraire et peut varier
        -- d'une requête à l'autre. Depuis qu'un élément partagé sort une fois PAR config,
        -- un consommateur en premier-arrivé-gagne (ex. StepMapShops, qui affiche le
        -- configName suggéré) verrait sa suggestion changer d'un rechargement à l'autre.
        COALESCE(
          (SELECT json_agg(enriched ORDER BY enriched.id, enriched."configId") FROM enriched),
          '[]'::json
        ) AS shops
    `);
}

/** Détail des PdV d'un espace (fonction SQL get_space_shop_details). */
export function spaceShopDetails(db: SqlClient, tenantId: string, spaceId: string, page: number, limit: number, includeGranular: boolean): Promise<Array<{ get_space_shop_details: any }>> {
  return db.$queryRaw<Array<{ get_space_shop_details: any }>>`
          SELECT get_space_shop_details(${spaceId}, ${tenantId}, ${page}::int, ${limit}::int, ${includeGranular}::boolean)
        `;
}

/** Ventes d'un event par minute et par PdV (timeline), fenêtre et périmètre déjà résolus. */
export function eventTimelineRows(db: SqlClient, tenantId: string, integrationClause: Prisma.Sql, effectiveWindowStart: Date, shopScopeClause: Prisma.Sql): Promise<Array<{ since: Date | null }>> {
  return db.$queryRaw<Array<{ since: Date | null }>>(Prisma.sql`
      SELECT MIN(t."transactionDate") AS since
      FROM "WeezeventTransaction" t
      LEFT JOIN "WeezeventLocationShopMapping" mem
        ON mem."weezeventLocationId" = t."locationId"
       AND mem."tenantId" = ${tenantId}
      WHERE t."tenantId" = ${tenantId}
        ${integrationClause}
        AND t.status = 'V'
        AND t."deletedAt" IS NULL
        AND t."transactionDate" >= ${effectiveWindowStart}
        AND ${shopScopeClause}
    `);
}

/**
 * Première vente validée de chaque PdV depuis `since` (LIMIT 1 sur l'index tenantId/locationId/
 * transactionDate) : coût proportionnel au nombre de lieux, pas au volume du match.
 * EXPLAIN prod 2026-10-07 (La Beaujoire, 37 lieux) : index scans, ~25 ms à froid.
 */
export function firstValidSaleByElementRows(db: SqlClient, tenantId: string, integrationClause: Prisma.Sql, since: Date, shopIds: string[]): Promise<Array<{ elementId: string; firstAt: Date }>> {
  return db.$queryRaw<Array<{ elementId: string; firstAt: Date }>>(Prisma.sql`
      SELECT mem."spaceElementId" AS "elementId", MIN(first_sale."transactionDate") AS "firstAt"
      FROM "WeezeventLocationShopMapping" mem
      CROSS JOIN LATERAL (
        SELECT t."transactionDate"
        FROM "WeezeventTransaction" t
        WHERE t."tenantId" = ${tenantId}
          AND t."locationId" = mem."weezeventLocationId"
          ${integrationClause}
          AND t.status = 'V'
          AND t."deletedAt" IS NULL
          AND t."transactionDate" >= ${since}
        ORDER BY t."transactionDate"
        LIMIT 1
      ) first_sale
      WHERE mem."tenantId" = ${tenantId}
        AND mem."spaceElementId" = ANY(${shopIds})
      GROUP BY mem."spaceElementId"
    `);
}
