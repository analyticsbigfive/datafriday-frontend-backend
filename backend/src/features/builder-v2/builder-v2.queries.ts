import { Prisma } from '@prisma/client';
import { SqlClient } from '../../core/database/sql-client';

/** Capacité de chaque configuration = somme des capacités de ses éléments. Restreint aux configurations des espaces du tenant. */
export function recomputeConfigCapacitiesSql(db: SqlClient, tenantId: string, unique: string[]): Promise<number> {
  return db.$executeRaw(Prisma.sql`
      UPDATE "Config" c
      SET capacity = COALESCE((
        SELECT SUM(COALESCE(se.capacity, 0))::int
        FROM "ConfigurationElement" ce
        JOIN "SpaceElement" se ON se.id = ce."elementId"
        WHERE ce."configId" = c.id
      ), 0)
      WHERE c.id = ANY(${unique})
        AND c."spaceId" IN (SELECT s.id FROM "Space" s WHERE s."tenantId" = ${tenantId})
    `);
}

/** État complet du Builder (espace, zones, éléments, configurations) en un seul aller-retour. */
export function builderStatePayload(db: SqlClient, tenantId: string, spaceId: string): Promise<Array<{ payload: any }>> {
  return db.$queryRaw<Array<{ payload: any }>>(Prisma.sql`
      WITH sp AS (
        SELECT s.id, s.name, s."maxCapacity"
        FROM "Space" s
        WHERE s.id = ${spaceId} AND s."tenantId" = ${tenantId}
      ),
      zone_rows AS (
        SELECT
          z.id, z.kind::text AS kind, z.name, z.level, z.width, z.length, z.height,
          z.geometry, z."sortIndex",
          COALESCE((
            SELECT json_agg(json_build_object(
              'id', se.id,
              'zoneId', se."zoneId",
              'name', se.name,
              'type', se.type::text,
              'subtypes', se.subtypes,
              'x', se.x, 'y', se.y,
              'width', COALESCE(se.width, 2), 'depth', COALESCE(se.depth, 2),
              'height3d', COALESCE(se."height3d", 2), 'rotation', COALESCE(se.rotation, 0),
              'cornerRadius', json_build_object(
                'topLeft', COALESCE(se."cornerRadiusTL", 0), 'topRight', COALESCE(se."cornerRadiusTR", 0),
                'bottomLeft', COALESCE(se."cornerRadiusBL", 0), 'bottomRight', COALESCE(se."cornerRadiusBR", 0)
              ),
              'capacity', se.capacity, 'image', se.image, 'notes', se.notes, 'area', se.area,
              'attributes', se.attributes, 'version', se.version,
              -- Perf/staff/inventaire scopés par CONFIG (clé '' = legacy sans config) :
              -- une entrée par config adhérente, le front lit sa config active.
              'performanceByConfig', COALESCE((
                SELECT json_object_agg(COALESCE(ep."configId", ''), json_build_object(
                  'revenue', ep.revenue, 'numberOfPOS', ep."numberOfPOS",
                  'numberOfTransactions', ep."numberOfTransactions",
                  'transactionsPerMinute', ep."transactionsPerMinute",
                  'staffCost', ep."staffCost", 'revenuePerEmployee', ep."revenuePerEmployee"
                )) FROM "ElementPerformance" ep WHERE ep."elementId" = se.id
              ), '{}'::json),
              'staffByConfig', COALESCE((
                SELECT json_object_agg(g.cfg, g.rows) FROM (
                  SELECT COALESCE(st."configId", '') AS cfg,
                         json_agg(json_build_object('id', st.id, 'position', st.position, 'count', st.count, 'hourlyRate', st."hourlyRate", 'roleId', st."roleId", 'source', st.source)) AS rows
                  FROM "ElementStaff" st WHERE st."elementId" = se.id GROUP BY 1
                ) g
              ), '{}'::json),
              'inventoryByConfig', COALESCE((
                SELECT json_object_agg(g.cfg, g.rows) FROM (
                  SELECT COALESCE(inv."configId", '') AS cfg,
                         json_agg(json_build_object('id', inv.id, 'name', inv.name, 'quantity', inv.quantity, 'unit', inv.unit,
                           'minStock', inv."minStock", 'maxStock', inv."maxStock", 'isCustom', inv."isCustom", 'menuItemId', inv."menuItemId")) AS rows
                  FROM "ElementInventory" inv WHERE inv."elementId" = se.id GROUP BY 1
                ) g
              ), '{}'::json),
              'configIds', COALESCE((
                SELECT json_agg(ce."configId") FROM "ConfigurationElement" ce WHERE ce."elementId" = se.id
              ), '[]'::json),
              'weezeventMapped', EXISTS(
                SELECT 1 FROM "WeezeventLocationShopMapping" wm
                WHERE wm."spaceElementId" = se.id AND wm."tenantId" = ${tenantId}
              ),
              'weezeventLocationName', (
                SELECT wl.name
                FROM "WeezeventLocationShopMapping" wm
                JOIN "WeezeventLocation" wl
                  ON (wl.id = wm."weezeventLocationId" OR wl."weezeventId" = wm."weezeventLocationId")
                 AND wl."tenantId" = ${tenantId}
                WHERE wm."spaceElementId" = se.id AND wm."tenantId" = ${tenantId}
                LIMIT 1
              ),
              'menuItemsCount', (
                -- DISTINCT : depuis le scoping par config, un élément partagé porte une
                -- ligne PAR config — ce count GLOBAL sert aux dialogues de suppression
                -- (supprimer l'élément touche toutes les configs).
                SELECT COUNT(DISTINCT ma."menuItemId")::int FROM "MenuAssignment" ma
                WHERE ma."elementId" = se.id AND ma.enabled = true
              ),
              'menuCountsByConfig', COALESCE((
                -- Affichage : les badges du builder montrent le count de la CONFIG ACTIVE
                -- (un item vendu en config A seulement ne doit pas apparaître sous B).
                SELECT json_object_agg(mc."configId", mc.cnt) FROM (
                  SELECT ma."configId", COUNT(DISTINCT ma."menuItemId")::int AS cnt
                  FROM "MenuAssignment" ma
                  WHERE ma."elementId" = se.id AND ma.enabled = true AND ma."configId" IS NOT NULL
                  GROUP BY ma."configId"
                ) mc
              ), '{}'::json)
            ))
            FROM "SpaceElement" se WHERE se."zoneId" = z.id
          ), '[]'::json) AS elements
        FROM "Zone" z
        WHERE z."spaceId" = ${spaceId}
      ),
      cfg AS (
        SELECT c.id, c.name, c."isSystem", c.capacity, c."createdAt"
        FROM "Config" c
        WHERE c."spaceId" = ${spaceId}
        ORDER BY c."isSystem" ASC, c."createdAt" ASC
      )
      SELECT json_build_object(
        'space', (SELECT row_to_json(sp) FROM sp),
        'zones', COALESCE((SELECT json_agg(row_to_json(zr)) FROM zone_rows zr), '[]'::json),
        'configurations', COALESCE((SELECT json_agg(row_to_json(cfg)) FROM cfg), '[]'::json)
      ) AS payload
    `);
}

