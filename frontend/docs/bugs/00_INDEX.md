# Bugs — index

> Un fichier par bug, format défini par [`TEMPLATE.md`](TEMPLATE.md). Bugs frontend ou transverses
> (avec impact frontend) ici ; bugs purement backend dans
> [`api-datafriday-staging/docs/bugs/00_INDEX.md`](../../../api-datafriday-staging/docs/bugs/00_INDEX.md).
>
> **But** : un dev ou un agent doit pouvoir, avant de toucher au code d'un module, vérifier ici
> s'il y a un bug connu — pour ne pas recorriger deux fois la même chose, ni construire par-dessus
> un défaut déjà identifié. Voir aussi [`../CARTOGRAPHIE_MODULES.md`](../CARTOGRAPHIE_MODULES.md)
> et [`../modules/00_INDEX.md`](../modules/00_INDEX.md) pour le contexte métier
> complet de chaque domaine.
>
> Statut : 🔴 Ouvert · 🟡 Corrigé non déployé · 🟢 Corrigé · ⚪ Diagnostiqué · ⚫ Won't fix

| # | Titre | Statut | Sévérité | Domaine |
|---|---|---|---|---|
| [01](01_selection_role_bloquee_drawer_edit_user.md) | Sélection de rôle impossible dans le drawer Edit user | 🟢 Corrigé | 🟠 | RBAC / Users |
| [02](02_floors_dupliques_ids_desync_builder.md) | Floors dupliqués / IDs désynchronisés dans le builder | 🟢 Corrigé | 🟠 | Espaces & builder |
| [03](03_badge_etage_reset_stepmapshops.md) | Badge étage réinitialisé dans StepMapShops | 🟢 Corrigé | 🟡 | Intégrations & ventes |
| [04](04_dropdown_packaging_mauvaise_taxonomie.md) | Dropdown packaging Market Price sur la mauvaise taxonomie | 🟡 Corrigé non testé | 🟠 | Achats & référentiels |
| [05](05_freezer_vs_frozen_valeur_invalide.md) | "Freezer" vs Frozen — valeur de formulaire invalide | 🔴 Ouvert | 🔴 | Menu & recettes |
| [06](06_supplier_sites_semantique_contradictoire.md) | Supplier.sites vide — sémantique contradictoire | 🔴 Ouvert | 🟠 | Achats & référentiels |
| [07](07_scoping_config_manquant_spacemenus_front.md) | Scoping config manquant perf/staff/inventory Space Menus (volet front) | 🟢 Corrigé | 🟠 | Espaces & builder |
| [08](08_manualquantities_jamais_envoye_backend.md) | manualQuantities jamais envoyé au backend | 🔴 Ouvert | 🟠 | Prévision |
| [09](09_availability_combo_ou_au_lieu_de_et.md) | Availability Combo utilise OU au lieu de ET | 🔴 Ouvert | 🟠 | Prévision |
| [10](10_assign_shop_items_emit_non_declare.md) | assign-shop-items émis sans être déclaré dans emits | 🔴 Ouvert | 🟡 | Prévision |
| [11](11_update_viewmode_jamais_emis.md) | update:viewMode déclaré mais jamais émis | 🔴 Ouvert | 🟢 | Prévision |
| [12](12_usepredictivetimeline_fonctions_mortes_edge_legacy.md) | usePredictiveTimeline.js : fonctions de persistance mortes | 🔴 Ouvert | 🟢 | Prévision |
| [13](13_team_api_commentaire_obsolete.md) | team.api.js : commentaire obsolète sur /teams | 🔴 Ouvert | 🟢 | Prévision / Événements |
| [14](14_triple_formule_ca_moyen_event.md) | Triple formule "CA moyen par event" incohérente | 🔴 Ouvert | 🟠 | Analyse & agrégation |
| [15](15_futureeventscount_deux_implementations.md) | futureEventsCount : deux implémentations divergentes | 🔴 Ouvert | 🟡 | Analyse & agrégation |
| [16](16_synchro_cross_config_v1_non_transactionnelle.md) | Synchro cross-config v1 non transactionnelle | 🔴 Ouvert | 🟠 | Espaces & builder |
| [17](17_useisoprojection_duplique_isoview.md) | useIsoProjection.js dupliqué dans IsoView.vue | 🔴 Ouvert | 🟢 | Espaces & builder |
| [18](18_props_morts_port_react_builder_v1.md) | Props morts hérités du port React (Builder v1) | 🔴 Ouvert | 🟢 | Espaces & builder |
| [19](19_restock_403_silencieux_front.md) | Restock 403 : le front avale l'erreur sans prévenir | 🔴 Ouvert | 🔴 | Stock |
| [20](20_filtre_storage_material_jamais_match.md) | Filtre storage 'material' (Inventory) : jamais aucun article ne matche | 🔴 Ouvert | 🟠 | Stock |
| [21](21_filtre_storage_merch_pas_de_filtre.md) | Filtre storage 'merch' (Inventory) : aucun filtre réel | 🔴 Ouvert | 🟠 | Stock |
| [22](22_drawers_inventory_inatteignables.md) | Drawers Inventory montés mais inatteignables (mobile) | 🔴 Ouvert | 🟠 | Stock |
| [23](23_fonctions_inventory_ciblent_ancien_backend_supabase.md) | Fonctions Inventory ciblent un ancien backend Supabase | 🔴 Ouvert | 🟠 | Stock |
| [24](24_getreconciliation_export_mort.md) | getReconciliation (singulier) : export mort | 🔴 Ouvert | 🟢 | Stock |
| [25](25_gating_team_incoherent.md) | Gating "Team" incohérent, deux écrans, deux comportements | 🔴 Ouvert | 🟠 | Événements |
| [26](26_bulk_create_wizard_taxonomie_non_reportee.md) | Bulk-create du wizard ne reporte pas la taxonomie vers l'Event | 🔴 Ouvert | 🟡 | Événements |
| [27](27_bypass_demo_actif_sans_distinction_env.md) | Bypass démo (?demo=1) actif sans distinction dev/prod | 🔴 Ouvert | 🟡 | Auth & onboarding |
| [28](28_predict_test_sans_guard_auth.md) | /predict-test monté sans guard d'authentification | 🔴 Ouvert | 🟡 | Auth & onboarding |
| [29](29_cle_anon_supabase_codee_en_dur.md) | Clé anonyme Supabase codée en dur (hygiène) | 🔴 Ouvert | 🟢 | Auth & onboarding |
| [30](30_good_category_ecrase_watcher_race_market_price.md) | "Good Category" écrasé à l'ouverture du drawer Edit Item (Market Prices) | 🟢 Corrigé | 🟠 | Achats & référentiels |
| [31](31_kitchentype_traductions_manquantes_inventory_menu_item.md) | Traductions "Kitchen Type" manquantes + design incohérent sur Inventory Information (Menu Item) | 🟢 Corrigé | 🟡 | Menu & recettes |
| [32](32_logistic_marketprice_selecteur_non_scope_et_total_colle.md) | Logistic : sélecteur Market Price non scopé (corrompt le pack size) + Total quantité/unité collés | 🟢 Corrigé | 🟠 | Stock |
| [33](33_exceedscap_ignore_casse_de_pack_bloque_retrait_valide.md) | `exceedsCap` ignore la casse de pack : bloque des retraits/transferts pourtant valides | 🟢 Corrigé | 🟠 | Stock |
| [34](34_supplier_notes_jamais_persiste_mirror.md) | `Supplier.notes` accepté par l'API mais jamais persisté (fiche miroir, cause racine backend) | 🟢 Corrigé | 🟡 | Achats & référentiels |
| [35](35_component_inventorypackaging_packedunits_jamais_envoyes.md) | Component : "is stored in" (packaging) et quantité par carton jamais envoyés au backend | 🟢 Corrigé | 🟡 | Menu & recettes |
| [36](36_market_prices_vide_avant_affichage_loading_non_cable.md) | Market Prices : tableau vide ("No data") avant l'affichage réel des lignes | 🟢 Corrigé | 🟡 | Achats & référentiels |
| [37](37_market_prices_pagination_bloquee_a_10_items_per_page.md) | Market Prices : pagination client bloquée à 10 lignes (défaut Vuetify non configuré) | 🟢 Corrigé | 🟡 | Achats & référentiels |
| [38](38_market_prices_keepalive_activated_mort.md) | Market Prices : hook `activated()` mort (aucun `<keep-alive>` autour du router-view) | 🟢 Corrigé | 🟢 | Achats & référentiels |
| [39](39_market_prices_recherche_sans_debounce.md) | Market Prices : recherche sans debounce (recalcul à chaque frappe) | 🟢 Corrigé | 🟢 | Achats & référentiels |
| [40](40_market_prices_cap_silencieux_200_lignes_mirror.md) | `GET /market-prices` plafonné à 200 lignes sans pagination réelle (fiche miroir) | 🟢 Corrigé | 🟠 | Achats & référentiels |

**40 bugs au total**, extraits de [`../modules/`](../modules/00_INDEX.md) (source exhaustive,
~61 bugs recensés dont certains purement backend — voir l'index miroir) le 2026-07-15 ; 34-35
ajoutés le 2026-07-16 en auditant les payloads backend de fichiers récupérés depuis une copie
parallèle du repo (`old-web`) ; 36-40 ajoutés le 2026-07-16 suite à une analyse directe de la page
`/market-prices` (vide avant affichage, pagination à 10, code mort keepAlive, recherche sans
debounce, cap silencieux à 200 lignes).

## Comment ajouter un bug

1. Copier [`TEMPLATE.md`](TEMPLATE.md) vers `NN_slug-court.md` (numéro suivant disponible).
2. Remplir les champs, en citant `fichier:ligne` dès que la cause racine est identifiée.
3. Ajouter une ligne dans le tableau ci-dessus.
4. Si le bug touche aussi l'autre repo, créer une fiche miroir courte côté
   [`api-datafriday-staging`](../../../api-datafriday-staging/docs/bugs/) qui pointe vers
   celle-ci (voir BUG-007 / backend BUG-012 comme exemple).
