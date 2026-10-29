-- Lien robuste ElementInventory -> MarketPrice par identifiant (survit au renommage).
ALTER TABLE "ElementInventory" ADD COLUMN "marketPriceId" TEXT;

CREATE INDEX "ElementInventory_marketPriceId_idx" ON "ElementInventory"("marketPriceId");

ALTER TABLE "ElementInventory" ADD CONSTRAINT "ElementInventory_marketPriceId_fkey" FOREIGN KEY ("marketPriceId") REFERENCES "MarketPrice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill : Market Price du MEME tenant dont le nom normalise (trim, espaces repliés, minuscules)
-- egale celui de la ligne. Tenant de la ligne via sa config, a defaut via l element
-- (zone, etage, parvis ou zone merch externe). Doublons de nom : le plus ancien (createdAt, id).
WITH mp_ranked AS (
  SELECT DISTINCT ON (mp."tenantId", lower(trim(regexp_replace(mp."itemName", '\s+', ' ', 'g'))))
         mp."tenantId" AS tenant_id,
         lower(trim(regexp_replace(mp."itemName", '\s+', ' ', 'g'))) AS norm_name,
         mp."id" AS mp_id
  FROM "MarketPrice" mp
  WHERE mp."deletedAt" IS NULL
  ORDER BY mp."tenantId", lower(trim(regexp_replace(mp."itemName", '\s+', ' ', 'g'))), mp."createdAt" ASC, mp."id" ASC
),
inv_tenant AS (
  SELECT ei."id" AS inv_id,
         lower(trim(regexp_replace(ei."name", '\s+', ' ', 'g'))) AS norm_name,
         COALESCE(
           sp_cfg."tenantId",
           sp_zone."tenantId",
           sp_floor."tenantId",
           sp_fc."tenantId",
           sp_em."tenantId"
         ) AS tenant_id
  FROM "ElementInventory" ei
  JOIN "SpaceElement" se ON se."id" = ei."elementId"
  LEFT JOIN "Config" c ON c."id" = ei."configId"
  LEFT JOIN "Space" sp_cfg ON sp_cfg."id" = c."spaceId"
  LEFT JOIN "Zone" z ON z."id" = se."zoneId"
  LEFT JOIN "Space" sp_zone ON sp_zone."id" = z."spaceId"
  LEFT JOIN "Floor" f ON f."id" = se."floorId"
  LEFT JOIN "Config" c_floor ON c_floor."id" = f."configId"
  LEFT JOIN "Space" sp_floor ON sp_floor."id" = c_floor."spaceId"
  LEFT JOIN "Forecourt" fc ON fc."id" = se."forecourtId"
  LEFT JOIN "Config" c_fc ON c_fc."id" = fc."configId"
  LEFT JOIN "Space" sp_fc ON sp_fc."id" = c_fc."spaceId"
  LEFT JOIN "ExternalMerch" em ON em."id" = se."externalMerchId"
  LEFT JOIN "Config" c_em ON c_em."id" = em."configId"
  LEFT JOIN "Space" sp_em ON sp_em."id" = c_em."spaceId"
  WHERE ei."marketPriceId" IS NULL
)
UPDATE "ElementInventory" ei
SET "marketPriceId" = r.mp_id
FROM inv_tenant it
JOIN mp_ranked r ON r.tenant_id = it.tenant_id AND r.norm_name = it.norm_name
WHERE ei."id" = it.inv_id;
