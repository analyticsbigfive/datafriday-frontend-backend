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
| [41](41_market_prices_import_csv_succes_partiel_invisible_et_doublons_mirror.md) | Import CSV Market Prices : succès partiel invisible et doublons au réimport (fiche miroir) | 🟢 Corrigé | 🟠 | Achats & référentiels |
| [42](42_market_prices_import_csv_goodtype_verrouille_valeurs_fixes.md) | Import CSV Market Prices : `goodType` verrouillé à 4 valeurs fixes (référentiel pourtant dynamique) | 🟢 Corrigé | 🟠 | Achats & référentiels |
| [43](43_market_prices_import_csv_supplierid_jamais_resolu.md) | Import CSV Market Prices : `supplierId` jamais résolu (fournisseur toujours en texte libre) | 🟢 Corrigé | 🟠 | Achats & référentiels |
| [44](44_market_prices_import_csv_priceperunit_incoherent.md) | Import CSV Market Prices : `pricePerUnit` mappé depuis "Cost Per Recipe Unit" (double application de la conversion) | 🟢 Corrigé | 🟠 | Achats & référentiels |
| [45](45_market_prices_import_csv_parsing_champs_multilignes.md) | Import CSV Market Prices : parsing casse sur un champ entre guillemets contenant un saut de ligne | 🟢 Corrigé | 🟡 | Achats & référentiels |
| [46](46_market_prices_import_csv_barre_progression_trompeuse.md) | Import CSV Market Prices : barre de progression figée pendant l'envoi réseau | 🟢 Corrigé | 🟡 | Achats & référentiels |
| [47](47_market_prices_export_import_champs_incomplets.md) | Export/Import CSV Market Prices : la moitié des champs du modèle absents (image, industriel, emballages, dimensions) | 🟢 Corrigé | 🟠 | Achats & référentiels |
| [48](48_market_prices_import_csv_alias_dimensions_cm_non_reconnu.md) | Import CSV Market Prices : alias d'auto-mapping des dimensions "(cm)" non reconnu | 🟢 Corrigé | 🟡 | Achats & référentiels |
| [49](49_market_prices_import_csv_message_fichier_vide_trompeur.md) | Import CSV Market Prices : message "Nothing to import (empty file?)" trompeur quand des lignes ont bien été envoyées | 🟢 Corrigé | 🟠 | Achats & référentiels |
| [50](50_market_prices_import_csv_dedup_supplierid_fragile_mirror.md) | Import CSV Market Prices : réimport créant des doublons malgré le dédoublonnage (fiche miroir) | 🟢 Corrigé | 🟠 | Achats & référentiels |
| [51](51_market_prices_import_csv_dedup_decimal_number_mirror.md) | Import CSV Market Prices : dédoublonnage totalement inopérant pour la plupart des prix (fiche miroir) | 🟢 Corrigé | 🔴 | Achats & référentiels |
| [52](52_suppliers_get_plafond_silencieux_100_lignes_mirror.md) | GET /suppliers plafonné à 100 lignes sans pagination réelle côté front (fiche miroir) | 🟢 Corrigé | 🟠 | Achats & référentiels |
| [53](53_component_inventorypackaging_packedunits_jamais_restaures_edition.md) | Component : "is stored in"/quantité par carton jamais restaurés en édition (fix BUG-035 partiel) | 🟢 Corrigé | 🟠 | Menu & recettes |
| [54](54_menu_components_get_plafond_silencieux_100_lignes_mirror.md) | GET /menu-components plafonné à 100 lignes sans pagination réelle (fiche miroir) | 🟢 Corrigé | 🟠 | Menu & recettes |
| [55](55_component_subcomponents_ecrase_a_chaque_save.md) | `subComponents: {}` écrasé à chaque sauvegarde d'un Component | 🟢 Corrigé | 🟡 | Menu & recettes |
| [56](56_component_numberofunitsrecipe_sans_validation.md) | `numberOfUnitsRecipe` sans validation (0/négatif accepté) | 🟢 Corrigé | 🟠 | Menu & recettes |
| [57](57_component_export_csv_colonnes_vides.md) | Export CSV Components : colonnes "Number of Units Recipe"/"Description" toujours vides | 🟢 Corrigé | 🟡 | Menu & recettes |
| [58](58_component_doublon_sous_item_suppression_groupee.md) | Doublon de sous-item Component : suppression groupée accidentelle | 🟢 Corrigé | 🟠 | Menu & recettes |
| [59](59_component_marketprice_null_safety_incomplete.md) | Null-safety incomplète sur `ingredient.marketPrice` (tiroir sub-items) | 🟢 Corrigé | 🟡 | Menu & recettes |
| [60](60_component_formatcurrency_incoherent_3_implementations.md) | `formatCurrency` : 3 implémentations incohérentes dans component-library | 🟢 Corrigé | 🟢 | Menu & recettes |
| [61](61_component_i18n_contourne_localstorage_manuel_et_textes_en_dur.md) | i18n contourné (localStorage manuel + textes en dur) dans componentListView/ComponentCreateView | 🟡 Corrigé non testé | 🟢 | Menu & recettes |
| [62](62_component_taxonomie_fk_resolution_fragile_par_nom.md) | Component : `componentTypeId`/`componentCategoryId` re-résolus par nom, perte silencieuse possible | 🟢 Corrigé | 🟡 | Menu & recettes |
| [63](63_component_n_plus_1_requetes_detail_ingredients.md) | N+1 requêtes API pour charger le détail des ingrédients (liste + formulaire d'édition) | ⚪ Diagnostiqué | 🟢 | Menu & recettes |
| [64](64_component_api_client_duplique_non_couvert_par_pagination.md) | `component.api.js` : client MenuComponent dupliqué, non couvert par le fix pagination BUG-054 | 🟢 Corrigé | 🟢 | Menu & recettes |
| [65](65_component_logs_debug_laisses_en_production.md) | Logs de debug laissés en production dans ComponentCreateView/componentListView | 🟢 Corrigé | 🟢 | Menu & recettes |
| [66](66_component_loadingcomponent_loadingerror_jamais_affiches.md) | `loadingComponent`/`loadingError` jamais affichés dans ComponentCreateView.vue | 🟢 Corrigé | 🟡 | Menu & recettes |
| [67](67_component_methode_t_dupliquee_dead_code.md) | Méthode `t()` définie deux fois dans ComponentCreateView.vue (dead code) | 🟢 Corrigé | 🟢 | Menu & recettes |
| [68](68_menu_items_sync_categories_factice.md) | Bouton "Synchroniser les catégories" 100% factice (MenuItemView) | 🟢 Corrigé | 🟠 | Menu & recettes |
| [69](69_menu_items_activated_force_refetch_ignore_cache_ttl.md) | `activated()` force un refetch complet ignorant le cache TTL (MenuItemView) | 🟢 Corrigé | 🟠 | Menu & recettes |
| [70](70_menu_items_store_fetchmenuitems_sans_inflight.md) | `menuItems.js` : `fetchMenuItems` sans registre `inflight`, risque de course | 🟢 Corrigé | 🟠 | Menu & recettes |
| [71](71_menu_items_bulk_delete_erreurs_avalees.md) | Suppression en masse de MenuItem : erreur individuelle avalée | 🟢 Corrigé | 🟠 | Menu & recettes |
| [72](72_menu_items_refresh_costs_echec_silencieux.md) | `onRefreshCosts` : échec silencieux pour l'utilisateur | 🟢 Corrigé | 🟠 | Menu & recettes |
| [73](73_menu_items_export_csv_rafale_requetes.md) | Export CSV MenuItem : rafale de requêtes non throttlées | 🟢 Corrigé | 🟡 | Menu & recettes |
| [74](74_menu_items_bouton_combo_item_non_fonctionnel.md) | Bouton "Ajouter un article combo" non fonctionnel | ⚪ Diagnostiqué | 🟠 | Menu & recettes |
| [75](75_menu_items_creation_type_categorie_echec_silencieux_fk_vide.md) | MenuItemCreateView : échec silencieux création type/catégorie → FK vide | 🟢 Corrigé | 🟠 | Menu & recettes |
| [76](76_menu_items_groupe_prix_non_editable_en_edition.md) | Impossible d'ajouter/modifier un groupe de prix en édition | ⚪ Diagnostiqué | 🟠 | Menu & recettes |
| [77](77_menu_items_marge_affichee_vs_marge_sauvegardee.md) | Marge affichée par groupe ≠ marge sauvegardée en base | ⚪ Diagnostiqué | 🟠 | Menu & recettes |
| [78](78_menu_items_validations_numeriques_manquantes.md) | MenuItemCreateView : validations numériques manquantes | 🟢 Corrigé | 🟡 | Menu & recettes |
| [79](79_menu_items_logs_debug_et_alert_natif.md) | Logs de debug et `alert()` natif laissés en production | 🟢 Corrigé | 🟡 | Menu & recettes |
| [80](80_menu_items_code_mort_menuitemcreateview.md) | Volume important de code mort dans MenuItemCreateView.vue | 🟢 Corrigé | 🟡 | Menu & recettes |
| [81](81_menu_items_fk_taxonomie_resolue_par_nom.md) | MenuItemCreateView : FK type/catégorie re-résolues par nom | 🟢 Corrigé | 🟡 | Menu & recettes |
| [82](82_menu_items_upload_image_sans_validation.md) | Aucune validation de taille/type sur l'upload d'image | 🟢 Corrigé | 🟡 | Menu & recettes |
| [83](83_menu_items_formdrawer_orphelin_code_mort.md) | `MenuItemFormDrawer.vue` : fichier orphelin de 976 lignes, jamais importé | 🟢 Corrigé | 🟠 | Menu & recettes |
| [84](84_menu_items_csv_parsing_casse_guillemets.md) | Import CSV MenuItem : parsing cassé sur champ multilignes/échappé | 🟢 Corrigé | 🔴 | Menu & recettes |
| [85](85_menu_items_csv_succes_partiel_invisible.md) | Import CSV MenuItem : succès partiel invisible, pas de try/catch par item | 🟢 Corrigé | 🔴 | Menu & recettes |
| [86](86_menu_items_csv_pas_de_dedup_reimport.md) | Import CSV MenuItem : aucune déduplication au réimport | 🟢 Corrigé | 🟠 | Menu & recettes |
| [87](87_menu_items_csv_resolution_type_categorie_fragile.md) | Import CSV MenuItem : résolution type/catégorie fragile et silencieuse | 🟢 Corrigé | 🟠 | Menu & recettes |
| [88](88_menu_items_csv_ergonomie_alias_fr_et_feedback_vide.md) | Import CSV MenuItem : ergonomie (alias FR absents, feedback fichier vide) | 🟢 Corrigé | 🟡 | Menu & recettes |
| [89](89_menu_items_picker_drawers_cap_pagination_silencieux.md) | Pickers Ingredient/Packaging : cap silencieux de pagination (fiche miroir) | 🟢 Corrigé | 🟠 | Menu & recettes |
| [90](90_menu_items_ingredientpicker_storage_incorrect.md) | IngredientPickerDrawer : champ storage rempli avec la catégorie d'achat | 🟢 Corrigé | 🟠 | Menu & recettes |
| [91](91_menu_items_pickers_dark_mode_incomplet.md) | Mode sombre non supporté par 2 des 3 pickers de recette | 🟢 Corrigé | 🟠 | Menu & recettes |
| [92](92_menu_items_pickers_sans_filtre_active.md) | Aucun filtre `active=true` dans les pickers Ingredient/Packaging | 🟢 Corrigé | 🟠 | Menu & recettes |
| [93](93_menu_items_recipeimportdrawer_parseur_virgule_uniquement.md) | RecipeImportDrawer : parseur CSV virgule uniquement, message trompeur | 🟢 Corrigé | 🟠 | Menu & recettes |
| [94](94_menu_items_recipeimportdrawer_readyforsale_echecs_invisibles.md) | RecipeImportDrawer : échecs de mise à jour `readyForSale` invisibles | 🟢 Corrigé | 🔴 | Menu & recettes |
| [95](95_menu_items_spacegroupdrawer_scroll_lock_sans_compteur.md) | SpaceGroupDrawer : verrou de scroll body sans compteur de référence | 🟢 Corrigé | 🟡 | Menu & recettes |
| [96](96_menu_items_spaceselectiondrawer_orphelin_code_mort.md) | `SpaceSelectionDrawer.vue` : fichier orphelin de 361 lignes, jamais importé | 🟢 Corrigé | 🟠 | Menu & recettes |
| [97](97_menu_items_creation_type_categorie_doublon_500_generique.md) | CreateTypeDialog/CreateCategoryDialog : doublon de nom → 500 générique | 🟢 Corrigé | 🟠 | Menu & recettes |
| [98](98_menu_items_deletedialog_non_persistent.md) | MenuItemDeleteDialog : pas de `persistent`, fermable pendant requête | 🟢 Corrigé | 🟠 | Menu & recettes |
| [99](99_menu_items_dialogs_creation_duplication_non_factorisee.md) | 3 dialogs de création quasi dupliqués, non factorisés | ⚪ Diagnostiqué | 🟡 | Menu & recettes |
| [100](100_menu_items_i18n_contourne_multi_fichiers.md) | i18n contourné / texte en dur sur toute la page `/menu-items` | 🟢 Corrigé | 🟠 | Menu & recettes |
| [101](101_menu_items_formatcurrency_incoherent_multi_fichiers.md) | `formatCurrency` réimplémenté de façon incohérente sur `/menu-items` | 🟢 Corrigé | 🟡 | Menu & recettes |
| [102](102_menu_items_petits_nettoyages_code_mort.md) | Petits nettoyages de code mort sur `/menu-items` | 🟢 Corrigé | 🟡 | Menu & recettes |
| [103](103_menu_items_store_byspace_mort_commentaire_trompeur.md) | `menuItems.js` : cache `bySpace` entièrement mort, commentaire trompeur | 🟢 Corrigé | 🟠 | Menu & recettes |
| [104](104_menu_items_routes_backend_non_exposees_recipeimport_reimplemente.md) | `menu-item.api.js` : 3 routes backend utiles non exposées côté client | 🟢 Corrigé | 🟠 | Menu & recettes |
| [105](105_menu_items_usespacedata_mauvais_client_component_api.md) | `useSpaceData.js` : mauvais client API pour MenuComponent (non paginé) | 🟢 Corrigé | 🟠 | Menu & recettes |
| [106](106_menu_items_pas_de_loading_et_chargement_catalogue_complet.md) | MenuItemView : pas d'indicateur de chargement + catalogue complet chargé d'un coup (pagination serveur réelle ajoutée) | 🟢 Corrigé | 🟠 | Menu & recettes |
| [107](107_menu_items_export_csv_lent_incomplet_ids_bruts.md) | Export CSV MenuItem : lent (N+1), champs incomplets, recette en IDs bruts non portables | 🟢 Corrigé (export) | 🟠 | Menu & recettes |
| [108](108_menu_items_csv_reimport_format_multi_lignes.md) | Import CSV MenuItem : support du format multi-lignes (une ligne par recette) de l'export | 🟢 Corrigé | 🟠 | Menu & recettes |
| [109](109_menu_items_import_dropzone_hauteur_non_remplie.md) | Import CSV MenuItem : dropzone de l'étape 1 n'utilise pas toute la hauteur du tiroir | 🟢 Corrigé | 🟡 | Menu & recettes |
| [110](110_menu_items_export_placeholder_tiret_casse_reimport.md) | Export/Import CSV MenuItem : le placeholder d'affichage "-" cassait le réimport en masse | 🟢 Corrigé | 🔴 | Menu & recettes |
| [111](111_menu_items_import_ui_trop_dense_listes_non_actionnables.md) | Import CSV MenuItem : interface trop dense, listes d'erreurs sans action possible | 🟢 Corrigé | 🟡 | Menu & recettes |
| [112](112_menu_items_import_mapping_creation_auto_referentiels.md) | Import CSV MenuItem : pas de mapping de colonnes ni de création auto des référentiels manquants | 🟢 Corrigé | 🟠 | Menu & recettes |

**112 bugs au total**, extraits de [`../modules/`](../modules/00_INDEX.md) (source exhaustive,
~61 bugs recensés dont certains purement backend — voir l'index miroir) le 2026-07-15 ; 34-35
ajoutés le 2026-07-16 en auditant les payloads backend de fichiers récupérés depuis une copie
parallèle du repo (`old-web`) ; 36-40 ajoutés le 2026-07-16 suite à une analyse directe de la page
`/market-prices` (vide avant affichage, pagination à 10, code mort keepAlive, recherche sans
debounce, cap silencieux à 200 lignes) ; 41-46 ajoutés le 2026-07-16 suite à une analyse du drawer
d'import CSV `/market-prices` (succès partiel invisible, doublons, goodType verrouillé,
supplierId non résolu, pricePerUnit incohérent, parsing multi-lignes, progression trompeuse) ; 47
ajouté le 2026-07-16 suite à un audit d'exhaustivité des champs export/import contre le modèle
`MarketPrice` complet ; 48 ajouté le 2026-07-16 en vérifiant par simulation qu'un round-trip
export→import fonctionnerait de bout en bout (alias des colonnes de dimensions "(cm)") ; 49 ajouté
le 2026-07-16 suite à un signalement utilisateur d'un message "fichier vide" trompeur après un
import réel ; 50 ajouté le 2026-07-16 suite à un signalement utilisateur de doublons réels créés
malgré le fix de dédoublonnage (supplierId trop fragile comme clé de comparaison) ; 51 ajouté le
2026-07-16 suite à un nouveau signalement de doublons malgré le fix 50 — cause racine : comparaison
Decimal/number Prisma silencieusement cassée ; 52 ajouté et corrigé le 2026-07-16 suite à un audit
de la page `/suppliers` (mêmes dette technique et cause racine que le cap 200 lignes de BUG-040,
jamais répliqué côté suppliers) ; 53-67 ajoutés et corrigés le 2026-07-16 suite à un audit complet de
la page `/components` et de ses composants (liste, formulaire création/édition, tiroirs de
sélection ingrédients/composants) : régression partielle du fix BUG-035 (packaging jamais restauré
en édition), cap silencieux à 100 lignes (même cause que BUG-040/052), champ legacy `subComponents`
écrasé à chaque save, absence de validation sur `numberOfUnitsRecipe`, colonnes CSV export toujours
vides, doublons de sous-items entraînant une suppression groupée accidentelle, null-safety
incomplète sur les ingrédients sans fournisseur, incohérences de formatage monétaire, i18n contourné,
résolution fragile des FK de taxonomie, N+1 sur le détail des ingrédients (documenté, non corrigé —
nécessite un endpoint backend batch) et client API dupliqué non couvert par le fix de pagination
(documenté, non corrigé — hors périmètre de cette page), plus quelques nettoyages de code mort
(logs de debug, méthode dupliquée, états loading/error jamais affichés) ; 68-105 ajoutés et
majoritairement corrigés le 2026-07-17 suite à un audit complet de la page `/menu-items` et de
ses 14 composants (liste, formulaire création/édition 3019 lignes, tiroirs de sélection
ingrédients/composants/packaging, imports CSV articles et recettes, tiroirs/dialogs d'espaces et
de référentiels, store Vuex, client API, composables) : deux fichiers entiers orphelins jamais
importés (`MenuItemFormDrawer.vue` 976 lignes, `SpaceSelectionDrawer.vue` 361 lignes, supprimés),
parsing CSV cassé sur champs multilignes/échappés (2 imports distincts), succès partiels invisibles
sans détail des lignes en échec, échecs de mise à jour `readyForSale` totalement silencieux malgré
leur impact sur l'éclatement composants Event Predict/Logistics, absence de registre `inflight` sur
le store (même piège déjà corrigé ailleurs dans le domaine), cache Vuex `bySpace` entièrement mort
avec un commentaire trompeur, cap silencieux de pagination sur 2 modules non couverts par les fix
précédents (BUG-040/054), mode sombre non supporté par 2 des 3 pickers de recette, aucun filtre
`active` sur les ingrédients/packagings désactivés, FK taxonomie re-résolues par nom, marge
affichée incohérente avec la marge sauvegardée (diagnostiqué, décision produit nécessaire), bouton
combo item et édition de groupe de prix non fonctionnels (diagnostiqués, décisions produit
nécessaires), plus les patterns transverses déjà vus sur `/components` (i18n contourné,
`formatCurrency` incohérent, nettoyages de code mort) répliqués et corrigés sur l'ensemble de la
page ; 106 ajouté et corrigé le 2026-07-17 suite à un signalement utilisateur direct (spinner
manquant + catalogue complet rechargé à chaque affichage) — pagination serveur réelle ajoutée en
plus du spinner, tout en gardant le mode "regroupé par type/catégorie" (design validé client) actif
par défaut ; 107-112 ajoutés et corrigés le 2026-07-17 suite à un test réel de réimport par
l'utilisateur de son propre export `/menu-items`, qui échouait presque totalement : export lent
(N+1 réseau supprimé, données déjà en mémoire), champs incomplets, colonne "Recipe" packée en IDs
internes remplacée par une ligne par ingrédient/composant/packaging identifiée par NOM (BUG-107),
import capable de relire ce nouveau format multi-lignes (BUG-108), interface d'import trop dense
avec des listes d'erreurs non actionnables (BUG-111), et surtout un bug de fond où l'export
écrivait le placeholder d'affichage `"-"` comme si c'était un vrai nom de type — cassant le
réimport de presque tous les articles sans type (BUG-110) ; enfin BUG-112 porte l'écran de mapping
de colonnes et la création automatique des référentiels Type/Catégorie/Marque/Nom d'affichage
manquants (à l'image de `MarketPriceCsvImportDrawer.vue`), pour qu'un import entre deux comptes
différents ne bute plus sur un référentiel absent — les lignes de recette (Ingredient/Component/
Packaging) restent volontairement exclues de cette auto-création (coût/unité non déductibles d'un
simple nom). BUG-005 (Freezer/Frozen) mis à jour le 2026-07-17 : son fichier `MenuItemFormDrawer.vue`
ayant été supprimé (BUG-083), seule l'occurrence `MenuItemCreateView.vue:504` reste active — bug
toujours non corrigé (décision produit du 2026-07-15 à reconfirmer avant d'y toucher).

## Comment ajouter un bug

1. Copier [`TEMPLATE.md`](TEMPLATE.md) vers `NN_slug-court.md` (numéro suivant disponible).
2. Remplir les champs, en citant `fichier:ligne` dès que la cause racine est identifiée.
3. Ajouter une ligne dans le tableau ci-dessus.
4. Si le bug touche aussi l'autre repo, créer une fiche miroir courte côté
   [`api-datafriday-staging`](../../../api-datafriday-staging/docs/bugs/) qui pointe vers
   celle-ci (voir BUG-007 / backend BUG-012 comme exemple).
