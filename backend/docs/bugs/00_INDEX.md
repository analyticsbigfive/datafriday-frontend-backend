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
| [03](03_taxonomie_croisee_marketprice_menuitem.md) | Taxonomie croisée Market Price / Menu Item | 🟡 Corrigé non déployé | 🟠 | Achats & référentiels |
| [04](04_mappings_orphelins_save_builder.md) | Mappings orphelins après sauvegarde du builder | ⚪ Diagnostiqué | 🟠 | Intégrations & ventes |
| [05](05_menuitem_mappe_sans_espace.md) | Menu item mappé sans association Espace | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [06](06_perte_tva_bulk_automap.md) | Perte de TVA lors du bulk auto-map | 🟡 Corrigé partiel | 🟠 | Intégrations & ventes |
| [07](07_prix_fnb_weezevent_absent.md) | Prix F&B Weezevent absent du catalogue | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [08](08_tva_defaut_20_incorrecte.md) | TVA par défaut 20% incorrecte | 🟢 Corrigé | 🟠 | Menu & recettes |
| [09](09_deconnexion_intempestive_multi_onglets.md) | Déconnexion intempestive pendant l'édition (multi-onglets) | 🟡 Corrigé partiel | 🔴 | Auth & onboarding |
| [10](10_n1_queries_toolbox_predict.md) | Requêtes N+1 dans le toolbox Event Predict | 🔴 Ouvert | 🟡 | Prévision |
| [11](11_routes_kv_mortes.md) | Routes /kv mortes (KvModule non enregistré) | 🔴 Ouvert | 🟡 | Technique |
| [12](12_scoping_config_manquant_spacemenus.md) | Scoping config manquant perf/staff/inventory Space Menus | 🟡 Corrigé non déployé | 🟠 | Espaces & builder |
| [13](13_predictversion_update_jamais_appelee.md) | PredictVersionsService.update() jamais appelée | 🔴 Ouvert | 🟢 | Prévision |
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

**47 bugs au total**, extraits de `datafriday-web/docs/modules/` (source exhaustive, ~61 bugs
recensés dont certains purement frontend — voir l'index miroir) le 2026-07-15 ; 44-47 ajoutés le
2026-07-15 suite à un diagnostic direct sur `/spaces/:id/logistic`.

## Comment ajouter un bug

1. Copier [`TEMPLATE.md`](TEMPLATE.md) vers `NN_slug-court.md` (numéro suivant disponible).
2. Remplir les champs, en citant `fichier:ligne` dès que la cause racine est identifiée.
3. Ajouter une ligne dans le tableau ci-dessus.
4. Si le bug touche aussi l'autre repo, créer une fiche miroir courte côté
   [`datafriday-web`](../../../datafriday-web/docs/bugs/) qui pointe vers celle-ci (voir BUG-012 /
   front BUG-007 comme exemple).
