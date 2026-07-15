-- Migration: get_space_shop_details RPC
-- Replaces 8 sequential DB round-trips in NestJS getShopDetails with a single SQL call.
--
-- Performance strategy (Option A — split granular):
--   p_include_granular = false (default) → returns shops + events + meta in ~1-2s.
--   p_include_granular = true            → additionally returns shopGranularData
--                                          (heavy join, loaded in background).
--   Pre-compute v_location_ids (small set) so all WeezeventTransaction queries use the
--   indexed (tenantId, locationId) columns instead of joining through the mapping table.

-- Drop the old 4-param signature so the 5-param-with-default version below
-- becomes the canonical implementation reachable by all callers.
DROP FUNCTION IF EXISTS get_space_shop_details(text, text, int, int);

CREATE OR REPLACE FUNCTION get_space_shop_details(
  p_space_id        text,
  p_tenant_id       text,
  p_page            int     DEFAULT 1,
  p_limit           int     DEFAULT 20,
  p_include_granular boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config_ids        text[];
  v_shop_ids          text[];
  v_shop_ids_param    text[];
  v_location_ids      text[];   -- weezevent locationIds mapped to this space's shops
  v_eff_limit         int;
  v_offset            int;
  v_total_events      bigint;
  v_paginated_ids     text[];

  -- Output fragments
  v_shops_json        jsonb;
  v_granular_json     jsonb;
  v_events_json       jsonb;
  v_cost_map_json     jsonb;
BEGIN
  -- ── Ownership check ──────────────────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM "Space" WHERE id = p_space_id AND "tenantId" = p_tenant_id
  ) THEN
    RETURN jsonb_build_object('__error', 'space_not_found');
  END IF;

  -- ── RTT A: config IDs for this space ─────────────────────────────────────
  -- Config has no tenantId; ownership is guaranteed via Space (already checked above)
  SELECT ARRAY_AGG(c.id) INTO v_config_ids
  FROM "Config" c
  WHERE c."spaceId" = p_space_id;

  IF v_config_ids IS NULL OR array_length(v_config_ids, 1) = 0 THEN
    RETURN jsonb_build_object(
      'shops', '[]'::jsonb,
      'shopGranularData', '[]'::jsonb,
      'events', '[]'::jsonb,
      'menuItemCostMap', '{}'::jsonb,
      'meta', jsonb_build_object('page', p_page, 'limit', p_limit, 'total', 0, 'totalPages', 0)
    );
  END IF;

  -- ── RTT B: shop element IDs (floors + forecourts unified) ─────────────────
  SELECT ARRAY_AGG(se.id) INTO v_shop_ids
  FROM "SpaceElement" se
  WHERE se.type IN ('shop','fnb_food','fnb_beverages','fnb_bar','fnb_snack','fnb_icecream','merchshop')
    AND (
      EXISTS (
        SELECT 1 FROM "Floor" f
        WHERE f.id = se."floorId" AND f."configId" = ANY(v_config_ids)
      )
      OR
      EXISTS (
        SELECT 1 FROM "Forecourt" fc
        WHERE fc.id = se."forecourtId" AND fc."configId" = ANY(v_config_ids)
      )
    );

  -- Guard against empty spaces
  v_shop_ids_param := COALESCE(v_shop_ids, ARRAY['__no_shops__'::text]);

  -- Pagination params
  v_eff_limit := GREATEST(1, LEAST(200, p_limit));
  v_offset    := GREATEST(0, (p_page - 1) * p_limit);

  -- ── KEY OPTIMISATION: resolve locationIds once (small set) ───────────────
  -- WeezeventLocationShopMapping has O(shops) rows for this space — typically < 100.
  -- We compute the locationId set here so all downstream queries filter
  -- WeezeventTransaction by locationId (indexed) instead of joining the mapping.
  SELECT ARRAY_AGG(DISTINCT "weezeventLocationId") INTO v_location_ids
  FROM "WeezeventLocationShopMapping"
  WHERE "tenantId" = p_tenant_id
    AND "spaceElementId" = ANY(v_shop_ids_param);

  -- No Weezevent mappings → return shops only, no transaction data
  IF v_location_ids IS NULL OR array_length(v_location_ids, 1) = 0 THEN
    -- Still build the shops list below; skip granular + events
    v_total_events  := 0;
    v_paginated_ids := ARRAY[]::text[];
    v_granular_json := '[]'::jsonb;
    v_events_json   := '[]'::jsonb;
    v_cost_map_json := '{}'::jsonb;
  ELSE
    -- ── RTT E: total event count + paginated event IDs ──────────────────────
    -- Single scan of WeezeventTransaction filtered by locationId (indexed).
    CREATE TEMP TABLE _space_event_ids ON COMMIT DROP AS
      SELECT DISTINCT we.id, we."startDate"
      FROM "WeezeventTransaction" t
      INNER JOIN "WeezeventEvent" we
        ON we.id = t."eventId"
       AND we."tenantId" = p_tenant_id
      WHERE t."tenantId" = p_tenant_id
        AND t.status    = 'V'
        AND t."locationId" = ANY(v_location_ids);

    SELECT COUNT(*) INTO v_total_events FROM _space_event_ids;

    -- Paginated event IDs
    SELECT ARRAY_AGG(id ORDER BY "startDate" DESC NULLS LAST) INTO v_paginated_ids
    FROM (
      SELECT id, "startDate"
      FROM _space_event_ids
      ORDER BY "startDate" DESC NULLS LAST
      LIMIT v_eff_limit OFFSET v_offset
    ) sub;

    -- ── RTT F: granular per-event × shop — read from SpaceRevenueMinuteAgg ──
    -- Fast path: aggregated data already pre-computed by the BullMQ aggregation worker.
    -- Avoids the 31s raw-transaction scan; falls back to [] if no agg data exists yet.
    --
    -- NOTE: SpaceRevenueMinuteAgg.spaceElementId stores MenuItem.id (not SpaceElement.id).
    -- The real shop (SpaceElement) is resolved via weezeventLocationId →
    -- WeezeventLocationShopMapping → SpaceElement. Filter uses v_location_ids (indexed).
    IF p_include_granular AND v_paginated_ids IS NOT NULL AND array_length(v_paginated_ids, 1) > 0 THEN
      SELECT jsonb_agg(
        jsonb_build_object(
          'elementId',        g."elementId",
          'eventId',          g."datafridayEventId",
          'datafridayEventId',g."datafridayEventId",
          'eventName',        g."eventName",
          'eventDate',        g."eventDate",
          'shopId',           g."shopId",
          'shopName',         g."shopName",
          'shopType',         g."shopType",
          'shopArea',         g."shopArea",
          'menuItemId',       g."shopId",
          'menuItemName',     NULL,
          'menuItemPicture',  NULL,
          'menuItemType',     NULL,
          'menuItemCategory', NULL,
          'weezpayCategory',  NULL,
          'weezpayNature',    NULL,
          'weezpaySubnature', NULL,
          'itemCost',         NULL,
          'revenueHt',        g."revenueHt",
          'quantity',         g."itemsCount",
          'transactionCount', g."transactionsCount"
        )
      ) INTO v_granular_json
      FROM (
        SELECT
          (COALESCE(lsm."spaceElementId", srma."weezeventLocationId") || '_' || srma."weezeventEventId") AS "elementId",
          srma."weezeventEventId"                                              AS "datafridayEventId",
          COALESCE(ev_df.name, we.name, srma."weezeventEventId")              AS "eventName",
          COALESCE(ev_df."eventDate", we."startDate")                         AS "eventDate",
          COALESCE(lsm."spaceElementId", srma."weezeventLocationId")          AS "shopId",
          se.name                                                              AS "shopName",
          COALESCE(se.attributes::jsonb->>'originalType', se.type::text)      AS "shopType",
          se.attributes::jsonb->>'area'                                        AS "shopArea",
          SUM(srma."revenueHt")::numeric(12,2)                                AS "revenueHt",
          SUM(srma."itemsCount")::integer                                      AS "itemsCount",
          SUM(srma."transactionsCount")::integer                              AS "transactionsCount"
        FROM "SpaceRevenueMinuteAgg" srma
        LEFT JOIN "WeezeventLocationShopMapping" lsm
          ON lsm."weezeventLocationId" = srma."weezeventLocationId"
         AND lsm."tenantId"            = p_tenant_id
        LEFT JOIN "SpaceElement" se
          ON se.id = lsm."spaceElementId"
        LEFT JOIN "Event" ev_df
          ON ev_df.id        = srma."weezeventEventId"
         AND ev_df."tenantId" = p_tenant_id
        LEFT JOIN "WeezeventEvent" we
          ON we."tenantId"   = p_tenant_id
         AND we.id            = ANY(v_paginated_ids)
         AND DATE(we."startDate") = DATE(ev_df."eventDate")
        WHERE srma."tenantId"             = p_tenant_id
          AND srma."spaceId"              = p_space_id
          AND srma."weezeventLocationId"  = ANY(v_location_ids)
        GROUP BY
          lsm."spaceElementId", srma."weezeventEventId", srma."weezeventLocationId",
          ev_df.id, ev_df.name, ev_df."eventDate",
          we.id, we.name, we."startDate",
          se.name, se.type, se.attributes
      ) g;
    ELSE
      v_granular_json := '[]'::jsonb;
    END IF;

    -- ── RTT G+H: attendee counts + event metadata ───────────────────────────
    SELECT jsonb_agg(
      jsonb_build_object(
        'id',             ev.id,
        'name',           COALESCE(ev.name, ev.id),
        'eventName',      COALESCE(ev.name, ev.id),
        'date',           ev."startDate",
        'ticketsScanned', COALESCE(att."attendeeCount", 0),
        'attendees',      COALESCE(att."attendeeCount", 0),
        'isFuture',       (ev."startDate" IS NOT NULL AND ev."startDate" > NOW()),
        'doorsOpening',   ev.metadata::jsonb->>'doorsOpening',
        'showTime',       ev.metadata::jsonb->>'showTime',
        'category',       ev.metadata::jsonb->>'category',
        'eventType',      ev.metadata::jsonb->>'eventType',
        'team',           ev.metadata::jsonb->>'team',
        'visitingTeam',   ev.metadata::jsonb->>'visitingTeam',
        'hasIntermission',(ev.metadata::jsonb->>'hasIntermission')::boolean
      ) ORDER BY ev."startDate" DESC NULLS LAST
    ) INTO v_events_json
    FROM "WeezeventEvent" ev
    LEFT JOIN (
      SELECT "eventId", COUNT(id)::int AS "attendeeCount"
      FROM "WeezeventAttendee"
      WHERE "tenantId" = p_tenant_id
        AND "eventId"  = ANY(v_paginated_ids)
      GROUP BY "eventId"
    ) att ON att."eventId" = ev.id
    WHERE ev.id         = ANY(v_paginated_ids)
      AND ev."tenantId" = p_tenant_id;

    -- ── Build menuItemCostMap ───────────────────────────────────────────────
    SELECT jsonb_object_agg(key, value) INTO v_cost_map_json
    FROM (
      SELECT
        COALESCE(wpm."menuItemId", ti."productId") AS key,
        MIN(mi."totalCost")                         AS value
      FROM "WeezeventTransactionItem" ti
      LEFT JOIN "WeezeventProductMapping" wpm
        ON wpm."weezeventProductId" = ti."productId"
       AND wpm."tenantId" = p_tenant_id
      LEFT JOIN "MenuItem" mi
        ON mi.id = wpm."menuItemId"
      WHERE ti."transactionId" IN (
        SELECT t.id FROM "WeezeventTransaction" t
        WHERE t."tenantId"   = p_tenant_id
          AND t.status       = 'V'
          AND t."locationId" = ANY(v_location_ids)   -- indexed
          AND t."eventId"    = ANY(v_paginated_ids)
      )
        AND mi."totalCost" IS NOT NULL
      GROUP BY 1
    ) cost_data
    WHERE key IS NOT NULL;

  END IF; -- end of Weezevent branch

  -- ── Build shops list (per-shop summary) ────────────────────────────────────
  SELECT jsonb_agg(
    jsonb_build_object(
      'shopId',               se.id,
      'shopName',             se.name,
      'shopType',             COALESCE(se.attributes::jsonb->>'originalType', se.type::text),
      'shopSubTypes',         se."shopTypes",
      'configId',             c.id,
      'configName',           c.name,
      'locationId',           COALESCE(f.id, fc.id),
      'locationName',         COALESCE(f.name, fc.name),
      'locationType',         CASE WHEN f.id IS NOT NULL THEN 'floor' ELSE 'forecourt' END,
      'revenue',              COALESCE(rev."revenueHt", 0),
      'transactionCount',     COALESCE(rev."transactionsCount", 0),
      'itemsCount',           COALESCE(rev."itemsCount", 0),
      'isMappedToWeezevent',  (wm."weezeventLocationId" IS NOT NULL),
      'weezeventMerchantId',  wm."weezeventLocationId"
    )
  ) INTO v_shops_json
  FROM "SpaceElement" se
  LEFT JOIN "Floor" f      ON f.id  = se."floorId"      AND f."configId"  = ANY(v_config_ids)
  LEFT JOIN "Forecourt" fc ON fc.id = se."forecourtId"  AND fc."configId" = ANY(v_config_ids)
  INNER JOIN "Config" c
    ON c.id = COALESCE(f."configId", fc."configId")
  LEFT JOIN (
    SELECT "spaceElementId",
           SUM("revenueHt")         AS "revenueHt",
           SUM("transactionsCount") AS "transactionsCount",
           SUM("itemsCount")        AS "itemsCount"
    FROM "SpaceRevenueMinuteAgg"
    WHERE "tenantId"        = p_tenant_id
      AND "spaceId"         = p_space_id
      AND "spaceElementId"  = ANY(v_shop_ids_param)
    GROUP BY "spaceElementId"
  ) rev ON rev."spaceElementId" = se.id
  LEFT JOIN (
    SELECT DISTINCT ON ("spaceElementId") "spaceElementId", "weezeventLocationId"
    FROM "WeezeventLocationShopMapping"
    WHERE "tenantId"       = p_tenant_id
      AND "spaceElementId" = ANY(v_shop_ids_param)
  ) wm ON wm."spaceElementId" = se.id
  WHERE se.id = ANY(v_shop_ids_param);

  -- ── Return final response ─────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'shops',           COALESCE(v_shops_json,   '[]'::jsonb),
    'shopGranularData',COALESCE(v_granular_json,'[]'::jsonb),
    'events',          COALESCE(v_events_json,  '[]'::jsonb),
    'menuItemCostMap', COALESCE(v_cost_map_json,'{}'::jsonb),
    'meta', jsonb_build_object(
      'page',       p_page,
      'limit',      p_limit,
      'total',      v_total_events,
      'totalPages', CEIL(v_total_events::float / GREATEST(p_limit, 1))
    )
  );
END;
$$;

-- Grant execute to the authenticated and service_role roles used by Supabase
GRANT EXECUTE ON FUNCTION get_space_shop_details(text, text, int, int, boolean)
  TO authenticated, service_role, anon;
