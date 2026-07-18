# Bugs — index

> Un fichier par bug, format défini par [`TEMPLATE.md`](TEMPLATE.md). Bugs backend ou transverses
> (avec impact backend) ici ; bugs purement frontend dans
> [`datafriday-web/docs/bugs/00_INDEX.md`](../../../datafriday-web/docs/bugs/00_INDEX.md).
>
> **But** : un dev ou un agent doit pouvoir, avant de toucher au code d'un module, vérifier ici
> s'il y a un bug connu — pour ne pas recorriger deux fois la même chose, ni construire par-dessus
> un défaut déjà identifié.
>
> Statut : 🔴 Ouvert · 🟡 Corrigé non déployé · 🟢 Corrigé · ⚪ Diagnostiqué · ⚫ Won't fix

| # | Titre | Statut | Sévérité | Domaine |
|---|---|---|---|---|
| [01](01_cout_menucomponent_surestime.md) | Coût MenuComponent surestimé (`numberOfUnitsRecipe` ignoré) | 🔴 Ouvert | 🔴 | Menu & recettes |
| [02](02_double_regle_combo_incompatible.md) | Deux règles d'expansion combo incompatibles | 🔴 Ouvert | 🟠 | Menu & recettes / Stock |
| [03](03_taxonomie_croisee_marketprice_menuitem.md) | Taxonomie croisée Market Price / Menu Item | 🟢 Corrigé | 🟠 | Achats & référentiels |
| [04](04_mappings_orphelins_save_builder.md) | Mappings orphelins après sauvegarde du builder | ⚪ Diagnostiqué | 🟠 | Intégrations & ventes |
| [05](05_menuitem_mappe_sans_espace.md) | Menu item mappé sans association Espace | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [06](06_perte_tva_bulk_automap.md) | Perte de TVA lors du bulk auto-map | 🟡 Corrigé partiel | 🟠 | Intégrations & ventes |
| [07](07_prix_fnb_weezevent_absent.md) | Prix F&B Weezevent absent du catalogue | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [08](08_tva_defaut_20_incorrecte.md) | TVA par défaut 20% incorrecte | 🟢 Corrigé | 🟠 | Menu & recettes |
| [09](09_deconnexion_intempestive_multi_onglets.md) | Déconnexion intempestive pendant l'édition (multi-onglets) | 🟡 Corrigé partiel | 🔴 | Auth & onboarding |
| [10](10_n1_queries_toolbox_predict.md) | Requêtes N+1 dans le toolbox Event Predict | 🔴 Ouvert | 🟡 | Prévision |
| [11](11_routes_kv_mortes.md) | Routes /kv mortes (KvModule non enregistré) | 🔴 Ouvert | 🟡 | Technique |
| [12](12_scoping_config_manquant_spacemenus.md) | Scoping config manquant perf/staff/inventory Space Menus | 🟢 Corrigé | 🟠 | Espaces & builder |
| [13](13_predictversion_update_jamais_appelee.md) | PredictVersionsService.update() jamais appelée | 🟢 Corrigé | 🟢 | Prévision |
| [14](14_aggregation_colonnes_mal_ecrites.md) | AggregationService écrit menuItemId/locationId dans les mauvaises colonnes | 🔴 Ouvert | 🔴 | Analyse & agrégation |
| [15](15_agregation_ttc_ht_non_convertie.md) | Formule de CA ne convertit jamais TTC→HT | 🔴 Ouvert | 🔴 | Analyse & agrégation |
| [16](16_agregats_perimetre_divergent.md) | SpaceProductRevenueDailyAgg vs SpaceRevenueMinuteAgg : périmètre divergent | 🔴 Ouvert | 🟠 | Analyse & agrégation |
| [17](17_step2_shops_mapped_incoherent.md) | step2_shops_mapped calculé différemment unitaire vs bulk | 🔴 Ouvert | 🟡 | Analyse & agrégation |
| [18](18_merchant_element_mapping_sans_ownership.md) | createMerchantElementMapping sans vérification ownership tenant | 🔴 Ouvert | 🟠 | Analyse & agrégation |
| [19](19_queue_agregation_sans_retry.md) | Aucun retry BullMQ sur la queue d'agrégation | 🔴 Ouvert | 🟡 | Analyse & agrégation |
| [20](20_event_skipped_statut_trompeur.md) | Event "skipped" garde un statut trompeur après traitement réussi | 🔴 Ouvert | 🟡 | Analyse & agrégation |
| [21](21_jointure_event_weezevent_par_date_seule.md) | Jointure Event↔WeezeventEvent par égalité de DATE seule | 🔴 Ouvert | 🟡 | Analyse & agrégation |
| [22](22_configurations_v1_patch_upsert.md) | PATCH /configurations/:id (v1) se comporte comme un upsert | 🔴 Ouvert | 🟡 | Espaces & builder |
| [23](23_bascule_silencieuse_v1_v2_assign_floor.md) | Bascule silencieuse v1→v2 dès le 1er assign-floor | 🔴 Ouvert | 🟡 | Espaces & builder |
| [24](24_dedup_marketprice_criteres_insuffisants.md) | Dédup MarketPrice ignore prix/unité/quantité | 🔴 Ouvert | 🟡 | Achats & référentiels |
| [25](25_weezevent_multi_instance_auth_croisee.md) | Multi-instance Weezevent : auth OAuth croisée entre intégrations | 🔴 Ouvert | 🔴 | Intégrations & ventes |
| [26](26_dedup_webhook_event_inoperante.md) | Dédup IntegrationWebhookEvent inopérante côté Weezevent | 🔴 Ouvert | 🟠 | Intégrations & ventes |
| [27](27_cron_weezevent_garde_anti_doublerun_inoperante.md) | Garde anti-double-run du cron Weezevent inopérante | 🔴 Ouvert | 🟡 | Intégrations & ventes |
| [28](28_marktransactionasdeleted_no_op.md) | markTransactionAsDeleted ne fait rien de réel | 🔴 Ouvert | 🟡 | Intégrations & ventes |
| [29](29_mapping_fait_logique_dupliquee.md) | Logique "mapping fait ?" dupliquée Mappings vs Aggregation | 🔴 Ouvert | 🟡 | Intégrations & ventes |
| [30](30_margin_analysis_gonflee_produits_non_mappes.md) | margin-analysis gonfle la marge sur produits non mappés | 🔴 Ouvert | 🟠 | Intégrations & ventes |
| [31](31_restock_403_silencieux_roles_board.md) | Restock : rôles restockBoard-only en 403 silencieux permanent | 🔴 Ouvert | 🔴 | Stock |
| [32](32_discardedquantity_colonnes_mortes.md) | discardedQuantity/discardedReason colonnes DB mortes | 🔴 Ouvert | 🟢 | Stock |
| [33](33_event_kpis_champs_jamais_ecrits.md) | Event.revenue/transactionCount jamais écrits (pipeline mort) | 🔴 Ouvert | 🟡 | Événements |
| [34](34_event_spaceid_sans_fk.md) | Event.spaceId/configurationId sans FK Prisma | 🔴 Ouvert | 🟡 | Événements |
| [35](35_organizationscontroller_faille_cross_tenant.md) | OrganizationsController : faille cross-tenant (type P0-1) | 🔴 Ouvert | 🔴 | Auth & onboarding |
| [36](36_onboarding_join_slug_sans_verif.md) | POST /onboarding/join/:slug déprécié actif sans vérification | 🔴 Ouvert | 🟡 | Auth & onboarding |
| [37](37_jwt_expiresin_7_jours.md) | JWT expiresIn = 7 jours | 🔴 Ouvert | 🟢 | Auth & onboarding |
| [38](38_clonage_role_sans_resync_permissions.md) | Clonage de rôle ne resynchronise jamais les permissions | 🔴 Ouvert | 🟢 | Auth & onboarding (RBAC) |
| [39](39_audit_webhooks_core_jamais_appeles.md) | Audit/Webhooks (core) : infra complète, zéro appelant | 🔴 Ouvert | 🟠 | Technique |
| [40](40_orchestrator_tenantid_client_fourni.md) | Orchestrator fait confiance à un tenantId fourni par le client | 🔴 Ouvert | 🟡 | Technique |
| [41](41_queue_exports_sans_processor.md) | Queue EXPORTS enregistrée sans processor | 🔴 Ouvert | 🟡 | Technique |
| [42](42_queues_analytics_notifications_placeholder.md) | Queues ANALYTICS/NOTIFICATIONS 100% placeholder | 🔴 Ouvert | 🟢 | Technique |
| [43](43_edge_function_heavy_processing_table_inexistante.md) | Edge Function heavy-processing référence une table inexistante | 🔴 Ouvert | 🟢 | Technique |
| [44](44_stock_payload_lent_et_volumineux.md) | `GET /logistics/:spaceId/stock` lent et volumineux (jusqu'à ~180 Mo / 52s) | 🟢 Corrigé | 🟠 | Stock |
| [45](45_unit_null_codee_en_dur_readyforsale_yes.md) | `unit` codé en dur à `null` pour un menu item mono-ingrédient `readyForSale=Yes` | 🟢 Corrigé | 🟡 | Stock |
| [46](46_inventoryunit_jamais_persiste_menuitem.md) | `inventoryUnit` (unité conditionnement) jamais persisté sur `MenuItem` | 🟢 Corrigé | 🟡 | Menu & recettes / Stock |
| [47](47_prisma_client_desync_apres_switch_branche.md) | Prisma Client désynchronisé du schéma après switch de branche (`Unknown argument` sur champ existant) | 🟢 Corrigé | 🟡 | Technique |
| [48](48_readyforsale_yes_mono_ingredient_masque_par_marketprice.md) | Menu item `readyForSale=Yes` mono-ingrédient masqué par la Market Price de l'ingrédient (jamais affiché sous son propre nom) | 🟢 Corrigé | 🟠 | Stock |
| [49](49_marketpriceid_mouvement_non_valide_contre_itemkey.md) | `createMovement` accepte un `marketPriceId` sans le valider contre `itemKey` | ⚪ Diagnostiqué | 🟠 | Stock |
| [50](50_unitsperpack_jamais_resolu_hors_marketprice_bloque_casse_de_pack.md) | `unitsPerPack` jamais résolu pour un produit fini/component : casse de pack impossible, retraits valides rejetés | 🟢 Corrigé | 🔴 | Stock |
| [51](51_spacemenuitem_orphelins_apres_soft_delete_menuitem.md) | `SpaceMenuItem` orphelins après soft-delete d'un `MenuItem` (espace Auxerre : 89% des lignes mortes) | 🟢 Corrigé | 🟠 | Intégrations & ventes / Espaces & builder |
| [52](52_quickcreate_sans_dedoublonnage_par_nom.md) | Quick-create Data Integration sans dédoublonnage par nom (cause racine de BUG-051) | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [53](53_supplier_notes_jamais_persiste.md) | `Supplier.notes` accepté par l'API mais jamais persisté (perte silencieuse) | 🟢 Corrigé | 🟡 | Achats & référentiels |
| [54](54_market_prices_get_sans_pagination_reelle_limit_200_code_en_dur.md) | `GET /market-prices` sans pagination réelle : perte silencieuse au-delà de 200 lignes | 🟢 Corrigé | 🟠 | Achats & référentiels |
| [55](55_market_prices_bulkcreate_non_transactionnel_import_partiel_et_doublons.md) | `bulkCreate` non transactionnel : import CSV partiellement invisible + doublons garantis au réimport | 🟢 Corrigé | 🟠 | Achats & référentiels |
| [56](56_market_prices_bulkcreate_dedup_supplierid_fragile.md) | `bulkCreate` : dédoublonnage basé sur `supplierId` trop fragile, crée des doublons réels | 🟢 Corrigé | 🟠 | Achats & référentiels |
| [57](57_market_prices_bulkcreate_dedup_decimal_number_comparaison_silencieuse.md) | `bulkCreate` : comparer un champ `Decimal` (`price`) à un `number` JS brut échoue silencieusement, dédoublonnage totalement inopérant | 🟢 Corrigé | 🔴 | Achats & référentiels |
| [58](58_spacemenu_deletedat_fix51_non_replique.md) | Fix BUG-051 (`deletedAt` sur `MenuAssignment.menuItem`) non répliqué sur 3 endroits de `space-menus.service.ts` | 🟢 Corrigé | 🟠 | Menu & recettes / Espaces & builder |
| [59](59_spacemenu_savemenuconfiguration_non_transactionnel.md) | `saveMenuConfiguration` : création des `SpaceMenuItem` hors de la transaction des `MenuAssignment` | 🟢 Corrigé | 🟠 | Menu & recettes / Espaces & builder |
| [60](60_spacemenu_getshopmenu_spacelinks_non_scope.md) | `getShopMenu` renvoie les prix de tous les espaces (`spaceLinks` non scopé) et ne résout jamais `spaceId` | 🟢 Corrigé | 🟠 | Menu & recettes / Espaces & builder |
| [61](61_spacemenu_duplication_lookup_shop_tenant.md) | Logique de lookup shop/tenant + résolution `spaceId` dupliquée sur 4 méthodes (cause racine de BUG-060) | 🟢 Corrigé | 🟡 | Menu & recettes / Espaces & builder |
| [62](62_spacemenu_availability_referentiel_tenant_non_scope.md) | `getItemsWithAvailabilityForSpace` charge tout le référentiel tenant sur chaque appel, sans cache | ⚪ Diagnostiqué | 🟠 | Menu & recettes / Espaces & builder |
| [63](63_spacemenu_dto_enabled_non_valide_booleen.md) | `SaveSpaceMenuConfigurationDto.menuItems` : aucune validation que les valeurs sont des booléens | 🟢 Corrigé | 🟡 | Menu & recettes / Espaces & builder |
| [64](64_spacemenu_nettoyages_mineurs.md) | SpaceMenus backend : nettoyages mineurs (logs verbeux, doc Swagger désynchronisée) | 🟢 Corrigé | 🟡 | Menu & recettes / Espaces & builder |
| [65](65_predictversions_setdefault_cross_tenant.md) | `PredictVersionsService.setDefault` : écriture cross-tenant sans scoping | 🟢 Corrigé | 🔴 | Événements / Prévision |
| [66](66_createeventcategory_eventtypeid_sans_ownership.md) | `createEventCategory` : aucune vérification d'ownership sur `eventTypeId` | 🟢 Corrigé | 🟠 | Événements |
| [67](67_event_taxonomy_fk_sans_ownership.md) | `Event.create()`/`update()` : aucune vérification d'ownership sur les FK de taxonomie | 🟢 Corrigé | 🟠 | Événements |
| [68](68_updateteam_rename_non_transactionnel.md) | `updateTeam` : renommage + repropagation `Event.visitingTeamName` non transactionnels | 🟢 Corrigé | 🟡 | Événements |
| [69](69_events_module_pas_de_traduction_p2002_p2003.md) | Module Events : aucune traduction des erreurs Prisma P2002/P2003 (500 générique) | 🟢 Corrigé | 🟠 | Événements |
| [70](70_team_duplicate_toctou_sans_unique_index.md) | `Team` : vérification de doublon TOCTOU, aucune contrainte `@@unique` en base | 🟡 Corrigé non déployé | 🟡 | Événements |
| [71](71_get_events_page_limit_negatifs_sans_borne.md) | `GET /events` : `page`/`limit` négatifs acceptés, `limit` sans borne haute | 🟢 Corrigé | 🟡 | Événements |
| [72](72_createeventdto_createteamdto_name_vide.md) | `CreateEventDto.name`/`CreateTeamDto.name` : chaîne vide acceptée | 🟢 Corrigé | 🟡 | Événements |
| [73](73_createeventdto_champs_numeriques_sans_borne_min.md) | `CreateEventDto` : `ticketsSold`/`ticketsScanned`/`numberOfSessions` sans borne minimale | 🟢 Corrigé | 🟡 | Événements |
| [74](74_predictversionsservice_remove_findone_code_mort.md) | `PredictVersionsService.remove()`/`findOne()` : code mort (au-delà de BUG-13) | 🟢 Corrigé | 🟢 | Prévision |
| [75](75_eventtype_eventcategory_delete_cascade_sans_garde.md) | Suppression `EventType`/`EventCategory` : cascade silencieuse sans garde "en cours d'utilisation" | 🟢 Corrigé | 🟠 | Événements |
| [76](76_predictversion_create_eventid_non_verifie.md) | `EventPredictVersion.create()` : `eventId` non vérifié (existence/tenant) | 🟢 Corrigé | 🟢 | Prévision |
| [77](77_analyse_swagger_faux_spaceid_ignore.md) | `/analyse/*` : Swagger mensonger + `?spaceId=` silencieusement ignoré | 🟢 Corrigé | 🟠 | Analyse & agrégation |
| [78](78_analyse_timeline_sans_garde_event_troncature.md) | `/analyse/timeline/:eventId` : eventId jamais vérifié, troncature LIMIT silencieuse | 🟢 Corrigé (garde) / ⚪ (flag) | 🟡 | Analyse & agrégation |
| [79](79_analyse_kpis_findmany_reduce_tenant_entier.md) | `getMenuKpis`/`getEventKpis` : findMany du tenant entier + reduce JS | 🟢 Corrigé | 🟡 | Analyse & agrégation |
| [80](80_shopdetails_rpc_non_cachee.md) | `getShopDetails` : RPC ~300ms du premier rendu /analyse jamais cachée | 🟢 Corrigé | 🟠 | Espaces & builder |
| [81](81_inventorycount_toctou_unique_nulls.md) | `saveInventoryCounts` : TOCTOU + unique inopérant avec NULLs (doublons) | 🟡 Corrigé non déployé | 🟠 | Stock |
| [82](82_buildinventorycounts_perd_lignes_shopid_null.md) | Inventaire vide malgré données : lignes `shopId=null` perdues + early-return | 🟢 Corrigé | 🟠 | Stock |
| [83](83_logistics_reset_updates_sequentiels_transaction.md) | `reset` logistique : updates StockLevel un-par-un dans la transaction 30s | 🟢 Corrigé | 🟡 | Stock |
| [84](84_shop_items_batch_incomplet_n1_inventaire.md) | Inventaire : N+1 GET shop/:shopId alors qu'un batch existe (payload trop maigre) | 🟢 Corrigé | 🟠 | Stock |
| [85](85_double_persistance_counts_miroir.md) | (miroir) Double persistance des comptages — canonique front 160 | ⚪ Diagnostiqué | 🟡 | Stock |
| [86](86_eventpredictversion_tenantid_nullable.md) | `EventPredictVersion.tenantId` nullable : lignes legacy invisibles | ⚪ Diagnostiqué | 🟡 | Prévision |
| [87](87_index_perf_manquants_predict_inventory.md) | Index manquants : EventPredictVersion (tenantId,eventId) + InventoryCount (tenantId,spaceId,updatedAt) | 🟡 Corrigé non déployé | 🟡 | Prévision / Stock |
| [88](88_manualquantities_miroir.md) | (miroir) `manualQuantities` : backend prêt, front ne l'envoyait pas — canonique front 08 | 🟢 Corrigé | 🟠 | Prévision |
| [89](89_stocklevel_elementid_sans_fk.md) | `StockLevel.elementId` sans FK : niveaux orphelins, workarounds en lecture | ⚪ Diagnostiqué | 🟡 | Stock |
| [90](90_simulatesale_pollution_reset_race.md) | `simulateSale` visible dans les analytics ; fenêtre de course du `reset` | ⚪ Diagnostiqué | 🟡 | Stock |
| [91](91_event_timeline_articles_vides_jointure_mapping.md) | `event-timeline` : item-level vide (0 article) malgré CA shop-level — INNER JOIN mapping trop strict | 🟡 Corrigé non déployé | 🔴 | Analyse & agrégation |

**91 bugs au total.** 75-76 passés 🟢 le 2026-07-18 côté develop (garde « en cours d'utilisation »
sur la suppression EventType/EventCategory ; vérification existence/tenant de `eventId` à la
création de version predict), fusionnés ici au merge. 77-90 ajoutés le 2026-07-18 suite à l'audit croisé /analyse + Event Predict +
Stock (inventory/logistics/restock), mené conjointement côté front (fiches 149-162) avec objectif
de performance « contenu initial des vues < 300ms ». Côté backend : les 4 endpoints `/analyse/*`
documentaient dans Swagger des réponses qui n'ont jamais existé et ignoraient le `?spaceId=` que le
front leur envoyait — sans témoin, car la découverte centrale de l'audit est que leur unique
consommateur front était du code mort jamais dispatché (fiche front 149) ; agrégations réécrites en
SQL (79), garde d'ownership sur la timeline (78), et surtout mise en cache Redis 60s de la RPC
`get_space_shop_details` (~300ms, chemin critique du premier rendu /analyse — 80). Stock : le
couple TOCTOU + contrainte unique inopérante sur NULLs expliquant les doublons de comptage (81,
script SQL `NULLS NOT DISTINCT` + rattrapage P2002), l'inventaire « vide malgré données » (82), le
bulk-update du reset (83), et l'extension du batch shop-items qui permet au front de tuer le N+1
inventaire (84 — ce qui, avec l'adoption du batch event-timeline par le moteur predict côté front,
solde le vieux BUG-010 passé à 🟢). Restock : BUG-31 mis à jour — le front alerte désormais sur
403 (fiche front 19), le choix de permissions PUT/DELETE reste posé à Bertrand. Laissés en ⚪ après
diagnostic : 85/86/89/90 (décisions produit/architecture ou nettoyages de données prod préalables
— cf. `QUESTIONS_A_BERTRAND.md`). Deux scripts SQL rejouables livrés dans `prisma/sql/`
(2026-07-18_*) — À EXÉCUTER AU DÉPLOIEMENT (81/87). Au passage : 3 specs préexistantes réparées
(mocks obsolètes — `zone`/`configurationElement` manquants dans spaces.service.spec qui tuaient le
process jest en silence, `event` manquant + `eventName` non attendu dans inventory.service.spec,
caches RecipeCtx manquants dans logistics.service.spec).

65-76 ajoutés le 2026-07-17 suite à un audit complet du module backend
Events (`events.controller.ts`/`.service.ts`, taxonomies, Teams, couche API `predict-versions.*`) :
une faille cross-tenant P0 sur `PUT .../predict-versions/default` (aucun scoping tenant sur
l'update, corrigée + couverte par un nouveau fichier de tests — ce module n'en avait aucun) ;
`createEventCategory` sans vérification d'ownership sur `eventTypeId` (seule méthode taxonomie à
avoir cet oubli, les autres l'avaient déjà) ; `Event.create()`/`update()` sans vérification
d'ownership sur les 3 FK de taxonomie (même famille que le Piège n°3 déjà documenté pour
`spaceId`/`configurationId`, mais corrigible ici via les helpers déjà existants) ; renommage de Team
non transactionnel avec sa repropagation sur les events ; aucune des 6 méthodes CRUD de taxonomie ne
traduisait P2002/P2003 en erreur propre (pattern déjà établi ailleurs dans le backend, jamais
répliqué sur ce module) ; pagination `GET /events` acceptant des valeurs négatives et sans borne
haute ; validations DTO manquantes (`name` vide, champs numériques négatifs) ; code mort
supplémentaire dans `PredictVersionsService` (`remove()`/`findOne()`, et `update()` déjà documenté
BUG-13, supprimés ensemble). BUG-70/75/76 initialement laissés en ⚪ Diagnostiqué (décision produit/
architecture nécessaire avant de trancher) ; BUG-13 (frontend miroir) mis à jour à 🟢 suite à la
suppression de `update()`. Décisions tranchées et implémentées le 2026-07-18 : BUG-76 (vérification
`eventId`/tenant ajoutée à `EventPredictVersion.create()`, même pattern que BUG-67) ; BUG-75
(suppression `EventType`/`EventCategory` désormais bloquée si des enfants en dépendent, plutôt que
cascade silencieuse) ; BUG-70 (contrainte `@@unique` ajoutée au schéma + migration écrite après
vérification en base — 11 lignes `Team`, aucun doublon — mais **non déployée**, en attente d'une
confirmation explicite séparée pour l'application réelle contre la base de données, cf. fiche).
extraits de `datafriday-web/docs/modules/` (source exhaustive, ~61 bugs
recensés dont certains purement frontend — voir l'index miroir) le 2026-07-15 ; 44-50 ajoutés le
2026-07-15 suite à un diagnostic direct sur `/spaces/:id/logistic` ; 51 ajouté le 2026-07-15 suite
à une vérification directe en base des Menu Items sans prix pour l'espace Auxerre lors de la Data
Integration ; 52 ajouté le 2026-07-15 en creusant la cause racine de BUG-051 (quick-create sans
dédoublonnage) ; 53 ajouté le 2026-07-16 en auditant les payloads backend de fichiers frontend
récupérés depuis une copie parallèle du repo (`old-web`) ; 54 ajouté le 2026-07-16 suite à une
analyse directe de la page frontend `/market-prices` (pagination absente sur `GET /market-prices`) ;
55 ajouté le 2026-07-16 suite à une analyse du drawer d'import CSV `/market-prices` (bulkCreate non
transactionnel, cause racine du succès partiel invisible et des doublons côté frontend) ; 56 ajouté
le 2026-07-16 suite à un signalement utilisateur de doublons réels créés malgré le fix 55
(dédoublonnage sur supplierId trop fragile) ; 57 ajouté le 2026-07-16 suite à un nouveau
signalement de doublons malgré le fix 56 — cause racine : comparaison Decimal/number Prisma
silencieusement cassée, confirmée par requêtes directes en base ; 58-64 ajoutés et majoritairement
corrigés le 2026-07-17 suite à un audit complet du module `SpaceMenus`
(`space-menus.controller.ts` + `.service.ts`) : le fix BUG-051 (`deletedAt` sur
`MenuAssignment.menuItem`) non répliqué sur 3 des 4 endroits qui lisent/écrivent des assignations,
une écriture `SpaceMenuItem` hors transaction pouvant désynchroniser `MenuAssignment.enabled` et
la disponibilité réelle, une fuite de prix inter-espaces dans `getShopMenu` (spaceLinks non scopé,
cause racine : le shop n'était jamais résolu vers son `spaceId`), la duplication de code à
l'origine de cette dernière fuite, une validation DTO trop faible sur les valeurs booléennes, et
des nettoyages mineurs (logs, doc Swagger) ; BUG-061 initialement laissé non corrigé (refactor
jugé trop risqué), puis re-tranché le même jour après ré-examen : la clause `OR` d'appartenance
tenant et la dérivation `spaceId` sont strictement identiques dans les 4 méthodes (vérifié
caractère près) et ont été factorisées dans 2 helpers privés, sans toucher aux `select` Prisma
hétérogènes (là où vivait le vrai risque) — `tsc --noEmit` propre après coup ; BUG-062 (chargement
du référentiel tenant complet sans scoping sur chaque ouverture de drawer) laissé non corrigé après
vérification en base (lecture seule, 2026-07-17) : le plus gros tenant des 21 existants n'a que 54
ingrédients, 8 packagings/composants au total tous tenants confondus, 46 market prices, 16
fournisseurs — l'espace le plus chargé n'a que 60 items associés (181 lignes `SpaceMenuItem` au
total en base). Le pattern non scopé charge donc au pire ~130 lignes plates par appel, un coût
négligeable à l'échelle actuelle malgré le défaut architectural réel — fix reporté, à revisiter si
le référentiel cumulé d'un tenant dépasse ~500 lignes ou si la latence de cette route devient
mesurable (cf. fiche BUG-062 pour le design de fix envisagé si besoin).

## Comment ajouter un bug

1. Copier [`TEMPLATE.md`](TEMPLATE.md) vers `NN_slug-court.md` (numéro suivant disponible).
2. Remplir les champs, en citant `fichier:ligne` dès que la cause racine est identifiée.
3. Ajouter une ligne dans le tableau ci-dessus.
4. Si le bug touche aussi l'autre repo, créer une fiche miroir courte côté
   [`datafriday-web`](../../../datafriday-web/docs/bugs/) qui pointe vers celle-ci (voir BUG-012 /
   front BUG-007 comme exemple).
