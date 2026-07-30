-- StockReconciliation.meta — contexte de fabrication du document de réconciliation.
--
-- Pourquoi : un document est une photo figée. Sans marqueur, un écart produit par
-- une source manquante (ventes non rattachées, stock de départ issu d'un autre
-- match, lignes orphelines exclues) est indiscernable d'un manquant réel.
-- Fiches : docs/bugs/238_reco_post_event_ventes_non_jointes_avalees.md,
--          docs/bugs/241_getpreeventinventory_repli_legacy_hors_event.md
--
-- Idempotent : rejouable sans risque (même forme que
-- 2026-07-20_stockreconciliation_kind_post_event.sql).

ALTER TABLE "StockReconciliation" ADD COLUMN IF NOT EXISTS "meta" JSONB;

-- Documents antérieurs : meta NULL = contexte inconnu (ni « propre », ni
-- « dégradé ») — le front n'affiche alors aucun bandeau.
