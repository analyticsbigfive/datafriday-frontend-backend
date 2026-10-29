-- Controle LECTURE SEULE de la migration 20261030100000_element_inventory_buffer_in_units.
-- A lancer dans une transaction : begin read only; \i check-buffer-units.sql; rollback;
-- Contenance du colis = MarketPrice."packedUnits" ; conversion si marketPriceId non null,
-- quantity > 0 et contenance > 1. A lancer AVANT la migration (quantites encore en colis).

-- 1. Volumes
SELECT
  count(*)                                                          AS lignes_total,
  count(*) FILTER (WHERE ei."marketPriceId" IS NULL)                AS sans_market_price,
  count(*) FILTER (WHERE ei."quantity" > 0)                         AS avec_quantite,
  count(*) FILTER (WHERE ei."quantity" > 0 AND mp."packedUnits" > 1) AS a_convertir,
  count(*) FILTER (WHERE ei."quantity" > 0 AND ei."marketPriceId" IS NOT NULL
                   AND (mp."packedUnits" IS NULL OR mp."packedUnits" <= 1)) AS inchangees_contenance_absente_ou_1,
  count(*) FILTER (WHERE ei."quantity" > 0 AND mp."deletedAt" IS NOT NULL
                   AND mp."packedUnits" > 1)                        AS a_convertir_mp_supprime
FROM "ElementInventory" ei
LEFT JOIN "MarketPrice" mp ON mp."id" = ei."marketPriceId";

-- 2. Exemples avant / apres (les plus gros effets en premier)
SELECT ei."name",
       ei."quantity"                       AS quantite_actuelle_colis,
       mp."packedUnits"                    AS contenance,
       mp."unit"                           AS unite,
       ei."quantity" * mp."packedUnits"    AS quantite_convertie,
       ei."minStock", ei."maxStock"
FROM "ElementInventory" ei
JOIN "MarketPrice" mp ON mp."id" = ei."marketPriceId"
WHERE ei."quantity" > 0 AND mp."packedUnits" > 1
ORDER BY ei."quantity" * mp."packedUnits" DESC
LIMIT 30;

-- 3. Alerte : tampons deja suspects (quantite actuelle >= contenance, donc probablement deja en unites)
SELECT ei."name", ei."quantity", mp."packedUnits" AS contenance
FROM "ElementInventory" ei
JOIN "MarketPrice" mp ON mp."id" = ei."marketPriceId"
WHERE ei."quantity" >= mp."packedUnits" AND mp."packedUnits" > 1 AND ei."quantity" > 0
ORDER BY ei."quantity" DESC
LIMIT 30;