/** Résumé des éléments avant suppression : zone, mapping Weezevent, nombre d'articles. `elementIds` non vide. */
export function describeElementsSql(db: SqlClient, tenantId: string, elementIds: string[]): Promise<Array<{
        id: string; name: string; zoneName: string;
        weezeventMapped: boolean; weezeventLocationName: string | null; menuItemsCount: number;
      }>> {
  return db.$queryRaw<Array<{
        id: string; name: string; zoneName: string;
        weezeventMapped: boolean; weezeventLocationName: string | null; menuItemsCount: number;
      }>>`
      SELECT se.id, se.name, z.name AS "zoneName",
        EXISTS(
          SELECT 1 FROM "WeezeventLocationShopMapping" wm
          WHERE wm."spaceElementId" = se.id AND wm."tenantId" = ${tenantId}
        ) AS "weezeventMapped",
        (
          SELECT wl.name
          FROM "WeezeventLocationShopMapping" wm
          JOIN "WeezeventLocation" wl
            ON (wl.id = wm."weezeventLocationId" OR wl."weezeventId" = wm."weezeventLocationId")
           AND wl."tenantId" = ${tenantId}
          WHERE wm."spaceElementId" = se.id AND wm."tenantId" = ${tenantId}
          LIMIT 1
        ) AS "weezeventLocationName",
        (SELECT COUNT(DISTINCT ma."menuItemId")::int FROM "MenuAssignment" ma WHERE ma."elementId" = se.id) AS "menuItemsCount"
      FROM "SpaceElement" se
      JOIN "Zone" z ON z.id = se."zoneId"
      WHERE se.id IN (${Prisma.join(elementIds)})
      ORDER BY z.name, se.name
    `;
}
