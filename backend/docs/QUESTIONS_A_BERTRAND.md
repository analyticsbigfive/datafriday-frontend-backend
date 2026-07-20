# Questions à Bertrand — tracker de clarification

> On n'a pas de base de code auto-porteuse : la compréhension fonctionnelle réelle passe par
> Bertrand (review, test, validation). Ce fichier évite que chacun tranche seul dans son coin une
> incompréhension du code ou d'une fonctionnalité — ce qui est la source la plus fréquente de bugs
> et de conflits sur ce projet (voir [`docs/bugs/00_INDEX.md`](bugs/00_INDEX.md), plusieurs bugs
> viennent de deux devs ayant chacun implémenté sa propre interprétation de la même règle).

## Comment l'utiliser

1. Bloqué sur une incompréhension (code, règle métier, comportement attendu) → ajouter une ligne
   ci-dessous, statut 🔴.
2. Poser la question à Bertrand.
3. Une fois répondu : mettre à jour la doc canonique concernée (page de module dans
   `datafriday-web/docs/modules/`, [`docs/adr/`](adr/00_INDEX.md), ou
   [`docs/bugs/`](bugs/00_INDEX.md) si la réponse révèle un bug) — **et le code si la réponse
   implique un renommage/commentaire/refactor** — puis lier la mise à jour ici et passer le
   statut à 🟢.
4. **Ne jamais merger un code qui repose sur une hypothèse encore marquée 🔴.**

Même mécanique pour une fonctionnalité neuve : confronter le cahier des charges au code existant,
lister ici ce qui reste ambigu, trancher avec Bertrand avant d'écrire le code définitif.

## Questions ouvertes

| # | Question | Domaine | Posée par | Date | Statut | Repliée dans |
|---|---|---|---|---|---|---|
| 1 | Inventaire — lignes `InventoryCount` avec `shopId=NULL` : quelle sémantique métier (comptage « niveau espace » ?) ? Elles sont inadressables par la shape front `{[shopId]: …}` et donc ignorées en lecture (le fix 2026-07-18 de BUG-94 les contourne en repliant sur le snapshot). Si elles doivent s'afficher : convenir d'une clé sentinelle + adaptation front. | Stock (Inventory) | Audit /analyse+predict+stock (Claude, session 2026-07-18) | 2026-07-18 | 🔴 | [`bugs/94_buildinventorycounts_perd_lignes_shopid_null.md`](bugs/94_buildinventorycounts_perd_lignes_shopid_null.md) |
| 2 | `EventPredictVersion.tenantId` nullable : les lignes NULL sont invisibles de toutes les requêtes (scopées tenant). Backfill via `eventId → Event.tenantId` quand l'event existe, mais que faire des orphelines (event supprimé) — rattacher, supprimer ? Décision préalable au passage NOT NULL. | Prévision | Audit /analyse+predict+stock (Claude, session 2026-07-18) | 2026-07-18 | 🔴 | [`bugs/98_eventpredictversion_tenantid_nullable.md`](bugs/98_eventpredictversion_tenantid_nullable.md) |
| 3 | `StockLevel.elementId` sans FK vers `SpaceElement` : niveaux orphelins (delete+recreate de config v1) compensés en lecture par `getStock`. Purge des orphelins autorisée (préalable à la FK), et quelle sémantique — `ON DELETE CASCADE` ou `SET NULL` ? | Stock (Logistique) | Audit /analyse+predict+stock (Claude, session 2026-07-18) | 2026-07-18 | 🔴 | [`bugs/101_stocklevel_elementid_sans_fk.md`](bugs/101_stocklevel_elementid_sans_fk.md) |
| 4 | Déploiement audit 2026-07-18 : deux scripts SQL rejouables à exécuter (`prisma/sql/2026-07-18_inventorycount_unique_nulls_not_distinct.sql` — inclut un DÉDOUBLONNAGE destructif-par-conception des `InventoryCount` en conflit, garde la ligne la plus récente ; `prisma/sql/2026-07-18_perf_indexes_predict_inventory.sql` — index additifs). Valider le dédoublonnage et la fenêtre d'exécution. | Stock / Prévision | Audit /analyse+predict+stock (Claude, session 2026-07-18) | 2026-07-18 | 🔴 | [`bugs/93_inventorycount_toctou_unique_nulls.md`](bugs/93_inventorycount_toctou_unique_nulls.md), [`bugs/99_index_perf_manquants_predict_inventory.md`](bugs/99_index_perf_manquants_predict_inventory.md) |

## Questions résolues

| # | Question | Réponse (résumé) | Repliée dans |
|---|---|---|---|
| — | | | |
