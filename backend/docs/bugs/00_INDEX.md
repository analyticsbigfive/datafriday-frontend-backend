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
| [01](01_cout_menucomponent_surestime.md) | Coût MenuComponent surestimé (`numberOfUnitsRecipe` ignoré) | 🟡 Corrigé (backfill des coûts persistés à faire) | 🔴 | Menu & recettes |
| [02](02_double_regle_combo_incompatible.md) | Deux règles d'expansion combo incompatibles | 🟢 Corrigé | 🟠 | Menu & recettes / Stock |
| [03](03_taxonomie_croisee_marketprice_menuitem.md) | Taxonomie croisée Market Price / Menu Item | 🟢 Corrigé | 🟠 | Achats & référentiels |
| [04](04_mappings_orphelins_save_builder.md) | Mappings orphelins après sauvegarde du builder | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [05](05_menuitem_mappe_sans_espace.md) | Menu item mappé sans association Espace | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [06](06_perte_tva_bulk_automap.md) | Perte de TVA lors du bulk auto-map | 🟡 Corrigé partiel (dédup forward faite, 55 groupes historiques restent à qualifier) | 🟠 | Intégrations & ventes |
| [07](07_prix_fnb_weezevent_absent.md) | Prix F&B Weezevent absent du catalogue | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [08](08_tva_defaut_20_incorrecte.md) | TVA par défaut 20% incorrecte | 🟢 Corrigé | 🟠 | Menu & recettes |
| [09](09_deconnexion_intempestive_multi_onglets.md) | Déconnexion intempestive pendant l'édition (multi-onglets) | 🟢 Corrigé | 🔴 | Auth & onboarding |
| [10](10_n1_queries_toolbox_predict.md) | Requêtes N+1 dans le toolbox Event Predict | 🟢 Corrigé | 🟡 | Prévision |
| [11](11_routes_kv_mortes.md) | Routes /kv mortes (KvModule non enregistré) | 🟢 Corrigé (module supprimé) | 🟡 | Technique |
| [12](12_scoping_config_manquant_spacemenus.md) | Scoping config manquant perf/staff/inventory Space Menus | 🟢 Corrigé | 🟠 | Espaces & builder |
| [13](13_predictversion_update_jamais_appelee.md) | PredictVersionsService.update() jamais appelée | 🟢 Corrigé | 🟢 | Prévision |
| [14](14_aggregation_colonnes_mal_ecrites.md) | AggregationService écrit menuItemId/locationId dans les mauvaises colonnes | 🟢 Corrigé | 🔴 | Analyse & agrégation |
| [15](15_agregation_ttc_ht_non_convertie.md) | Formule de CA ne convertit jamais TTC→HT | 🟢 Corrigé | 🔴 | Analyse & agrégation |
| [16](16_agregats_perimetre_divergent.md) | SpaceProductRevenueDailyAgg vs SpaceRevenueMinuteAgg : périmètre divergent | 🟢 Corrigé par ricochet | 🟠 | Analyse & agrégation |
| [17](17_step2_shops_mapped_incoherent.md) | step2_shops_mapped calculé différemment unitaire vs bulk | 🟢 Corrigé | 🟡 | Analyse & agrégation |
| [18](18_merchant_element_mapping_sans_ownership.md) | createMerchantElementMapping sans vérification ownership tenant | 🟢 Corrigé | 🟠 | Analyse & agrégation |
| [19](19_queue_agregation_sans_retry.md) | Aucun retry BullMQ sur la queue d'agrégation | 🟢 Corrigé | 🟡 | Analyse & agrégation |
| [20](20_event_skipped_statut_trompeur.md) | Event "skipped" garde un statut trompeur après traitement réussi | 🟢 Corrigé | 🟡 | Analyse & agrégation |
| [21](21_jointure_event_weezevent_par_date_seule.md) | Jointure Event↔WeezeventEvent par égalité de DATE seule | 🟢 Corrigé | 🟡 | Analyse & agrégation |
| [22](22_configurations_v1_patch_upsert.md) | PATCH /configurations/:id (v1) se comporte comme un upsert | 🟢 Corrigé | 🟡 | Espaces & builder |
| [23](23_bascule_silencieuse_v1_v2_assign_floor.md) | Bascule silencieuse v1→v2 dès le 1er assign-floor | 🟢 Corrigé (observabilité — retrait de v1 reste une question à part) | 🟡 | Espaces & builder |
| [24](24_dedup_marketprice_criteres_insuffisants.md) | Dédup MarketPrice ignore prix/unité/quantité | 🟢 Corrigé | 🟡 | Achats & référentiels |
| [25](25_weezevent_multi_instance_auth_croisee.md) | Multi-instance Weezevent : auth OAuth croisée entre intégrations | 🟢 Corrigé | 🔴 | Intégrations & ventes |
| [26](26_dedup_webhook_event_inoperante.md) | Dédup IntegrationWebhookEvent inopérante côté Weezevent | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [27](27_cron_weezevent_garde_anti_doublerun_inoperante.md) | Garde anti-double-run du cron Weezevent inopérante | 🟢 Corrigé | 🟡 | Intégrations & ventes |
| [28](28_marktransactionasdeleted_no_op.md) | markTransactionAsDeleted ne fait rien de réel | 🟢 Corrigé | 🟡 | Intégrations & ventes |
| [29](29_mapping_fait_logique_dupliquee.md) | Logique "mapping fait ?" dupliquée Mappings vs Aggregation | 🟢 Corrigé | 🟡 | Intégrations & ventes |
| [30](30_margin_analysis_gonflee_produits_non_mappes.md) | margin-analysis gonfle la marge sur produits non mappés | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [31](31_restock_403_silencieux_roles_board.md) | Restock : rôles restockBoard-only en 403 silencieux permanent | 🔴 Ouvert | 🔴 | Stock |
| [32](32_discardedquantity_colonnes_mortes.md) | discardedQuantity/discardedReason colonnes DB mortes | 🔴 Ouvert | 🟢 | Stock |
| [33](33_event_kpis_champs_jamais_ecrits.md) | Event.revenue/transactionCount jamais écrits (pipeline mort) | 🟢 Corrigé | 🟡 | Événements |
| [34](34_event_spaceid_sans_fk.md) | Event.spaceId/configurationId sans FK Prisma | 🟢 Corrigé (orphelins nettoyés, FK `onDelete: SetNull` déployée) | 🟡 | Événements |
| [35](35_organizationscontroller_faille_cross_tenant.md) | OrganizationsController : faille cross-tenant (type P0-1) | 🟡 Corrigé non déployé | 🔴 | Auth & onboarding |
| [36](36_onboarding_join_slug_sans_verif.md) | POST /onboarding/join/:slug déprécié actif sans vérification | 🟢 Corrigé (route supprimée) | 🟡 | Auth & onboarding |
| [37](37_jwt_expiresin_7_jours.md) | JWT expiresIn = 7 jours | 🟢 Corrigé (ramené à 1 jour) | 🟢 | Auth & onboarding |
| [38](38_clonage_role_sans_resync_permissions.md) | Clonage de rôle ne resynchronise jamais les permissions | 🟢 Corrigé | 🟢 | Auth & onboarding (RBAC) |
| [39](39_audit_webhooks_core_jamais_appeles.md) | Audit/Webhooks (core) : infra complète, zéro appelant | 🔴 Ouvert | 🟠 | Technique |
| [40](40_orchestrator_tenantid_client_fourni.md) | Orchestrator fait confiance à un tenantId fourni par le client | 🟢 Corrigé | 🟡 | Technique |
| [41](41_queue_exports_sans_processor.md) | Queue EXPORTS enregistrée sans processor | 🟢 Corrigé (processor placeholder, même pattern que Notifications/Analytics) | 🟡 | Technique |
| [42](42_queues_analytics_notifications_placeholder.md) | Queues ANALYTICS/NOTIFICATIONS 100% placeholder | 🔴 Ouvert | 🟢 | Technique |
| [43](43_edge_function_heavy_processing_table_inexistante.md) | Edge Function heavy-processing référence une table inexistante | 🟢 Corrigé (code mort supprimé) | 🟢 | Technique |
| [44](44_stock_payload_lent_et_volumineux.md) | `GET /logistics/:spaceId/stock` lent et volumineux (jusqu'à ~180 Mo / 52s) | 🟢 Corrigé | 🟠 | Stock |
| [45](45_unit_null_codee_en_dur_readyforsale_yes.md) | `unit` codé en dur à `null` pour un menu item mono-ingrédient `readyForSale=Yes` | 🟢 Corrigé | 🟡 | Stock |
| [46](46_inventoryunit_jamais_persiste_menuitem.md) | `inventoryUnit` (unité conditionnement) jamais persisté sur `MenuItem` | 🟢 Corrigé | 🟡 | Menu & recettes / Stock |
| [47](47_prisma_client_desync_apres_switch_branche.md) | Prisma Client désynchronisé du schéma après switch de branche (`Unknown argument` sur champ existant) | 🟢 Corrigé | 🟡 | Technique |
| [48](48_readyforsale_yes_mono_ingredient_masque_par_marketprice.md) | Menu item `readyForSale=Yes` mono-ingrédient masqué par la Market Price de l'ingrédient (jamais affiché sous son propre nom) | 🟢 Corrigé | 🟠 | Stock |
| [49](49_marketpriceid_mouvement_non_valide_contre_itemkey.md) | `createMovement` accepte un `marketPriceId` sans le valider contre `itemKey` | 🟢 Corrigé | 🟠 | Stock |
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
| [70](70_team_duplicate_toctou_sans_unique_index.md) | `Team` : vérification de doublon TOCTOU, aucune contrainte `@@unique` en base | 🟢 Corrigé (déployé 2026-07-18, vérifié en base le 2026-07-24) | 🟡 | Événements |
| [71](71_get_events_page_limit_negatifs_sans_borne.md) | `GET /events` : `page`/`limit` négatifs acceptés, `limit` sans borne haute | 🟢 Corrigé | 🟡 | Événements |
| [72](72_createeventdto_createteamdto_name_vide.md) | `CreateEventDto.name`/`CreateTeamDto.name` : chaîne vide acceptée | 🟢 Corrigé | 🟡 | Événements |
| [73](73_createeventdto_champs_numeriques_sans_borne_min.md) | `CreateEventDto` : `ticketsSold`/`ticketsScanned`/`numberOfSessions` sans borne minimale | 🟢 Corrigé | 🟡 | Événements |
| [74](74_predictversionsservice_remove_findone_code_mort.md) | `PredictVersionsService.remove()`/`findOne()` : code mort (au-delà de BUG-13) | 🟢 Corrigé | 🟢 | Prévision |
| [75](75_eventtype_eventcategory_delete_cascade_sans_garde.md) | Suppression `EventType`/`EventCategory` : cascade silencieuse sans garde "en cours d'utilisation" | 🟢 Corrigé | 🟠 | Événements |
| [76](76_predictversion_create_eventid_non_verifie.md) | `EventPredictVersion.create()` : `eventId` non vérifié (existence/tenant) | 🟢 Corrigé | 🟢 | Prévision |
| [77](77_createeventcategory_type_global_rejete_regression_bug66.md) | `createEventCategory` rejette les `eventTypeId` globaux (régression du fix BUG-66) | 🟢 Corrigé | 🟠 | Événements |
| [78](78_product_taxonomy_update_sans_permission_guard.md) | `PATCH /product-types/:id` et `/product-categories/:id` sans `@RequirePermissions` (contrôle d'accès contourné) | 🟢 Corrigé | 🔴 | Menu & recettes (Configurations) |
| [79](79_suppression_producttype_category_sans_garde_dependances.md) | Suppression `ProductType`/`ProductCategory` sans garde contre les `MenuItem` dépendants | 🟢 Corrigé | 🟠 | Menu & recettes (Configurations) |
| [80](80_menucomponent_taxonomy_fk_sans_ownership.md) | `MenuComponent.create()`/`update()` : aucune vérification d'ownership sur `componentTypeId`/`componentCategoryId` | 🟢 Corrigé | 🟠 | Menu & recettes (Configurations) |
| [81](81_suppression_componenttype_category_sans_garde_dependances.md) | Suppression `ComponentType`/`ComponentCategory` sans garde contre les `MenuComponent` dépendants | 🟢 Corrigé | 🟠 | Menu & recettes (Configurations) |
| [82](82_suppression_marketpricetype_sans_garde_categories.md) | Suppression `MarketPriceType` sans garde contre les `MarketPriceCategory` dépendantes | 🟢 Corrigé | 🟠 | Achats & référentiels (Configurations) |
| [83](83_marketprice_goodtype_category_desync_rename_delete.md) | `MarketPrice.goodType`/`category` (texte libre) jamais resynchronisés au rename/delete de la taxonomie Good Type/Category | 🟢 Corrigé | 🟠 | Achats & référentiels (Configurations) |
| [84](84_packingtype_desync_rename_delete_texte_libre.md) | `PackingType` (texte libre, sans FK) jamais resynchronisé au rename/delete | 🟢 Corrigé | 🟠 | Achats & référentiels (Configurations) |
| [85](85_suppression_brand_displayname_sans_garde_usage.md) | Suppression `Brand`/`DisplayName` sans garde ni avertissement d'usage | 🟢 Corrigé | 🟠 | Menu & recettes (Configurations) |
| [86](86_suppression_industrial_sans_garde_usage.md) | Suppression `Industrial` sans garde ni avertissement d'usage | 🟢 Corrigé | 🟠 | Achats & référentiels (Configurations) |
| [87](87_taxonomies_configurations_doublon_insensible_casse.md) | Pas de protection anti-doublon insensible à la casse sur les taxonomies/référentiels de Configurations | 🟢 Corrigé | 🟡 | Menu & recettes / Achats & référentiels (Configurations) |
| [88](88_taxonomies_configurations_dto_name_incoherents.md) | DTOs de création incohérents entre Type et Category (`name` sans `@IsNotEmpty`/`@MaxLength`) sur plusieurs taxonomies | 🟢 Corrigé | 🟡 | Menu & recettes / Achats & référentiels (Configurations) |
| [89](89_analyse_swagger_faux_spaceid_ignore.md) | `/analyse/*` : Swagger mensonger + `?spaceId=` silencieusement ignoré | 🟢 Corrigé | 🟠 | Analyse & agrégation |
| [90](90_analyse_timeline_sans_garde_event_troncature.md) | `/analyse/timeline/:eventId` : eventId jamais vérifié, troncature LIMIT silencieuse | 🟢 Corrigé (garde) / ⚪ (flag) | 🟡 | Analyse & agrégation |
| [91](91_analyse_kpis_findmany_reduce_tenant_entier.md) | `getMenuKpis`/`getEventKpis` : findMany du tenant entier + reduce JS | 🟢 Corrigé | 🟡 | Analyse & agrégation |
| [92](92_shopdetails_rpc_non_cachee.md) | `getShopDetails` : RPC ~300ms du premier rendu /analyse jamais cachée | 🟢 Corrigé | 🟠 | Espaces & builder |
| [93](93_inventorycount_toctou_unique_nulls.md) | `saveInventoryCounts` : TOCTOU + unique inopérant avec NULLs (doublons) | 🟡 Corrigé non déployé | 🟠 | Stock |
| [94](94_buildinventorycounts_perd_lignes_shopid_null.md) | Inventaire vide malgré données : lignes `shopId=null` perdues + early-return | 🟢 Corrigé | 🟠 | Stock |
| [95](95_logistics_reset_updates_sequentiels_transaction.md) | `reset` logistique : updates StockLevel un-par-un dans la transaction 30s | 🟢 Corrigé | 🟡 | Stock |
| [96](96_shop_items_batch_incomplet_n1_inventaire.md) | Inventaire : N+1 GET shop/:shopId alors qu'un batch existe (payload trop maigre) | 🟢 Corrigé | 🟠 | Stock |
| [97](97_double_persistance_counts_miroir.md) | (miroir) Double persistance des comptages — canonique front 183 | ⚪ Diagnostiqué | 🟡 | Stock |
| [98](98_eventpredictversion_tenantid_nullable.md) | `EventPredictVersion.tenantId` nullable : lignes legacy invisibles | ⚪ Diagnostiqué | 🟡 | Prévision |
| [99](99_index_perf_manquants_predict_inventory.md) | Index manquants : EventPredictVersion (tenantId,eventId) + InventoryCount (tenantId,spaceId,updatedAt) | 🟡 Corrigé non déployé | 🟡 | Prévision / Stock |
| [100](100_manualquantities_miroir.md) | (miroir) `manualQuantities` : backend prêt, front ne l'envoyait pas — canonique front 08 | 🟢 Corrigé | 🟠 | Prévision |
| [101](101_stocklevel_elementid_sans_fk.md) | `StockLevel.elementId` sans FK : niveaux orphelins, workarounds en lecture | ⚪ Diagnostiqué | 🟡 | Stock |
| [102](102_simulatesale_pollution_reset_race.md) | `simulateSale` visible dans les analytics ; fenêtre de course du `reset` | ⚪ Diagnostiqué | 🟡 | Stock |
| [103](103_event_timeline_articles_vides_jointure_mapping.md) | `event-timeline` : item-level vide (0 article) malgré CA shop-level — INNER JOIN mapping trop strict | 🟡 Corrigé non déployé | 🔴 | Analyse & agrégation |
| [104](104_weezevent_sync_job_organizationid_manquant.md) | Sync par job Weezevent échoue systématiquement (`organizationId manquant`, lu au mauvais endroit) | 🟢 Corrigé | 🔴 | Intégrations & ventes |
| [105](105_weezevent_transactionitem_champ_inconnu_insertion_bloquee.md) | `WeezeventTransactionItem` jamais inséré (mauvais nom de champ `weezeventItemId`/`externalItemId`), sur les 2 mécanismes de sync | 🟢 Corrigé | 🔴 | Intégrations & ventes |
| [106](106_webhook_secret_tenant_global_pas_par_integration.md) | Secret de signature webhook Weezevent tenant-global, pas par intégration | 🟢 Corrigé | 🟡 | Intégrations & ventes |
| [107](107_weezeventintegration_clientid_legacy_not_null_bloque_creation.md) | `WeezeventIntegration.clientId`/`clientSecret` legacy NOT NULL bloque toute création d'instance | 🟢 Corrigé | 🔴 | Intégrations & ventes |
| [108](108_event_timeline_deletedat_non_filtre.md) | `getEventTimelineBatch` ne filtre pas `SalesTransaction.deletedAt` | 🟢 Corrigé | 🟠 | Analyse & agrégation / Live events |
| [109](109_aggregation_jamais_declenchee_automatiquement.md) | `queueAggregationJob()` n'est jamais déclenché automatiquement | 🟢 Corrigé | 🟠 | Analyse & agrégation / Live events |
| [110](110_derivesalesraw_deletedat_non_filtre.md) | `deriveSalesRaw` (Logistic) ne filtre pas `SalesTransaction.deletedAt` | 🟢 Corrigé | 🟠 | Stock (Logistic) / Live events |
| [111](111_aggregation_attendees_sync_mauvais_id.md) | Auto-sync attendees post-agrégation envoie le mauvais id à l'API Weezevent (404 systématique) | 🟢 Corrigé | 🟡 | Analyse & agrégation |
| [112](112_weezevent_bissection_collecte_sequentielle_timeout_gros_tenant.md) | Bissection de collecte Weezevent strictement séquentielle : import complet d'un gros tenant dépasse le timeout frontend | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [113-02](113_02_predictversionscontroller_commentaire_obsolete_versionid.md) | `predict-versions.controller.ts` : commentaire obsolète référençant une route `:versionId` inexistante | 🟡 Corrigé non testé | 🟡 | Événements / Prévision |
| [114-02](114_02_eventsmodule_exports_inutilises.md) | `events.module.ts` : `EventsService`/`PredictVersionsService` exportés sans consommateur externe | 🟡 Corrigé non testé | 🟢 | Événements |
| [115-02](115_02_createeventdto_createteamdto_maxlength_manquant.md) | `CreateEventDto`/`CreateTeamDto.name` sans `@MaxLength(100)`, contrairement à Type/Catégorie/Sous-catégorie | 🟡 Corrigé non testé | 🟡 | Événements |
| [116-02](116_02_createeventdto_type_number_manquant_champs_numeriques.md) | `CreateEventDto` : `@Type(() => Number)` manquant sur les champs numériques | 🟡 Corrigé non testé | 🟢 | Événements |
| [117-02](117_02_patchpredictversiondto_duplique_au_lieu_de_partialtype.md) | `PatchPredictVersionDto` dupliqué à la main au lieu de `PartialType(CreatePredictVersionDto)` | 🟡 Corrigé non testé | 🟡 | Événements / Prévision |
| [118-02](118_02_createeventsubcategorydto_eventcategoryid_typage_incoherent.md) | `CreateEventSubcategoryDto.eventCategoryId` typé requis en TS mais optionnel en validation | 🟡 Corrigé non testé | 🟢 | Événements |
| [119-02](119_02_createeventdto_sessions_array_objets_reduit_a_vide_class_transformer.md) | `CreateEventDto.sessions`/`CreatePredictVersionDto.predictedRecords` : tableau d'objets réduit à `[[]]` par class-transformer (design:type `Array` sans `@Type()`) | 🟡 Corrigé non testé | 🔴 | Événements / Prévision |
| [120-02](120_02_eventsservice_resolveorcreateteambyname.md) | `EventsService` : résolution/création automatique des équipes par nom (`homeTeamName`/`visitingTeamName`), déplacée du frontend | 🟡 Corrigé non testé | 🟠 | Événements |
| [121-02](121_02_resolveorcreateteambyname_race_condition_doublons_scope_null.md) | `resolveOrCreateTeamByName` : race condition crée des équipes en double quand le scope compétition est NULL/NULL | 🟡 Corrigé non testé | 🟠 | Événements |
| [122-02](122_02_staffing_subtype_casing_mismatch_fnb_detection.md) | Détection des tags F&B (subtypes) jamais déclenchée pour les éléments shop créés dans le Builder v2 (comparaison de casse) | 🟢 Corrigé | 🟠 | RH / Staffing |
| [123-01](123_01_agg_weezeventeventid_contient_ids_datafriday_rpc_noms_uuid.md) | `SpaceRevenueMinuteAgg."weezeventEventId"` contient des ids `Event` DataFriday → la RPC `get_space_shop_details` renvoyait l'UUID brut en guise de `eventName` (barres Predict illisibles) ; jointure directe `Event` ajoutée (régression révélée par BUG-021) | 🟡 Corrigé non testé | 🔴 | Analyse / Agrégation |
| [124-01](124_01_spaceelement_type_text_vs_enum_prod.md) | `SpaceElement.type` en `text` en prod alors que le code pré-CFG-2 attend l'enum `ElementType` → 500 (`operator does not exist: text = "ElementType"`) sur event-timeline, transaction-baskets et live-status ; diagnostic initial (dérive DDL) corrigé — c'est en fait la migration CFG-2 Étape 2 (`rh-consolidation-backend`), le vrai fix est de déployer ce code, pas de reconvertir la colonne | 🔴 Ouvert | 🔴 | Espaces & builder / Analyse |

**112 bugs au total**, 112 ajouté et corrigé le 2026-07-28 suite à un signalement utilisateur : import
complet du tenant Auxerre (18 shops, gros volume) échouant systématiquement avec "délai maximal
dépassé" sur une instance nouvellement créée. Cause racine : `WeezeventCollectWorkerService.
fetchChunk` awaitait ses deux branches de bissection séquentiellement — pour un tenant volumineux
l'arbre produit des dizaines/centaines d'appels HTTP enchaînés un par un, largement suffisant pour
dépasser le timeout de polling frontend (BUG-206). Corrigé en parallélisant les deux branches
(`Promise.all`), bornées par un sémaphore maison (`WEEZEVENT_COLLECT_CONCURRENCY`, défaut 5, même
ordre de grandeur que `PARALLEL_CHUNKS` côté insertion) pour ne pas déclencher le rate-limit
Weezevent ni ouvrir le circuit breaker partagé. Combiné à un fix front (BUG-235, même session :
timeout d'inactivité au lieu de durée totale).

**111 bugs au total**, 111 découvert et corrigé le 2026-07-27 en testant le widget QA "simuler une
vente" du module Live — le déclenchement d'agrégation qu'il partage avec le webhook réel a exposé
un bug préexistant (auto-sync attendees passait le cuid interne du SalesEvent au lieu de son id
Weezevent réel, 404 garanti pour tout event réel ou simulé). 110 ajouté et corrigé le 2026-07-23 en préparant le v2 du module Live (même
trou que BUG-108, cette fois dans `deriveSalesRaw` du module Logistic — voir la fiche pour le détail).
108 et 109 ajoutés le même jour pendant la préparation backend du module Live
(voir [`../api/LIVE_API_GUIDE.md`](../api/LIVE_API_GUIDE.md)) : BUG-109 est le prérequis backend déjà
identifié en conception (agrégation jamais déclenchée automatiquement, seulement via le wizard
d'intégration) ; BUG-108 est une découverte nouvelle faite en creusant ce prérequis — la requête
`event-timeline` que le signal « event live » doit réutiliser (question #20 du tracker front) ne
filtre pas les transactions annulées (`deletedAt`), contrairement au pipeline d'agrégation périodique
qui les exclut déjà depuis BUG-028. Les deux sont à corriger avant d'implémenter le signal live.

**107 bugs au total**, 107 ajouté et corrigé le 2026-07-21 en testant end-to-end le fix de BUG-106 :
la création d'une intégration Weezevent/Digifood échouait sur cette base (colonnes legacy
`NOT NULL` jamais nettoyées après la migration multi-instance) — corrigé (`DROP NOT NULL`), voir la
fiche pour la vérification avant/après. 106 ajouté le même jour en creusant BUG-025 (même famille :
credentials tenant-global au lieu de par-intégration, sur le secret de signature webhook cette fois
plutôt que l'OAuth) — également corrigé le même jour (secret par-intégration avec repli tenant),
voir la fiche pour le détail.

**BUG-004 confirmé corrigé le 2026-07-21**, en clôturant la revue du module Intégrations & ventes
(dernier bug non 🟢 du domaine avec BUG-006) : le fix (reconcile/upsert remplaçant le
`delete+recreate` de `saveConfiguration`, + vraie FK `WeezeventLocationShopMapping.spaceElementId
→ SpaceElement.id`) existait déjà en code sans que la fiche ait jamais été mise à jour. Reproduit
et vérifié avec le vrai `SpacesService.saveConfiguration()` sur tenant/espace jetables : resave à
l'identique et resave avec élément mappé absent du payload préservent tous les deux le mapping.

**BUG-006 : nettoyage des doublons orphelins fait le 2026-07-21** (résidu documenté depuis le
30/06). Diagnostic en lecture seule d'abord : 641 groupes de doublons (1516 lignes), dont 800
strictement orphelines (zéro référence nulle part), toutes sur le tenant Big Five, créées sur une
seule semaine (14-21 mai 2026). Supprimées après confirmation explicite. Reste 55 groupes (156
lignes) où plusieurs `MenuItem` du même nom ont chacun un `WeezeventProductMapping` actif —
volontairement non fusionnés (risque de conflation de SKU Weezevent distincts), documentés comme
chantier séparé nécessitant une décision produit.

**BUG-16/17/20/25/26/27/28/29 corrigés et BUG-21 analysé en profondeur le 2026-07-21**, suite à une
revue exhaustive de tous les bugs "Analyse & agrégation" / "Intégrations & ventes" restés 🔴 Ouvert
malgré une fiche existante (même démarche que la session du 2026-07-20 pour BUG-18/19/30) :
- **BUG-025** (🔴 critique, le plus sévère de cette revue) : confirmé en base — 2 tenants réels ont
  aujourd'hui 3 et 4 intégrations Weezevent actives simultanément, chacune authentifiée à tort avec
  les credentials OAuth de la première créée (`WeezeventAuthService`/`WeezeventApiService` cachaient
  et résolvaient le token par `tenantId` seul). Corrigé en scopant tout par `integrationId` — cache
  token, résolution des credentials (lecture directe de `WeezeventIntegrationConfig` au lieu du
  miroir `Tenant.weezeventClientId`), et propagation dans les 15 méthodes de
  `WeezeventClientService` + 18 points d'appel dans 7 fichiers. A fait découvrir BUG-106 (même
  famille, sur le secret webhook — non corrigé, nécessite une nouvelle capacité produit).
- **BUG-026/027/028** : trois gardes/mécanismes documentés comme inopérants et jamais réellement
  câblés — dédup webhook (jamais d'`externalDeliveryId` renseigné : réutilise la signature HMAC,
  déjà déterministe et déjà calculée, comme clé d'idempotence), garde anti-double-run du cron
  (`SyncTrackerService.startSync/completeSync/failSync` jamais appelés — câblés, scopés par
  intégration pour ne pas bloquer à tort 2 intégrations d'un même tenant en sync simultanée), et
  `markTransactionAsDeleted` (ne touchait que `syncedAt` — ajout d'un vrai `deletedAt`, exclu de
  l'agrégation ET des endpoints de listing/analytics qui lisent `SalesTransaction` directement).
- **BUG-016** : refermé "par ricochet" — la divergence de périmètre documentée avait déjà disparu
  comme effet de bord du fix BUG-014 (2026-07-20), vérifié a posteriori.
- **BUG-017/029** : même racine, corrigés ensemble — deux implémentations divergentes de "shop
  mappé ?" (l'une par merchantId sur le mauvais champ, l'autre par location cuid uniquement, la
  troisième ignorant complètement le scope par intégration) unifiées dans
  `MappingsService.hasShopMappingForIntegration`, seule source utilisée maintenant par
  `getIntegrationProgress`, `getAllIntegrationProgress` et `AggregationService.getStep4Context`.
- **BUG-020** : `skipEvent` purge maintenant les data points déjà agrégés de l'event (sinon un event
  traité-puis-skip gardait des `dataPoints > 0` sous un statut affiché "Skipped").
- **BUG-021** : analysé en profondeur, **délibérément laissé ouvert** — `Event` n'a aucune FK vers
  `WeezeventEvent` (jointure par date, par conception d'origine) ; un fix "sans risque" suppose une
  décision produit (comment désambiguïser 2 events le même jour) qu'une heuristique technique
  (nom, proximité horaire) ne peut pas trancher à la place de l'utilisateur sans risquer une
  mauvaise attribution silencieuse sur une RPC financière en production.
- **Bonus découvert en cours de route** : `SpaceProductRevenueDailyAgg.revenueHt` (jumeau non
  corrigé de BUG-015) ne divisait toujours pas par `(1 + vat/100)` — même défaut TTC/HT que
  `SpaceRevenueMinuteAgg`, manqué lors du fix initial car dans une requête SQL distincte du même
  bloc de code. Corrigé au passage.

**BUG-18, BUG-19 et BUG-30 corrigés le 2026-07-20**, en retriant les bugs déjà documentés mais
jamais réellement corrigés des domaines "Analyse & agrégation" / "Intégrations & ventes" (même
famille que BUG-014/015, découverts 🔴 Ouvert de longue date mais jamais portés en code malgré la
fiche existante). BUG-19 : retiré l'écrasement `attempts: 1` de `queueAggregationJob`, hérite
maintenant du retry global (3 tentatives + backoff). BUG-18 :
`createMerchantElementMapping`/`bulkMerchantElementMappings` acceptaient un `spaceElementId` de la
requête sans jamais vérifier qu'il appartient au tenant appelant — repris le pattern déjà correct de
la fonction sœur `createLocationShopMapping` (vérification d'appartenance via
`SpaceElement.findFirst`/`findMany` avec la clause `OR` floor/forecourt/externalMerch/zone avant
tout upsert). BUG-30 : ajout d'un champ `summary.marginWarning` sur `GET .../margin-analysis`,
non-null dès qu'au moins un item vendu n'est pas mappé à un MenuItem (la marge reste mécaniquement
gonflée dans ce cas — coût exclu, vente comptée — corriger le calcul lui-même nécessite une décision
produit non tranchée ; le front ne consomme pas encore ce champ, à brancher séparément).

**105 bugs au total**, 105 ajouté et corrigé le 2026-07-20, découvert en creusant BUG-104 : une fois
l'`organizationId` corrigé, le job de sync par job restait bloqué à "0 inséré" pour toujours. Preuve
en base (requête directe, les logs applicatifs de ce service n'apparaissant pas dans la sortie
consultée) : les transactions s'inséraient bien (1 824 lignes) mais leurs lignes de détail
(`WeezeventTransactionItem`) jamais — `weezeventItemId` (nom de colonne SQL) utilisé au lieu
d'`externalItemId` (nom du champ Prisma) dans les deux services d'insertion (sync par lot ET sync
temps réel webhook), présent depuis le tout premier commit suivi de ce repo. Aucune purge
nécessaire : le pipeline "backfill" déjà en place comble les items manquants des transactions
existantes dès la prochaine sync. Colonne `WeezeventSyncChunk.errorMessage` ajoutée au passage
(ajout surgical via `ALTER TABLE`, `prisma migrate dev`/`db push` bloqués par un drift de schéma
préexistant sans rapport — voir la fiche pour le détail) pour diagnostiquer un futur échec de chunk
sans dépendre des logs serveur.

**104 bugs au total**, 104 ajouté et corrigé le 2026-07-20, découvert en test manuel dans le
navigateur pendant la validation de l'audit `/data-integration/fb` (voir le pendant frontend
[`datafriday-web/docs/bugs/193-221`](../../../datafriday-web/docs/bugs/00_INDEX.md)) : le moteur de
sync par job (bissection) lisait `organizationId` directement sur `Integration` via un cast
`(job as any)`, alors que ce champ a été déplacé sur `WeezeventIntegrationConfig` lors d'une
migration de schéma antérieure — échec à 100% de toute sync avec dates renseignées, sur toutes les
intégrations, indépendamment de leur configuration. Le mécanisme legacy (sync sans dates) n'était
pas affecté.

**103 bugs au total.** 78-88 ajoutés le 2026-07-19 suite à un audit complet de la section
"Configurations" (10 pages : Menu Item Types/Categories, Good Types/Categories, Component
Types/Categories, Brand Names, Display Names, Industrials, Packing Types), mené en 5 audits
parallèles (un par paire de taxonomie/référentiel). Le finding le plus sévère (BUG-78) est une
faille d'autorisation : `update()` sur ProductTypes/Categories n'a jamais eu de garde de permission,
contrairement à `create`/`remove` sur les mêmes contrôleurs. Motif récurrent sur les 6 taxonomies
Type/Category et référentiels plats de cette section : suppression sans garde contre les entités
dépendantes (BUG-79/81/82/85/86, même famille que BUG-75 déjà corrigée pour Events, jamais portée
ici) et désynchronisation des valeurs texte libre miroir lors d'un rename/delete de la taxonomie
source (BUG-83/84, même famille que les bugs 62/81 déjà connus côté frontend, mais côté
update/delete backend cette fois). BUG-80 est un trou d'ownership cross-tenant sur les FK de
taxonomie de `MenuComponent`, même famille que BUG-67 (Events) jamais porté ici. Voir aussi l'audit
miroir côté `datafriday-web` (frontend bugs 159-169) pour les findings purement frontend de la même
session. Fiche de domaine étendue : [`frontend/docs/modules/04_MENU_CATALOGUE.md`](../../../frontend/docs/modules/04_MENU_CATALOGUE.md).

**78-88 corrigés le 2026-07-19**, même jour, en 3 passes parallèles par cluster de fichiers (menu-items
+ menu-components ; market-price-taxonomy + packing-types ; brands/display-names/industrials).
Politique uniformisée sur les 6 gardes de suppression (BUG-79/81/82/85/86) : blocage total
(`ConflictException`, pattern BUG-75) si une entité dépendante existe encore, plutôt que
l'avertissement optionnel initialement envisagé pour Brand/DisplayName/Industrial — choisi pour
rester cohérent avec le reste de la section plutôt que de trancher au cas par cas. BUG-83/84
(désynchronisation texte libre) corrigés par propagation transactionnelle du rename
(`prisma.$transaction`) plutôt que par promotion en FK réelle (chantier plus lourd, jugé non
nécessaire une fois la garde de suppression en place) ; `PackingType` (BUG-84, sans FK du tout)
utilise en plus un blocage de suppression basé sur un `count()` par égalité de texte, faute de FK à
vérifier. BUG-87/88 étendus à l'ensemble des 10 taxonomies/référentiels de la section (pas
seulement les 3 initialement citées dans chaque fiche). Revue de code uniquement — **aucun test
`pnpm dev`/navigateur exécuté dans cette session**, chaque fiche liste les points de validation
manuelle à faire avant déploiement.

**77 bugs au total (à ce stade)**, 77 ajouté le 2026-07-18 suite à une relecture ciblée de `/event-categories`
(frontend→backend) : le fix de BUG-66 (ajout d'une vérification d'ownership sur `eventTypeId` dans
`createEventCategory`) utilisait le mauvais helper — `findOwnedEventTypeOrThrow` (strict) au lieu de
`findAccessibleEventTypeOrThrow` (`OR: [{tenantId}, {tenantId: null}]`, pattern utilisé partout
ailleurs pour cette même relation FK) — cassant la création de catégorie sous un type d'événement
global alors que l'édition de la même catégorie l'acceptait sans problème. Corrigé en réutilisant le
helper existant.

**89-103 ajoutés le 2026-07-18** (numérotés à l'origine 77-91 sur `feat/analyse`, renumérotés au
merge du 2026-07-20 pour éviter la collision avec 77-88 ci-dessus, ajoutés en parallèle sur
`develop`) suite à l'audit croisé /analyse + Event Predict + Stock (inventory/logistics/restock),
mené conjointement côté front (fiches front 172-185) avec objectif de performance « contenu initial
des vues < 300ms ». Côté backend : les 4 endpoints `/analyse/*` documentaient dans Swagger des
réponses qui n'ont jamais existé et ignoraient le `?spaceId=` que le front leur envoyait — sans
témoin, car la découverte centrale de l'audit est que leur unique consommateur front était du code
mort jamais dispatché (fiche front 172) ; agrégations réécrites en SQL (91), garde d'ownership sur
la timeline (90), et surtout mise en cache Redis 60s de la RPC `get_space_shop_details` (~300ms,
chemin critique du premier rendu /analyse — 92). Stock : le couple TOCTOU + contrainte unique
inopérante sur NULLs expliquant les doublons de comptage (93, script SQL `NULLS NOT DISTINCT` +
rattrapage P2002), l'inventaire « vide malgré données » (94), le bulk-update du reset (95), et
l'extension du batch shop-items qui permet au front de tuer le N+1 inventaire (96 — ce qui, avec
l'adoption du batch event-timeline par le moteur predict côté front, solde le vieux BUG-010 passé à
🟢). Restock : BUG-31 mis à jour — le front alerte désormais sur 403 (fiche front 19), le choix de
permissions PUT/DELETE reste posé à Bertrand. Laissés en ⚪ après diagnostic : 97/98/101/102
(décisions produit/architecture ou nettoyages de données prod préalables — cf.
`QUESTIONS_A_BERTRAND.md`). Deux scripts SQL rejouables livrés dans `prisma/sql/` (2026-07-18_*) —
**non branchés à `prisma migrate deploy`, à exécuter manuellement au déploiement** (93/99, voir
`QUESTIONS_A_BERTRAND.md` #4). Au passage : 3 specs préexistantes réparées (mocks obsolètes —
`zone`/`configurationElement` manquants dans spaces.service.spec qui tuaient le process jest en
silence, `event` manquant + `eventName` non attendu dans inventory.service.spec, caches RecipeCtx
manquants dans logistics.service.spec).

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

1. Copier [`TEMPLATE.md`](TEMPLATE.md) vers `NNN_AA_slug-court.md` :
   - `NNN` = numéro suivant disponible (best-effort — voir "Collisions" ci-dessous).
   - `AA` = ton code auteur à 2 chiffres :

     | Code | Auteur |
     |---|---|
     | `01` | Jean-Luc |
     | `02` | Ulrich |
     | `03` | Emmanuel |

     Un agent qui commit pour l'un d'entre eux utilise le code de la personne pour laquelle il
     travaille (pas un code générique "agent") ; en cas de doute sur qui est l'auteur réel, demander
     plutôt que de deviner.
2. Remplir les champs, en citant `fichier:ligne` dès que la cause racine est identifiée. Le titre en
   première ligne du fichier suit `# BUG-NNN-AA — Titre...`.
3. Ajouter une ligne dans le tableau ci-dessus (référencer le bug en prose sous la forme
   `BUG-NNN-AA`, ex. `BUG-169-02`).
4. Si le bug touche aussi l'autre repo, créer une fiche miroir courte côté
   [`datafriday-web`](../../../datafriday-web/docs/bugs/) qui pointe vers celle-ci (voir BUG-012 /
   front BUG-007 comme exemple).

**Pourquoi le code auteur (`AA`)** : `NNN` seul est "le prochain numéro disponible" au moment où on
crée la fiche — sur des branches parallèles, deux personnes peuvent choisir le même `NNN` sans le
savoir. C'est déjà arrivé dans ce changelog (89-103, numérotés à l'origine 77-91 sur `feat/analyse`,
renumérotés au merge du 2026-07-20 pour éviter la collision avec 77-88 ajoutés en parallèle sur
`develop` — voir plus bas), et il a fallu renuméroter après coup (le pendant frontend a le même
type d'historique, en pire : un doublon `193` jamais résolu, voir son `00_INDEX.md`). Le suffixe
`AA` rend `NNN_AA` unique dès la création : si deux
personnes tombent sur le même `NNN`, les deux fiches coexistent simplement (`169_01` et `169_03` par
exemple) sans renumérotation obligatoire — un nettoyage manuel reste possible plus tard si on veut,
mais n'est plus nécessaire pour éviter un conflit.

**Rétroactivité** : les fiches déjà créées avant le 2026-07-28 gardent leur nom `NN_slug.md` actuel
(sans code auteur) — non renommées. Cette convention s'applique aux nouvelles fiches à partir de
maintenant.
