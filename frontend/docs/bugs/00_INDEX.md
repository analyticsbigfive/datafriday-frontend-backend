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
| [05](05_freezer_vs_frozen_valeur_invalide.md) | "Freezer" vs Frozen — valeur de formulaire invalide | 🟡 Corrigé non déployé | 🔴 | Menu & recettes |
| [06](06_supplier_sites_semantique_contradictoire.md) | Supplier.sites vide — sémantique contradictoire | 🔴 Ouvert | 🟠 | Achats & référentiels |
| [07](07_scoping_config_manquant_spacemenus_front.md) | Scoping config manquant perf/staff/inventory Space Menus (volet front) | 🟢 Corrigé | 🟠 | Espaces & builder |
| [08](08_manualquantities_jamais_envoye_backend.md) | manualQuantities jamais envoyé au backend | 🟢 Corrigé | 🟠 | Prévision |
| [09](09_availability_combo_ou_au_lieu_de_et.md) | Availability Combo utilise OU au lieu de ET | 🟢 Corrigé | 🟠 | Prévision |
| [10](10_assign_shop_items_emit_non_declare.md) | assign-shop-items émis sans être déclaré dans emits | 🟢 Corrigé | 🟡 | Prévision |
| [11](11_update_viewmode_jamais_emis.md) | update:viewMode déclaré mais jamais émis | 🟢 Corrigé | 🟢 | Prévision |
| [12](12_usepredictivetimeline_fonctions_mortes_edge_legacy.md) | usePredictiveTimeline.js : fonctions de persistance mortes | 🟢 Corrigé | 🟢 | Prévision |
| [13](13_team_api_commentaire_obsolete.md) | team.api.js : commentaire obsolète sur /teams | 🟢 Corrigé | 🟢 | Prévision / Événements |
| [14](14_triple_formule_ca_moyen_event.md) | Triple formule "CA moyen par event" incohérente | 🔴 Ouvert | 🟠 | Analyse & agrégation |
| [15](15_futureeventscount_deux_implementations.md) | futureEventsCount : deux implémentations divergentes | 🟢 Corrigé | 🟡 | Analyse & agrégation |
| [16](16_synchro_cross_config_v1_non_transactionnelle.md) | Synchro cross-config v1 non transactionnelle | 🟢 Corrigé | 🟠 | Espaces & builder |
| [17](17_useisoprojection_duplique_isoview.md) | useIsoProjection.js dupliqué dans IsoView.vue | 🔴 Ouvert | 🟢 | Espaces & builder |
| [18](18_props_morts_port_react_builder_v1.md) | Props morts hérités du port React (Builder v1) | 🟢 Corrigé | 🟢 | Espaces & builder |
| [19](19_restock_403_silencieux_front.md) | Restock 403 : le front avale l'erreur sans prévenir | 🔴 Ouvert | 🔴 | Stock |
| [20](20_filtre_storage_material_jamais_match.md) | Filtre storage 'material' (Inventory) : jamais aucun article ne matche | 🟢 Corrigé | 🟠 | Stock |
| [21](21_filtre_storage_merch_pas_de_filtre.md) | Filtre storage 'merch' (Inventory) : aucun filtre réel | 🟢 Corrigé | 🟠 | Stock |
| [22](22_drawers_inventory_inatteignables.md) | Drawers Inventory montés mais inatteignables (mobile) | 🟢 Corrigé | 🟠 | Stock |
| [23](23_fonctions_inventory_ciblent_ancien_backend_supabase.md) | Fonctions Inventory ciblent un ancien backend Supabase | 🟢 Corrigé | 🟠 | Stock |
| [24](24_getreconciliation_export_mort.md) | getReconciliation (singulier) : export mort | 🟢 Corrigé | 🟢 | Stock |
| [25](25_gating_team_incoherent.md) | Gating "Team" incohérent, deux écrans, deux comportements | 🔴 Ouvert | 🟠 | Événements |
| [26](26_bulk_create_wizard_taxonomie_non_reportee.md) | Bulk-create du wizard ne reporte pas la taxonomie vers l'Event | 🟢 Corrigé (caduc) | 🟡 | Événements |
| [27](27_bypass_demo_actif_sans_distinction_env.md) | Bypass démo (?demo=1) actif sans distinction dev/prod | 🟢 Corrigé | 🟡 | Auth & onboarding |
| [28](28_predict_test_sans_guard_auth.md) | /predict-test monté sans guard d'authentification | 🟢 Corrigé | 🟡 | Auth & onboarding |
| [29](29_cle_anon_supabase_codee_en_dur.md) | Clé anonyme Supabase codée en dur (hygiène) | 🟡 Corrigé non déployé | 🟢 | Auth & onboarding |
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
| [113](113_spacemenus_shopdetailview_orpheline_attach_factice.md) | ShopDetailView.vue : écran orphelin dont l'action "Attacher" est un stub non fonctionnel | 🟢 Corrigé | 🔴 | Menu & recettes |
| [114](114_spacemenus_shopdetailview_disponibilite_catalogue_divergents.md) | ShopDetailView.vue : disponibilité et chargement catalogue divergents du reste du feature | 🟢 Corrigé | 🟠 | Menu & recettes |
| [115](115_spacemenus_shopdetailview_dette_diverse.md) | ShopDetailView.vue : dette diverse (i18n contourné, pas de dark mode, formatage incohérent, logs, pas de retry) | 🟢 Corrigé | 🟡 | Menu & recettes |
| [116](116_spacemenus_composables_morts_doc_obsolete.md) | Cluster de composables morts (useSpaceMenu/useSpaceMenuReconciliation/useShopElementMapping) + doc module obsolète | 🟢 Corrigé | 🟠 | Menu & recettes |
| [117](117_spacemenus_scrolllock_keepalive.md) | Fuite du verrou de scroll body en quittant /space-menus (keep-alive) avec un drawer ouvert | 🟢 Corrigé | 🔴 | Menu & recettes |
| [118](118_spacemenus_shoptypes_incompatibles_entre_drawers.md) | Deux tiroirs éditent les "types de shop" avec des noms de champ incompatibles → écrasement silencieux | 🟢 Corrigé | 🟠 | Menu & recettes |
| [119](119_spacemenus_drawers_race_settimeout_reouverture.md) | Tiroirs Space Menus : race locale sur réouverture rapide (setTimeout non annulé vide le formulaire) | 🟢 Corrigé | 🟡 | Menu & recettes |
| [120](120_spacemenus_drawers_erreurs_save_avalees.md) | Erreurs de sauvegarde des tiroirs d'édition shop avalées sans feedback utilisateur | 🟢 Corrigé | 🟠 | Menu & recettes |
| [121](121_spacemenus_drawers_i18n_darkmode_incomplet.md) | Tiroirs Space Menus : i18n contourné et dark mode incomplet | 🟢 Corrigé | 🟡 | Menu & recettes |
| [122](122_spacemenus_deeplink_casse_keepalive.md) | SpaceMenuView.vue : le deep-link ?space=&config= casse au retour sur la page (keep-alive) | 🟢 Corrigé | 🟠 | Menu & recettes |
| [123](123_spacemenus_menuitemquery_filtre_residuel.md) | SpaceMenuView.vue : la recherche "par article" continue de filtrer les shops après retour en vue "By Shop" | 🟢 Corrigé | 🟠 | Menu & recettes |
| [124](124_spacemenus_race_condition_changement_espace.md) | SpaceMenuView.vue : race condition sans garde de spaceId après changement rapide d'espace | 🟢 Corrigé | 🟠 | Menu & recettes |
| [125](125_spacemenus_darkmode_non_propage_enfants.md) | Dark mode non propagé de SpaceMenuView.vue à SpaceMenuShopView/SpaceMenuItemView | 🟢 Corrigé | 🟠 | Menu & recettes |
| [126](126_spacemenus_i18n_formats_en_dur.md) | i18n contourné et formats en dur sur SpaceMenuItemView/SpaceMenuShopView/SpaceMenuView | 🟢 Corrigé | 🟡 | Menu & recettes |
| [127](127_spacemenus_nettoyages_code_mort_perf.md) | SpaceMenuView/SpaceMenuItemView : nettoyages mineurs (code mort + recalcul O(P×S) non mémoïsé) | 🟢 Corrigé | 🟡 | Menu & recettes |
| [128](128_spacemenus_cache_shopmenuitems_non_invalide.md) | Cache Vuex shopMenuItems jamais invalidé après une écriture Space Menus (et jamais préchargé pour la recherche) | 🟢 Corrigé | 🟠 | Menu & recettes |
| [129](129_spacemenus_ux_mineurs_a11y_input_file.md) | Space Menus : petits soucis UX/a11y (focus clavier invisible, état "sans configuration", input file non réinitialisé) | 🟢 Corrigé | 🟡 | Menu & recettes |
| [130](130_eventcategorielist_hashometeam_jamais_envoye.md) | `/event-categories` : `hasHomeTeam` jamais envoyé par le seul écran dédié à ce champ | 🟢 Corrigé | 🟠 | Événements |
| [131](131_eventcategorydialog_hashometeam_absent_cache_emit.md) | `EventCategoryDialog.vue` : `hasHomeTeam` absent du cache Vuex optimiste et de l'emit | 🟢 Corrigé | 🟡 | Événements |
| [132](132_events_stores_registre_inflight_absent.md) | Stores Événements : registre `inflight` absent (déviation du pattern établi) | 🟢 Corrigé | 🟠 | Événements |
| [133](133_eventslist_bouton_calculer_revenu_mort.md) | `/events` : bouton "Calculer le revenu" sans aucun handler | 🟢 Corrigé | 🟠 | Événements |
| [134](134_events_dialogs_drawers_sans_persistent.md) | Dialogs/drawers Événements sans `persistent` : fermables pendant une requête en cours | 🟢 Corrigé | 🟠 | Événements |
| [135](135_parsecsv_casse_champs_multilignes.md) | `utils/csv.js parseCSV` : casse sur un champ entre guillemets contenant un saut de ligne | 🟢 Corrigé | 🔴 | Événements |
| [136](136_csvimportdrawer_champs_hors_dto_400_garanti.md) | `CsvImportDrawer.vue` : champs hors DTO → 400 garanti (`forbidNonWhitelisted`) sur toute ligne enrichie | 🟢 Corrigé (partiel) | 🔴 | Événements |
| [137](137_csv_import_events_sans_dedoublonnage.md) | Import CSV Events : aucune déduplication au ré-import | 🟢 Corrigé | 🟠 | Événements |
| [138](138_csv_import_events_fichier_vide_silencieux.md) | Import CSV Événements : fichier vide/en-tête seul silencieusement ignoré | 🟢 Corrigé | 🟠 | Événements |
| [139](139_events_store_pas_de_pagination_cap_50.md) | `events.js` store : `fetchEvents` sans pagination → `/events` plafonné à 50 lignes | 🟢 Corrigé | 🟠 | Événements |
| [140](140_teamapi_getteams_avale_toutes_erreurs.md) | `team.api.js getTeams()` : avale TOUTES les erreurs, pas seulement le 404 attendu | 🟢 Corrigé | 🟡 | Événements |
| [141](141_events_i18n_contourne_dialogs_suppression.md) | Événements : i18n contourné sur les 4 dialogs de suppression + mini-dialog "Créer une équipe" | 🟢 Corrigé | 🟡 | Événements |
| [142](142_events_vdatatable_pagination_non_configuree.md) | Les 4 `v-data-table` du domaine Événements : pagination non configurée (défaut Vuetify = 10) | 🟢 Corrigé | 🟡 | Événements |
| [143](143_events_computed_morts.md) | Computed morts jamais référencés dans le template (EventsTypeListView/EventsCategorieListView) | 🟢 Corrigé | 🟢 | Événements |
| [144](144_eventslistview_mappedevents_recherche_lineaire.md) | `EventsListView.vue mappedEvents` : recherche linéaire O(n×m) non mémoïsée | 🟢 Corrigé | 🟢 | Événements |
| [145](145_eventcategorielist_duplication_creation_categorie.md) | Deux implémentations divergentes de "créer une catégorie" | 🟢 Corrigé | 🟡 | Événements |
| [146](146_eventformdrawer_ticketsscanned_sans_validation_croisee.md) | `EventFormDrawer.vue` : aucune validation croisée `ticketsScanned` ≤ `ticketsSold` | 🟢 Corrigé | 🟢 | Événements |
| [147](147_events_store_ttl_5min_incoherent.md) | `events.js` : TTL de cache 5 min, contre 15 min pour les 3 stores de taxonomie | 🟢 Corrigé | 🟢 | Événements |
| [148](148_eventdrawershell_inutilise_duplication_markup.md) | `EventDrawerShell.vue` inutilisé dans le périmètre Événements, header/footer dupliqués 3× | 🟢 Corrigé | 🟢 | Événements |
| [149](149_taxonomie_evenements_optimistic_write_objets_partiels.md) | Taxonomie Événements : écritures Vuex optimistes avec objets partiels (perte de champs après édition/création inline/import CSV) | 🟢 Corrigé | 🟡 | Événements |
| [150](150_eventsubcategorielist_exportcsv_champ_categoryid_toujours_vide.md) | `EventsSubcategorieListView.vue exportToCSV` : colonne "Event Category" systématiquement vide | 🟢 Corrigé | 🟡 | Événements |
| [151](151_taxonomyimportdrawer_fk_parente_non_forcee_avant_import.md) | `TaxonomyImportDrawer.vue` : FK parente (type/catégorie) non forcée avant import, échec 400 brut ligne par ligne | 🟢 Corrigé | 🟡 | Événements |
| [152](152_appcopy_arbre_orphelin_duplique_domaine_evenements.md) | `appCopy.vue` : arbre de 8 fichiers (~5000 lignes) orphelin, dupliquant tout le domaine Événements | 🟢 Corrigé | 🟡 | Événements |
| [153](153_taxonomie_view_popup_non_conforme_liste_evenements_absente.md) | Taxonomie Événements : popup "view" non conforme à la charte graphique + liste d'événements liés absente (et action absente sur Categories/Subcategories) | 🟢 Corrigé | 🟡 | Événements |
| [154](154_eventslistview_deeplink_editeventid_casse_keepalive.md) | `EventsListView.vue` : deep-link `?editEventId=` cassé par `keep-alive` après la première visite | 🟢 Corrigé | 🟠 | Événements |
| [155](155_events_domaine_popups_v_dialog_remplaces_par_tiroirs.md) | Domaine Événements : popups `v-dialog` remplacés par des tiroirs (cohérence charte graphique) | 🟢 Corrigé | 🟡 | Événements |
| [156](156_taxonomydetaildrawer_i18n_texte_en_dur.md) | `TaxonomyDetailDrawer.vue` : texte en dur (FR), i18n non branché + 3 boutons "Enregistrement…" en dur | 🟢 Corrigé | 🟡 | Événements |
| [157](157_events_domaine_loading_tableaux_noir_et_navigation_event_lie_retiree.md) | Domaine Événements : loading des `v-data-table` en noir (au lieu du rouge de marque) + navigation "événement lié" retirée (non fiable) | 🟢 Corrigé (partiel) | 🟡 | Événements |
| [158](158_eventformdrawer_createteam_bouton_color_primary_vire_violet_en_dark.md) | `EventFormDrawer.vue` : bouton "Créer" (équipe inline) en `color="primary"` — vire violet en dark mode au lieu du rouge de marque | 🟢 Corrigé | 🟢 | Événements |
| [159](159_producttype_optimistic_write_objet_partiel.md) | `ProductType` : écriture Vuex optimiste avec objet partiel écrase `categories`/`createdAt` après édition | 🟢 Corrigé | 🟠 | Menu & recettes (Configurations) |
| [160](160_brand_displayname_optimistic_write_objet_partiel.md) | `Brand`/`DisplayName` : écriture Vuex optimiste avec objet partiel après édition | 🟢 Corrigé | 🟡 | Menu & recettes (Configurations) |
| [161](161_good_component_categories_derivees_endpoint_types.md) | Good/Component Categories : dérivées de l'endpoint Types au lieu de leur propre endpoint dédié | 🟢 Corrigé | 🟡 | Achats & référentiels / Menu & recettes (Configurations) |
| [162](162_marketprice_selectedtype_category_resolu_par_nom.md) | MarketPrice : `selectedTypeId`/`selectedCategoryId` résolus par nom, pas par la FK chargée | 🟢 Corrigé | 🟡 | Achats & référentiels (Configurations) |
| [163](163_good_component_cross_invalidation_absente.md) | Good/Component Types↔Categories : pas d'invalidation croisée de cache, actions `invalidate` mortes | 🟢 Corrigé | 🟡 | Achats & référentiels / Menu & recettes (Configurations) |
| [164](164_menuapi_code_mort_routes_inexistantes.md) | `menu.api.js` : code mort pointant vers des routes backend inexistantes (`/categories`, `/types`) | 🟢 Corrigé | 🟡 | Menu & recettes (Configurations) |
| [165](165_referentiels_plats_duplication_non_factorisee.md) | Référentiels plats (Brand/Display/Industrial/PackingType) : duplication quasi totale, jamais factorisée | 🟢 Corrigé | 🟡 | Menu & recettes / Achats & référentiels (Configurations) |
| [166](166_taxonomies_configurations_i18n_texte_en_dur.md) | Taxonomies Configurations : chaînes FR/EN codées en dur dans les drawers/dialogs (10 écrans) | 🟢 Corrigé | 🟡 | Menu & recettes / Achats & référentiels (Configurations) |
| [167](167_nav_configurations_fr_non_traduit.md) | Sidebar Configurations : 4 libellés jamais traduits en français (texte anglais copié-collé) | 🟢 Corrigé | 🟡 | Menu & recettes / Achats & référentiels (Configurations) |
| [168](168_productcategorylist_force_refresh_cache_ttl_contourne.md) | `ProductCategoryList.vue` : force le refresh à chaque montage, contourne le cache TTL | 🟢 Corrigé | 🟡 | Menu & recettes (Configurations) |
| [169](169_taxonomies_configurations_requetes_non_paginees.md) | Taxonomies Configurations : requêtes non paginées (product/component types-categories) | 🟢 Corrigé | 🟡 | Menu & recettes / Achats & référentiels (Configurations) |
| [170](170_delete_bloque_sans_moyen_de_trouver_les_dependants.md) | Suppression bloquée (BUG-79/81/82) sans moyen de retrouver les lignes dépendantes | 🟢 Corrigé | 🟠 | Menu & recettes / Achats & référentiels (Configurations) |
| [171](171_configurations_pagination_recherche_server_side.md) | Taxonomies Configurations : pagination + recherche réelles côté serveur pour les 10 écrans de liste — **rouvert le 2026-07-29** : le composant est resté `v-data-table`, les 10 écrans se sont retrouvés bloqués sur la page 1 (cf. BUG-246-01) | ⚪ Diagnostiqué | 🟡 | Menu & recettes / Achats & référentiels (Configurations) |
| [172](172_chaine_analyse_api_morte_supprimee.md) | Chaîne `/analyse/*` entièrement morte (action jamais dispatchée, buckets jamais lus) — supprimée | 🟢 Corrigé | 🟡 | Analyse & agrégation |
| [173](173_timeline_batch_inflight_empoisonne_sur_rejet.md) | `getSpaceEventTimelineBatch` : in-flight jamais nettoyé sur échec → erreurs permanentes | 🟢 Corrigé | 🟠 | Analyse & agrégation |
| [174](174_loadspace_sans_cache_first.md) | `/analyse` : chaque re-mount re-payait la phase 1 (pas de cache-first 15 min) | 🟢 Corrigé | 🟡 | Analyse & agrégation |
| [175](175_fetchallmenucomponents_pagination_sequentielle.md) | `fetchAllMenuComponents` : pagination page-à-page séquentielle | 🟢 Corrigé | 🟡 | Analyse & agrégation |
| [176](176_phase2_endpoints_unscoped_tradeoff.md) | Phase 2 : endpoints tenant-wide non scopés (tradeoff délibéré documenté) | ⚫ Won't fix | 🟡 | Analyse & agrégation |
| [177](177_hydration_recettes_n1_background.md) | Hydration recettes : N fetchs détail `/menu-components/:id` en phase 2 | ⚪ Diagnostiqué | 🟡 | Analyse & agrégation |
| [178](178_double_cache_timeline.md) | Trois couches de cache timeline indépendantes (store / module API / predict) | ⚪ Diagnostiqué | 🟡 | Analyse & agrégation |
| [179](179_getters_analyse_lourds.md) | Getters analyse : ré-itération des tableaux complets à chaque changement de filtre | ⚪ Diagnostiqué | 🟡 | Analyse & agrégation |
| [180](180_predict_timeline_single_vers_batch.md) | (miroir) Moteur predict : N GET single event-timeline → batch adopté — canonique back 10 | 🟢 Corrigé | 🟠 | Prévision |
| [181](181_cascade_duplication_versions_predict.md) | Cascade historique de versions dupliquées, tenue par des workarounds fragiles | ⚪ Diagnostiqué | 🟠 | Prévision |
| [182](182_scoring_predict_client_3_8s.md) | Scoring predict client-side 3-8s : incompatible < 300ms (limitation documentée) | ⚪ Diagnostiqué | 🟢 | Prévision |
| [183](183_double_persistance_comptages.md) | Inventaire : chaque comptage écrit deux fois (POST par item + snapshot blob) | ⚪ Diagnostiqué | 🟡 | Stock |
| [184](184_nettoyages_stock_analyse.md) | Nettoyages : actions Vuex dupliquées (inventory), précédence non parenthésée (revenue) | 🟢 Corrigé | 🟢 | Stock / Analyse |
| [185](185_inventaire_adopte_batch_shop_items.md) | (miroir) Space Inventory : adoption du batch shop-items, fin du N+1 — canonique back 96 | 🟢 Corrigé | 🟠 | Stock |
| [186](186_predict_snapshot_brouillon_date_perimee_calendrier.md) | EventPredict : date périmée du snapshot/brouillon écrase la canonique → event disparu du calendrier | 🟢 Corrigé | 🟠 | Prévision |
| [187](187_analyse_articles_echec_event_timeline_silencieux.md) | Analyse : échec du batch event-timeline avalé → « Aucun article disponible » trompeur — miroir cause back 103 | 🟢 Corrigé | 🟠 | Analyse & agrégation |
| [188](188_stockup_explosion_ignore_comboitem.md) | Stock up : explosion recette ignore `comboItem` (seul `readyForSale` décide) — règle métier → Bertrand #18 | ⚪ Diagnostiqué | 🟠 | Prévision |
| [189](189_analyse_futureeventscount_double_implementation.md) | Analyse : `futureEventsCount` en double — getter store mort (`>`) supprimé, computed vivant (`>=`) conservé | 🟢 Corrigé | 🟢 | Analyse & agrégation |
| [190](190_auth_signed_out_rotation_deconnexion_multi_onglets.md) | Déconnexion intempestive multi-onglets sur rotation du refresh token | 🟢 Corrigé | 🟠 | Auth & onboarding |
| [191](191_auth_console_log_jwt_en_clair.md) | JWT imprimé en clair dans la console lors de l'onboarding | 🟢 Corrigé | 🟢 | Auth & onboarding |
| [192](192_auth_code_mort_login_onboarding_guards.md) | Code mort Auth : `Login.vue`, `endpoints/onboarding.js`, 4 guards | 🟢 Corrigé | 🟢 | Auth & onboarding |
| [193](193_data_integration_delete_checkbox_sans_effet.md) | Case "supprimer aussi les données synchronisées" sans effet réel (cascade Prisma inconditionnelle) | 🟢 Corrigé | 🔴 | Intégrations & ventes |
| [193](193_auth_ismanager_getter_mort.md) | Getter `isManager` mort (gating par nom de rôle, incompatible 6 rôles métier) | 🟢 Corrigé | 🟢 | Auth & onboarding (RBAC) |
| [194](194_data_integration_purge_echec_avale_avant_suppression.md) | Échec de purge des données avalé silencieusement avant suppression de l'intégration | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [194](194_darkmode_incomplet_component_library_market_prices.md) | Dark mode incomplet sur `component-library` et `market-prices` (parents/enfants non alignés sur le pattern `isDark`/`--dark`) | 🟢 Corrigé | 🟡 | Menu & recettes / Achats & référentiels |
| [195](195_data_integration_suppression_sans_garde_sync_en_cours.md) | Aucune protection contre la suppression d'une intégration en cours de sync | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [196](196_data_integration_sync_job_sans_syncing_map.md) | Sync par job ne bascule jamais `syncingMap` (pas de spinner, pas de garde anti double-clic) | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [197](197_data_integration_polling_sync_non_nettoye_destroy.md) | Boucle de polling du sync legacy non nettoyée si le composant est détruit en plein sync | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [198](198_data_integration_dates_nombres_fr_fr_hardcode.md) | Dates/nombres toujours formatés en `fr-FR`, ignorent le switch de langue | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [199](199_data_integration_dialog_suppression_non_traduit.md) | Dialog de confirmation de suppression 100% en français, bypass `t()` | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [200](200_wizard_reprise_etape_non_fonctionnelle.md) | "Reprendre où on s'était arrêté" ne fonctionne pas dans le wizard d'intégration | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [201](201_wizard_other_locations_configure_next_mort.md) | Fonctionnalité "configurer la prochaine location" entièrement câblée mais jamais utilisée | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [202](202_stepmapspace_creation_config_echec_avale.md) | Échec de création de configuration silencieusement avalé (StepMapSpace) | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [203](203_stepmapspace_similarite_sans_normalisation_accents.md) | Suggestion de mapping d'espace : aucune normalisation des accents/espaces | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [204](204_syncprogress_jobid_jamais_reinitialise.md) | `syncJobId` jamais réinitialisé : le mode legacy devient inutilisable après un sync par job | 🟢 Corrigé | 🔴 | Intégrations & ventes |
| [205](205_syncprogress_widget_double_polling_minimize.md) | Double polling confirmé entre dialog et widget flottant après minimisation d'un job | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [206](206_syncprogress_polling_sans_timeout.md) | Le polling d'un job de sync (dialog et widget) n'a aucun timeout/abandon | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [207](207_syncjobwidget_ne_persiste_pas_navigation.md) | Le widget flottant de sync ne survit pas à la navigation, contrairement à sa promesse | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [208](208_stepmapshops_badge_etage_regression_multi_config.md) | Le correctif du badge étage (BUG-003) régresse pour les tenants à plusieurs configurations | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [209](209_stepmapshops_bulk_create_matching_naif_doublons.md) | Le plan de création en masse utilise un matching naïf, risque de créer des shops en doublon | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [210](210_stepmapshops_updatemapping_sans_rollback_echec.md) | `updateMapping` sans rollback à l'échec : compteur de mapping et onglets mentent | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [211](211_stepmapshops_delete_mapping_echec_invisible.md) | Échec de suppression de mapping strictement invisible | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [212](212_stepmapmenuitems_unpriced_item_score_gonfle.md) | Un menu item sans prix peut gonfler le score de similarité au-dessus du seuil d'auto-suggestion | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [213](213_stepmapmenuitems_next_button_sans_garde_bulk.md) | Bouton "Suivant" du wizard non bloqué pendant un bulk-create/bulk-price-apply en cours | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [214](214_stepprocesstimeline_weezeventmappings_jamais_rehydrate.md) | `weezEventMappings` jamais réhydraté : "Créer et lier tout" peut créer des Events en double | 🟢 Corrigé | 🔴 | Intégrations & ventes |
| [215](215_stepprocesstimeline_toast_succes_meme_si_echec_skip.md) | Toast "Agrégation terminée" affiché en succès même en cas d'échec/skip | 🟢 Corrigé | 🔴 | Intégrations & ventes |
| [216](216_stepprocesstimeline_badge_statut_ne_distingue_pas_echec.md) | Le badge de statut par événement ne distingue pas échec/skip de "jamais traité" | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [217](217_stepprocesstimeline_double_soumission_apres_timeout_poll.md) | Fenêtre de double-soumission après timeout du polling par événement | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [218](218_stepprocesstimeline_waitforsyncjob_non_annule_unmount.md) | `waitForSyncJob` (poll 2.5s/10min) jamais annulé si le composant est démonté | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [219](219_stepprocesstimeline_createeventdialog_avale_erreurs.md) | `CreateEventDialog` avale les erreurs de création sans retour utilisateur | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [220](220_stepprocesstimeline_decalage_fuseau_horaire_creation_event.md) | Décalage de fuseau horaire (UTC vs local) lors de la création d'événement depuis une date non couverte | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [221](221_stepprocesstimeline_pans_code_morts_refactor_incomplet.md) | 3 pans de code mort issus d'un refactor incomplet de l'étape 4 | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [222](222_inventory_reconciliation_fallback_plus_vieux_match.md) | Réconciliation d'inventaire : fallback `pastEvents[0]` sur tri ascendant → rattachée au plus VIEUX match passé au lieu du dernier fini | 🟢 Corrigé | 🟠 | Stock |
| [223](223_analyse_donut_zone_vide_pendant_contexte_differe.md) | Analyse : donut « Par zone » affiché vide (disque blanc) tant que le contexte PdV différé n'est pas chargé | 🟢 Corrigé | 🟢 | Analyse & agrégation |
| [224](224_analyse_predict_outil_inventaire_pre_evenement_absent.md) | « Inventaire pré-événement » absent du sélecteur Outils sur Analyse et Prédire (`FilterPanel` jamais mis à jour) | 🟢 Corrigé | 🟢 | Analyse & agrégation / Stock |
| [225](225_analyse_predict_config_par_defaut_et_dedup_contexte.md) | Analyse/Prédire : aucune config pré-sélectionnée → union « All Configurations » (fan-out max) par défaut ; + contexte PdV dispatché 2× | 🟡 Pré-sélection ANNULÉE (décision 2026-07-30) — dédup contexte PdV conservée | 🟠 | Analyse & agrégation |
| [226](226_chargement_analyse_dedup_catalogues_et_phase2_en_vagues.md) | Chargement Analyse : `market-prices`/`packaging` sans dédup in-flight (2× ~60 s), phase 2 monolithique (graphes bloqués par les catalogues recette), contexte PdV rebâti à chaque demande | 🟢 Corrigé | 🟠 | Analyse & agrégation / Stock |
| [227](227_shop_items_photo_base64_dupliquee_par_pdv.md) | `shop-items` : 5,6 Mo / 53 s — une photo base64 de 915 ko réémise une fois par PdV (14 Mo émis, 38 ko utiles), jamais lue côté front | 🟢 Corrigé | 🔴 | Analyse & agrégation / Stock / Menu |
| [228](228_inventory_snapshot_kind_rejete_backend_perime.md) | Snapshot inventaire : `POST /inventory` 400 « property kind should not exist » — backend exécutant un build antérieur au DTO (`6491562`), aucun code fautif, fix = redéployer | ⚪ Diagnostiqué | 🔴 | Stock |
| [229](229_props_double_majuscule_liaison_kebab_morte.md) | Props à double majuscule (`onOpenHR`, `onOpenFBIntegration`) : liaison kebab-case camelisée en `onOpenHr`/`onOpenFbIntegration` → ne matche jamais, câblage Settings « Edit HR » silencieusement mort ; liaisons passées en camelCase | 🟡 Corrigé non déployé | 🟠 | RH / Navigation |
| [230](230_consolidated_views_double_navigation_onclose.md) | Consolidated* : `handleOpen*FromSettings` appelle le handler puis `onClose()` → en mode routé, la 2ᵉ navigation écrase la 1ʳᵉ ; contourné dans `HrView` (prop `onOpenEvents` omise, entrée MainNav masquée) | ⚪ Diagnostiqué | 🟡 | RH / Navigation |
| [231](231_ecrans_rh_routes_restes_prototype.md) | Écrans RH routés : crashs dialog/`toast`/CSV, Edge Function KV morte, N+1, dialogs shadcn disloqués dans le layout Vuetify — corrigés puis **écrans prototype remplacés par `components/hr/` (Vuetify + i18n)** le 2026-07-21 ; vues prototype retournées en quarantaine | 🟡 Corrigé non déployé | 🟠 | RH |
| [232](232_pre_event_expected_non_normalise_negatifs.md) | Pre-event Inventory : attendus divergents de la Logistique et vrac **négatif** (Loose -1/-2) — somme brute baseline+deltas sans casse de pack (`normalizeLevel`) ni rejeu séquentiel, mouvements non joignables avalés ; fix = calcul serveur normalisé, chemin unique baseline/réconciliation | 🟡 Corrigé non déployé | 🔴 | Stock |
| [233](233_pre_event_expected_fuite_via_reconciliations.md) | Pre-event Inventory : les attendus gatés par `preInventoryExpected` **fuient** via `POST pre-event-reconciliations` (réponse avec `expectedPacked/Loose`) et `GET reconciliations` (lignes complètes) — corrigé par expurgation conditionnelle des réponses (`expected*` ET `delta*` retirés des lignes pre-event pour les non-porteurs ; document en base complet) | 🟡 Corrigé non déployé | 🟠 | Stock / RBAC |
| [234](234_space_live_double_header_route_non_declaree_dashboardview.md) | Route `space-live` : double header (route Live non déclarée dans les listes self-headed / rail-push de DashboardView) | 🟢 Corrigé | 🟡 | Live events / Shell app |
| [235](235_syncprogress_stepprocesstimeline_timeout_duree_totale_faux_positif_gros_tenant.md) | Timeout de polling par durée totale (BUG-206/218) : faux positif "délai maximal dépassé" sur un gros tenant toujours en progrès | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [236-02](236_02_csvimportdrawer_dropdowns_taxonomie_vides_sans_indication.md) | Import CSV événements : dropdowns Espaces/Configs/Types/Catégories/Sous-catégories vides sans aucune indication (échec de fetch avalé par `Promise.allSettled`) | 🟡 Corrigé non déployé | 🔴 | Événements |
| [237-02](237_02_csvimportdrawer_darkmode_menu_select_teleporte_illisible.md) | Import CSV événements : champ de mapping illisible en dark mode (menu `v-select` téléporté hors de `.elv--dark`) | 🟡 Corrigé non déployé | 🟠 | Événements |
| [238-02](238_02_csvimportdrawer_champs_taxonomie_perdus_silencieusement.md) | Import CSV événements : Espace/Configuration/Type/Catégorie/Sous-catégorie perdus silencieusement à l'import ; 4 champs fantômes (BUG-136) désormais réellement stockés (schéma étendu) | 🟢 Corrigé | 🔴 | Événements |
| [239-02](239_02_csvimportdrawer_eventenddate_eventendtime_absents_mapping.md) | Import CSV événements : `eventEndDate`/`eventEndTime` absents du mapping malgré usage backend réel (multi-jours, fenêtre live) | 🟢 Corrigé | 🟠 | Événements |
| [240-02](240_02_csvimportdrawer_sessions_multiples_non_parsees.md) | Import CSV événements : événements multi-sessions, une seule session capturée (colonne "All Sessions" non parsée) | 🟢 Corrigé | 🟡 | Événements |
| [241-02](241_02_csvimportdrawer_menu_select_derriere_scrim_drawer.md) | Import CSV événements : menu déroulant d'un `v-select` invisible/inatteignable (z-index Vuetify posé sur `.v-overlay`, pas `.v-overlay__content` — 1er correctif inefficace, cause probable réelle du BUG-237-02) | 🟡 Corrigé non déployé | 🔴 | Événements |
| [242-02](242_02_stepprocesstimeline_batch_non_declaree_bulkcreateevents.md) | `bulkCreateEvents()` : variable `BATCH` non déclarée, `ReferenceError` dès plus de 5 events à créer | 🟡 Corrigé non testé | 🔴 | Intégrations & ventes |
| [243-02](243_02_createeventdialog_champs_performer_sponsor_openingact_absents.md) | `CreateEventDialog.vue` (wizard) : champs performer/sponsor/opening act absents | 🟡 Corrigé non testé | 🟡 | Intégrations & ventes / Événements |
| [244-02](244_02_nettoyage_code_mort_domaine_events.md) | Nettoyage de code mort confirmé du domaine Événements (fichiers, exports API, clés i18n) | 🟡 Corrigé non testé | 🟢 | Événements / Analyse & agrégation |
| [245-02](245_02_eventstypelistview_opendetailsdialog_nommage_incoherent.md) | `EventsTypeListView.vue` : `openDetailsDialog()` nommé différemment des 2 autres vues taxonomie | 🟡 Corrigé non testé | 🟢 | Événements |
| [246-02](246_02_csvimportdrawer_import_sequentiel_lent_sans_progression.md) | `CsvImportDrawer.vue` : import CSV strictement séquentiel (lent) et sans indicateur de progression | 🟡 Corrigé non testé | 🟠 | Événements |
| [247-02](247_02_eventcategorydialog_prop_isdark_extraneous_ignoree.md) | `EventCategoryDialog.vue` : prop `is-dark` passée par 2 vues mais ignorée (jamais déclarée) | 🟡 Corrigé non testé | 🟢 | Événements |
| [248-02](248_02_eventssubcategorielistview_eventtypes_non_reactif_erreur_avalee.md) | `EventsSubcategorieListView.vue` : `eventTypes` non réactif (copie figée) + échec de fetch avalé silencieusement | 🟡 Corrigé non testé | 🟠 | Événements |
| [249-02](249_02_taxonomie_v_select_menu_invisible_zindex_drawer.md) | `v-select` invisible (menu piégé sous le drawer) sur 4 selects taxonomie, jamais protégés par le fix z-index déjà établi | 🟡 Corrigé non testé | 🔴 | Événements |
| [250-02](250_02_eventformdrawer_sessions_double_stringify_heures_perdues.md) | `EventFormDrawer.vue submit()` : `sessions` double-stringifié → heures illisibles après un premier save | 🟡 Corrigé non testé | 🔴 | Événements |
| [251-02](251_02_eventformdrawer_teams_autoselectfirst_race_initialisation.md) | `EventFormDrawer.vue` : sélection Home/Visiting Team possiblement réinitialisée par `auto-select-first` pendant le chargement asynchrone des équipes | ⚪ Diagnostiqué | 🟠 | Événements |
| [252-02](252_02_csvimportdrawer_rate_limit_429_import_masse_echec_definitif.md) | Import CSV en masse : dépasse le palier "medium" du rate-limiter tenant (300 req/60s), toutes les lignes restantes échouent définitivement en 429 | 🟡 Corrigé non testé | 🔴 | Événements |
| [253-02](253_02_csvimportdrawer_teams_jamais_relies_catalogue.md) | Import CSV : Home/Visiting Team jamais reliés au catalogue `Team` (texte libre uniquement) | 🟡 Corrigé non testé | 🟠 | Événements |
| [254-02](254_02_market_prices_csv_format_packe_par_article_import_export.md) | Market Prices : absence d'un format CSV « packé par article » (1 ligne = 1 Item, prix fournisseurs empilés + upsert par id) pour la reprise de données historiques | 🟡 Corrigé non testé | 🟠 | Achats & référentiels |
| [256-02](256_02_components_csv_import_export_recette.md) | Components : aucun import CSV n'existait (export plat seulement) — ajout import/export packé avec recette (ingrédients + sous-composants), résolution des anciens ids Market Price via fichier compagnon, migration `numberOfUnitsRecipe` Int→Float | 🟡 Corrigé non testé | 🟠 | Menu & recettes |
| [340-02](340_02_stepmapshops_floor_perdu_association_shop_existant.md) | Étage perdu lors de l'association d'un shop existant à une location (StepMapShops) — même symptôme que BUG-003/208, chemin de code différent (association en cours de session, pas rechargement) | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [257-02](257_02_menu_items_csv_import_recette_historique.md) | MenuItem : import CSV du format "Recipe" packé historique inutilisable (résolution par ID brut) — résolution par nom via fichiers compagnons Market Prices/Components, nouvelle relation `MenuItemCombo` (composition combo, absente du schéma), import parallélisé + retry 429 (perf) | 🟡 Corrigé non testé | 🟠 | Menu & recettes |
| [258-01](258_01_eventpredict_staff_generate_silencieux_warnings_invisibles.md) | Event Predict / Staff : « Générer » silencieux — 201 avec `elements: []` indiscernable d'un no-op (warnings backend jetés, `generateError` invisible en régénération) ; warnings `AUCUN_ELEMENT_STAFFABLE`/`AUCUNE_LIGNE_GENEREE` + bandeau état vide | 🟡 Corrigé non testé | 🟠 | RH / Staffing |
| [259-02](259_02_transfert_immediat_sans_confirmation_destinataire.md) | Transfert PDV/Storage débité/crédité immédiatement sans confirmation du destinataire — flux émission (PENDING) → confirmation (quantités éditables, pertes tracées en Réconciliation) | 🟡 Corrigé non testé | 🟠 | Stock (Logistique) |
| [260-02](260_02_logistique_composant_toujours_explose_readyforsale_jamais_yes.md) | Logistique : un `MenuComponent` est TOUJOURS explosé en ingrédients bruts (garde `readyForSale='Yes'` jamais vraie en pratique — vérifié 0/81 en base) — contredit la décision Q13 (2026-08-04) appliquée à Inventory/Restock mais jamais reportée sur Logistique | 🟡 Corrigé non testé | 🟠 | Stock (Logistique) |
| [258-02](258_02_departmentformdrawer_v_select_icon_menu_invisible_zindex_drawer.md) | `v-select` "Icon" invisible (menu piégé sous le drawer) dans DepartmentFormDrawer — 3e occurrence du même bug jamais protégé par le fix z-index déjà établi (BUG-241-02/249-02) | 🟢 Corrigé | 🟠 | Espaces & builder |
| [259-02](259_02_componentcreateview_storagetype_dry_storage_valeur_invalide.md) | Storage Type "Dry Storage" (≠ "Dry" attendu par Prisma) sur ComponentCreateView : sauvegarde en échec systématique sur ce choix, sibling de BUG-05 | 🟢 Corrigé | 🔴 | Menu & recettes |
| [260-02](260_02_hrsinkingrule_conditionattribute_jamais_saisi_builder.md) | `HrSinkingRule.conditionAttribute` (ex. `nbFriteuses`) ne se déclenche jamais — aucun champ du Builder ne permettait de saisir ces attributs sur `SpaceElement.attributes` ; corrigé par une nouvelle section `StaffingInputsSection.vue` dans l'inspecteur (shops uniquement) | 🟢 Corrigé | 🟠 | RH / Staffing |
| [261-02](261_02_hrrole_algokey_doublon_silencieusement_ignore.md) | Deux `HrRole` avec le même `algoKey` (ex. deux "CAISSIER") acceptés sans erreur — un seul est utilisé silencieusement par le calcul de staffing (`rolesByAlgo` Map, écrasement sans avertissement), l'autre devient inerte sans le signaler | 🔴 Ouvert | 🟠 | RH / Staffing |
| [262-02](262_02_hrrole_algokey_non_valide_cote_backend.md) | `HrRole.algoKey` accepté sans validation côté backend (pas de `@IsIn`) — non exploitable via l'UI actuelle (`<select>` fermé), défense en profondeur manquante si un futur import/API direct écrit ce champ | 🔴 Ouvert | 🟡 | RH / Staffing |
| [263-02](263_02_drawer_body_flex_min_height_manquant_contenu_coupe.md) | 10 tiroirs `<Teleport>` (RH + Menu & recettes) avec un corps censé défiler qui coupait le contenu net au lieu de scroller — `min-height: 0` manquant sur l'enfant flex scrollable (piège flexbox classique) | 🟢 Corrigé | 🟠 | Transverse |
| [264-02](264_02_hrsinkingrule_department_non_enregistre_erreur_trompeuse.md) | Règle Sinking rejetée ("fnbCategory invalide") quand le département du rôle vient d'être changé à l'écran sans être enregistré — le backend valide contre le département encore en base, pas celui affiché | 🟢 Corrigé | 🟡 | RH / Staffing |
| [265-02](265_02_hrroleformdrawer_notlinked_desync_pastilles_verrouillees.md) | `notLinked` (ref indépendant, pas de champ backend équivalent) désynchronisé — verrouillait toutes les pastilles de sous-type à l'ouverture d'un rôle sans tag ; corrigé en le dérivant de `fnbCategories.length === 0`, plus deux bugs liés (faux positif departmentUnsaved, select de règle Sinking vide) | 🟢 Corrigé | 🟠 | RH / Staffing |
| [266-02](266_02_hrrole_supplier_departement_jamais_recoupe.md) | Le sélecteur d'agence (rôle AGENCY) affichait toutes les agences du tenant sans filtrer par `HrSupplier.departments` — on pouvait lier une agence "shop uniquement" à un rôle Hospitality sans avertissement ; filtré côté formulaire, backend non recoupé (0 rôle AGENCY existant) | 🟢 Corrigé | 🟡 | RH / Staffing |
| [258-02](258_02_csvimportdrawer_doublon_ignore_compte_comme_erreur.md) | Import CSV Events : ligne ignorée (doublon) comptée aussi comme erreur, affichée deux fois dans les résultats | 🟢 Corrigé | 🟡 | Événements |
| [259-02](259_02_resolveweezeventlinkdialog_selections_jamais_reinitialisees.md) | `ResolveWeezeventLinkDialog` : sélections jamais réinitialisées, valeur d'une ouverture précédente affichée comme pré-sélectionnée | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [267-01](267_01_menu_items_stepper_pas_de_1_et_couts_arrondis.md) | « Modifier le menu item » : stepper quantité au pas de 1 (inutilisable sur des ingrédients au kg — 0,04 → 1,04 en un clic) et coûts arrondis à l'entier (4 composants sur 7 affichés à « 0 € ») sur l'écran même du coût de revient ; boutons retirés + exception 2 décimales documentée (`formatCostCurrency`) | 🟡 Corrigé non déployé | 🟠 | Menu & recettes |
| [268-01](268_01_spacemenus_drawer_sans_tout_selectionner.md) | `ShopMenuItemsDrawer` sans « Tout sélectionner » — 32 clics pour attacher un menu complet, alors que la page sœur `ShopDetailView` a la barre tri-état depuis toujours ; ajoutée sur l'onglet « Disponible » uniquement. Signale un timeout transactionnel backend latent sur les gros lots | 🟡 Corrigé non déployé | 🟡 | Espaces & builder |
| [269-01](269_01_analyse_tooltip_ca_par_shop_illisible_30_pdv.md) | Tooltip « CA par shop » listant les 30+ PDV du stack (dont une majorité à « € 0 ») : plus haut que le graphe, son en-tête — le nom de l'événement survolé — sortait de l'écran ; plafonné au top 10 de la barre + ligne « Autres (N) » avec la somme | 🟡 Corrigé non déployé | 🟡 | Analyse & agrégation |
| [270-02](270_02_analyse_timeline_heures_transactiondate_utc_brut_sans_conversion_fuseau.md) | Timeline Analyse : heures affichées en UTC brut, sans conversion vers le fuseau de l'espace (~2h de décalage pour tout espace `Europe/Paris` en été) — correctif re-mergé dans `develop` le 2026-08-03, avec une régression 500 corrigée le jour même (backend [BUG-125-01](../../../backend/docs/bugs/125_01_event_timeline_groupby_placeholder_fuseau_500.md)) | 🟡 Corrigé non testé | 🟠 | Analyse & agrégation |
| [271-02](271_02_eventslistview_datedebut_vide_tant_que_non_resauvegarde.md) | `EventsListView` : colonne « Date de début » vide tant que l'événement n'a pas été ouvert puis resauvegardé (événements importés CSV, `eventStartDate` jamais envoyé à la création) | 🟢 Corrigé | 🟡 | Événements |
| [272-02](272_02_eventformdrawer_revenue_hors_dto_400_property_should_not_exist.md) | Sauvegarder un événement mappé (Weezevent) échoue avec « property revenue should not exist » — champs `revenue`/`transactionCount`/`avgSpendPerTx`/`perCapita` envoyés par `EventFormDrawer` mais absents du DTO backend | 🟢 Corrigé | 🟠 | Événements |
| [273-02](273_02_erreurs_formulaires_pas_toujours_juste_au_dessus_du_bouton_validation.md) | Messages d'erreur de formulaire pas toujours juste au-dessus du bouton de validation — 45 fichiers, erreur codée en dur en haut du corps scrollable au lieu d'être fixée juste avant le footer ; inclut `HrDeleteDialog` qui n'affichait aucune erreur de suppression | 🟢 Corrigé | 🟡 | Transverse |
| [274-02](274_02_spacemenu_merchshop_visible_dans_assignation_menuitem.md) | Menus des Espaces : les stands Merch (`merchshop`) apparaissaient dans la liste des PDV assignables à un menu item — filtre `type` absent, hérité du `shopTypes` backend partagé avec Restock/Event Predict/Analyse | 🟢 Corrigé | 🟠 | Menu & recettes |
| [275-02](275_02_merchshop_infiltre_menuassignment_predict_et_inventory.md) | Même bug que BUG-274 sur 2 autres écrans : Event Predict (onglet Menus, écriture possible d'un MenuItem sur un stand Merch) et Inventory (onglet Shops, carte Merch dupliquée/fantôme) — correctif écrit puis retiré de `develop`, préservé sur `fix/bug-275-merchshop-predict-inventory`, **repris le 2026-08-04** dans le lot BUG-290-01 (conflit à prévoir si la branche d'origine est mergée après) | 🟡 Corrigé non déployé | 🟠 | Prévision / Stock |
| [276-02](276_02_spacemenuitemview_sans_tout_selectionner.md) | Menus des Espaces (« Par menu item ») : pas de « Tout sélectionner » pour attacher un article à toutes les boutiques d'un coup — même demande que BUG-268, écran miroir | 🟢 Corrigé | 🟡 | Menu & recettes |
| [277-01](277_01_eventdetailseditor_darkmode_drawer_illisible.md) | Drawer « Event detail » (Event Predict) illisible en dark mode : `EventDetailsEditor.vue` seul consommateur d'`EventDrawerShell` sans `:is-dark` ni bloc `--dark`, drawer téléporté hors des racines `--fb-*` → corps clair + texte Vuetify blanc | 🟡 Corrigé non déployé | 🟠 | Analyse & agrégation / Thème |
| [278-01](278_01_analyse_pagination_v_pagination_blanc_sur_sombre.md) | Analyse : pagination du tableau « par shop » en carré blanc illisible en sombre — bloc `.mibs--dark` ne couvrait pas la `v-pagination` ; override défensif + pastille page active | 🟡 Corrigé non déployé | 🟡 | Analyse & agrégation / Thème |
| [279-01](279_01_delete_dialogs_prop_isdark_declaree_jamais_appliquee.md) | `ProductDeleteDialog` + `SupplierDeleteDialog` : prop `isDark` déclarée mais jamais appliquée (4ᵉ occurrence du défaut type) — modals blanches sur 8 routes en sombre | 🟡 Corrigé non déployé | 🟠 | Achats & référentiels / Thème |
| [280-01](280_01_analyse_charts_darkmode_phase2.md) | Charts Analyse « phase 2 » (reportée depuis BUG-196) : titres `#212121`, toggle clair, grille Chart.js `#EEEEEE`, carte pastel violette — couleurs canvas dérivées d'`isDark` en JS + blocs `--dark` (5 charts) | 🟡 Corrigé non déployé | 🟡 | Analyse & agrégation / Thème |
| [281-01](281_01_builder2_inspector_darkmode_vague_dediee.md) | Builder2 : 4 sections de l'inspecteur (0 variable thème, 10-32 littéraux chacune) + 4 dialogs téléportés restés clairs — vague dédiée annoncée par BUG-247-01 | 🟡 Corrigé non déployé | 🟡 | Espaces & builder / Thème |
| [282-01](282_01_darkmode_chrome_global_et_teleportes.md) | Chrome global : flash blanc du loader de navigation, skeleton Predict clair, `NumberField` sur `prefers-color-scheme` (OS) au lieu de `.dark`, recherche du switcher d'espace, notifications `/spaces-overview`, dialog Weezevent — + 2 faux positifs documentés | 🟡 Corrigé non déployé | 🟡 | Transverse / Thème |
| [283-01](283_01_restock_etapes_restock_shopping_darkmode.md) | Restock étapes « Réarmement »/« Courses » hors contrat `--sr-*` (reporté depuis BUG-197) : confirm-btn, toggles fournisseurs, verts « confirmé », éditeur e-mail téléporté, bottom-sheet mobile ; `SpaceLogisticView` vérifié conforme | 🟡 Corrigé non déployé | 🟡 | Stock / Logistique / Thème |
| [284-01](284_01_analyse_freeze_clics_segments_quick_wins.md) | Analyse : freeze momentané au clic segment graph/camembert et au changement de config — clics coalescés 150 ms, cache item-level `shallowRef`+gelé, contexte réconciliation singleton, animations Chart.js 200 ms, boucles `itemTotals` fusionnées ; chantier index partagés reste en fiche 179 | 🟡 Corrigé non déployé | 🟠 | Analyse & agrégation / Performance |
| [285-01](285_01_analyse_memoire_2_3_go_caches_sans_eviction.md) | Analyse : 2-3 Go de RAM Chrome — caches API/Vuex/composables **sans aucune éviction** (croissance à vie), 5-6 copies simultanées du dataset minute-level, `<keep-alive>` illimité, re-préprocessing idempotent ; + volet fluidité : surlignage optimiste de la part cliquée et voiles squelettes (maquette validée) | 🟡 Corrigé non déployé | 🔴 | Analyse & agrégation / Performance mémoire |
| [286-01](286_01_shops_config_ecrasee_reponse_non_filtree.md) | `GET /spaces/:id/shops` **sans `configId`** : `DISTINCT ON (se.id)` ne renvoyait un élément v2 partagé que sous son adhésion la **plus ancienne** → Event Predict (« No point of sale in this configuration » sur une config qui a 11 shops) et Space Restock voyaient 0 PdV ; `menuItemsCount` était aussi celui d'une autre config. Fix backend 2 lignes SQL + 3 garde-fous de fusion (OU/MAX) côté `EventPredictView` | 🟡 Corrigé non déployé | 🔴 | Espaces & builder / Prévision / Stock |
| [287-01](287_01_analyse_txn_min_pdv_ignore_plage_horaire.md) | Analyse : la chip **txn/min** des PdV (SummaryPanel, KPI header, panneau cartes, export) ignorait la plage horaire de la timeline — `useShopPerformance` ne lisait jamais `selectedTimeRange` et `shops` était un `ref` figé. Fix : calculs extraits en fonctions pures (`shopPerformanceCompute.js`), `shops` → computed réactif fenêtré ; « 1ère heure » et « pic 15 min » restent plein évènement (décision owner) | 🟡 Corrigé non déployé | 🟠 | Analyse & agrégation |
| [288-01](288_01_restock_composant_partage_lignes_dupliquees.md) | Réarmement : un composant partagé par plusieurs menu items (ex. « Cup 50CL ») produit **N lignes** dans le même PdV au lieu d'une seule agrégée — `expandMenuItemStock` émet `id: component.id` (PK de la **ligne de recette**, unique par menu item) au lieu de l'identité catalogue `componentIngredientId()` déjà utilisée par la branche feuille. Effets : `Math.ceil` de packaging appliqué N fois (sur-commande), stock restant déduit N fois, réglages %/exclusion/confirmation fragmentés. Fix : identité catalogue (`componentIngredientId`) + détail « utilisé dans » par menu item avec sa part du besoin | 🟡 Corrigé non déployé | 🟠 | Stock |
| [290-01](290_01_eventpredict_stockup_prediction_zero_et_decomposition.md) | Event Predict / Stock-up : le Stock-up indexait les prédictions timeline par `shopId` + id d'item **seuls**, alors que `menuItemId` porte l'id du produit **Weezevent** et `mappedMenuItemId` l'id **catalogue** (`timelineBucketing.js:174/204`) → prédiction 0 → l'article était écarté du chargement (`adjustedQty === 0`) : « Burger » à 0 sur le 1A alors que l'écran Menus affichait 95, à partir de la **même** donnée. Fix : indexation/lecture uniques partagées (`utils/predictedQuantityIndex.js`, MAX et non somme — sinon 190 au lieu de 95). + décomposition ramenée à **un seul niveau** hors combo (récursion pilotée par le parent, décision Bertrand 2026-08-04) ; + repli d'hydratation (vagues 2a/2b de `useSpaceData`) qui affichait « Burger seul » après un hard refresh ; + reprise du filtre merchshop (BUG-275-02) | 🟡 Corrigé non déployé | 🔴 | Prévision / Stock |
| [291-01](291_01_reappro_recette_amputee_et_grain_menu_item.md) | Réappro : `buildComponents` (`menuItemNormalize.js`) chaînait `components` / `ingredients` / `packagings` en **alternatives** au lieu d'une union → dès qu'un article avait un composant, ses ingrédients et son packaging étaient jetés (Burger 25/26 (Aux) : 2 lignes sur 7, sans nom, fusionnées en une ligne fantôme « 64,05 unit »). C'est **S1** du brief initial ; l'API renvoyait bien les 7. + copie du store figée dans `EventPredictView` (vague 2b jamais adoptée) ; + garde sur les composants sans nom (miroir `stockPlanning.js:280-288`) ; + onglet « Par article » passé du grain **plat** au grain **élément** (`elementStockData` dérivé de `shopStockData`) ; + `StockElementRow.vue` partagé par les deux modes, coût par élément ; + suppression du groupement `shopType` (« Aucun type de point de vente »). ⚠️ Impacte aussi Inventaire et Restock via `normalizeMenuItem` | 🟡 Corrigé non déployé | 🔴 | Stock |
| [291-02](291_02_eventpredict_menuitem_indisponible_compte_comme_vente.md) | Event Predict / Réarmement : un article **impossible à produire** (`available:false` — pas de recette, ingrédient inactif / sans fournisseur, ou fournisseur ne livrant pas l'espace) prévoyait quand même des ventes (Cookie « 7 – Ajusté : 7 »), donc du CA, du stock-up **et** des lignes de réarmement avec ses ingrédients. La 1re passe (291-01) filtrait la liste **affichée** du menu assigné → l'article basculait dans le bucket « non attaché » **avec sa quantité intacte** : il ressortait par une autre porte, badgé « désactivé » comme un simple `enabled:false` (deux cas sans rapport). Fix : `itemMap` / `idMap` séparés + index `unavailableMap` ; gardes sur les **4** chemins de quantité (dont `getAdjustedQuantity`, sans quoi la branche quantité manuelle ressuscitait l'article) ; article rendu visible en « Sans ventes prévues » avec badge « indisponible » et raison ; `unavailableByShop` sur `buildStockRequirements`/`buildMenuItemDemand` (chaîne Réarmement, séparée, qui n'appliquait aucune règle). ⚠️ Inventaire et backend `deriveSales` **non alignés** | 🟡 Corrigé non déployé | 🔴 | Prévision / Stock |
| [292-01](292_01_decomposition_unique_stockup_inventaire_restock_feuille_de_course.md) | **Cinq** implémentations vivantes de la même règle de décomposition (stock-up, réarmement, inventaire pré/post, feuille de course, panneaux builder), avec cinq critères de récursion et deux identités de ligne différentes → le nombre de sauces pickle à charger, à compter et à réarmer ne se joint pas. Règle métier : on découpe d'un seul cran, jamais deux — sauf la **feuille de course**, seul écran qui a le droit d'éclater un composant (« on n'achète pas de la sauce pickle, on achète son vinaigre »). **Phase 1 livrée** : `utils/menuItemExpansion.js` (la règle écrite une fois) + `utils/componentCatalog.js` (hydratation `subComponents`, extraite de `useSpaceData` et partagée) + éclatement composant→ingrédients dans `bomPlanning` — qui ne le faisait **pas du tout** (`refMenuItemId` n'est jamais peuplé pour un `MenuComponent` : ni `menuItemId` ni `sourceMenuItemId` au schéma), contrairement à ce qu'affirmait BUG-290-01. **Phase 2** : les 3 consommateurs branchés sur le module (`expandMenuItemStock` réduit à un adaptateur, récursion combo + suppression de l'éclatement ; `EventPredictStockUpSection` passé à l'identité catalogue — le bug cups de BUG-288-01 y était encore vivant ; `inventoryUtils` aligné sur le même critère et la même identité, donc le netting comptage ⇄ réarmement joint enfin). + **merch** : le repli synthétique n'était pas filtrable (un record de timeline ne porte aucun signal merch — `shopType` ≠ type d'élément) ; le vrai défaut était que le Stock-up ne recevait pas `configShops` (`/spaces/:id/shops`, indépendant du layout), contrairement au Menus → prop ajoutée, cascade layout → /shops filtré → synthétique. + `expansionParity.spec.js`, garde-fou anti-divergence | 🟡 Corrigé non déployé | 🔴 | Stock / Prévision |
| [293-01](293_01_rearmement_vue_par_shop_non_rattaches_faux_positifs.md) | Réarmement, vue **Par shop** : le split « Non rattachés au menu — à remapper » badge **26 articles sur 26** du PdV « 1 B » en « non mappé », sans aucun tableau rattaché — alors que le détail « Utilisé dans » nomme bien des menu items réels du PdV. `restockRowAssigned` teste au **grain élément** ce qui est une notion de **menu item** : le repli `findBestMatch` compare un nom d'ingrédient (« Cup 50CL ») aux noms de menu items (score ≥ 70 inatteignable), `sources[].menuItemId` porte l'id du **sous-article** dès qu'il y a récursion combo (`menuItemExpansion.js:207` — id du niveau courant, nom de la racine ; amplifié par BUG-292-01 qui ouvre systématiquement les combos), et un PdV absent de la map keyée par **nom de shop** bascule **en entier** (`if (!set) return !restockAssignmentActive`). **Contournement livré** : vue « Par shop » masquée, seule « Par article » servie (elle n'applique aucun de ces tests) ; rendu conservé mais inaccessible. Cause exacte du 26/26 non tranchée entre « clé shop absente » et « aucun id source ne joint ». Correctif de fond à faire : identité **racine** portée par les lignes, repli par nom sur `sources[].menuItemName`, et « menu non chargé » ≠ « non rattaché » | ⚪ Diagnostiqué (contourné) | 🟠 | Stock |
| [294-01](294_01_restock_feuille_course_429_fanout_recettes.md) | Feuille de course mode ingrédients : 7 articles à recette complète classés « Sans fournisseur (ingrédients manquants) ». `ensureRecipesLoaded` faisait un `Promise.all` **non borné** de ~40 GET `/menu-items/:id` → 429 `TenantThrottlerGuard` (retry client unique et borné 5 s insuffisant) → chaque échec caché comme **recette vide** (cache empoisonné, jamais refetché) → fallback BOM `itemType: 'MenuItem'` → groupe `__finished__`. Le libellé accusait la donnée alors que le **transport** échouait. Fix : **un** appel batch `POST /menu-items/recipes` (endpoint existant, wrapper `getMenuItemRecipes` jamais consommé) + adaptateur `normalizeRecipeFromBatch` (clé d'agrégation = `sourceId`, pas le join-line id) + fusion `suppliers[]` ; anti-poison (échec réseau ≠ recette vide, id absent de la réponse = vrai produit fini) ; repli per-id borné (`runWithConcurrency`, 4) + snackbar `srSnackRecipesPartial` ; backend : permission `menu.fb.menuItems` retirée du batch (lecture pure, alignée sur GET `:id/recipe`). ⚠️ `ids: []` = tout le tenant — guard `!missing.length` indispensable. Parité détail ↔ batch testée (`bomPlanningBatchRecipe.spec.js`) | 🟡 Corrigé non déployé | 🔴 | Stock |
| [295-01](295_01_rearmement_quantites_fractionnees_unites_inventaire.md) | Réarmement : « À déposer » fractionné (0,7 kg) alors que l'article est conditionné en paquets de 500 g — `roundForUnit` arrondissait le gap à 0,1 près et le `packedCount` était calculé sur la **cible** du PDV, pas sur le manque (colis surestimés dès qu'il restait du stock, incohérents avec la quantité loose affichée à côté). Fix : `packaging` recalculé sur le manque + `coveredQuantityForPackaging` (`stockPlanning.js`, inverse exact de la formule `packedCount`) — la suggestion devient la couverture en colis ENTIERS (0,7 kg → 2 paquets → 1 kg), repli historique sans « Inventory Information ». **C2 (retest)** : le conditionnement ne se résolvait JAMAIS pour un ingrédient — `computePackagingForQuantity` ne lisait que des champs à plat alors que `/ingredients` niche tout dans `marketPrice` (`inventoryPackaging`, qté/paquet dans `packedUnits` — même repli qu'`inventoryUtils.resolveQtyPackaged`) → chaîne de candidats étendue (libellé à plat des composants + MarketPrice niché). Arrondi par PDV avant agrégation (3×0,7 kg = 6 paquets, comportement métier) ; overrides manuels jamais réarrondis ; plans figés inchangés (ADR-0005) | 🟡 Corrigé non déployé | 🔴 | Stock |
| [296-01](296_01_rearmement_ventilation_etape1_stock_final_vrac.md) | Réarmement : la ventilation predict − inventaire restant = manque n'apparaissait qu'à l'étape 2 (l'étape 1 ne montrait que « prédit → cible ») ; **stock final prévu** (restant + déposé − besoin) et **reste en vrac** (couvert − manque, sous-produit de l'arrondi 295-01 : besoin 1,1 kg, 3×500 g → 400 g de vrac) calculés nulle part. Fix 100 % front (snapshot RestockPlan = Json libre, zéro migration) : `computeRestockOutcome` + `aggregateRestockOutcomesByItem` (`stockPlanning.js`, formule unique) ; `liveRestockRows` scindé en `liveRestockRowsAll` (non filtré, porte gap/vrac/stock final) + filtre d'affichage inchangé ; bloc ventilation étape 1 (`stockOutcomeByItem` : agrégat vivant ou valeurs figées) ; colonnes « Reste en vrac » / « Stock final prévu » sur les 3 tables étape 2 ; ventilation figée dans `freezeStockLine`/`freezeRestockLine`, `applyPlanEdits` recalcule sur les valeurs figées (ADR-0005) ; watcher `objectiveSource` rechargeait pas l'inventaire → `loadPreviousInventory()` ajouté. Plans antérieurs : bloc masqué / tirets, aucun recalcul | 🟡 Corrigé non déployé | 🟠 | Stock |
| [297-01](297_01_rearmement_layout_collapse_scroll_colonnes.md) | Réarmement : replier le panneau de filtres (chevron `WorkspacePanelToggle`) cassait la grille — `sr-body--no-aside` seul n'avait aucune règle `grid-template-columns` (seules les combinaisons avec `sr-body--no-suppliers`, classe **jamais posée** dans le template, en avaient) → grille 3 colonnes avec 2 enfants : `.sr-main` écrasé dans la track de 292px, Fournisseurs au centre, track droite vide. Et aucune colonne ne scrollait : `.sr-body` sans `grid-template-rows`, la ligne implicite `auto` se dimensionne au contenu → `max-height: 100%` des colonnes ne borne rien, `overflow: hidden` coupe le bas. Fix CSS pur : `.sr-body--no-aside { grid-template-columns: minmax(0, 1fr) 340px; }` (pattern `.lg-layout--no-aside` de la Logistique) + `grid-template-rows: minmax(0, 1fr)` sur `.sr-body`/`.sr-skeleton` (annulé `none` en < 1100px, scroll page) | 🟡 Corrigé non déployé | 🟠 | Stock |
| [298-01](298_01_analyse_cout_par_event_a_zero_source_shop_level.md) | Analyse : le graphe « Coût par event » (ouvert au clic KPI COST) affiche 0 pour **tous** les events — axe 0→1 € — alors que le KPI COST au-dessus affiche 186 252,93 €. Le coût n'existe que sur le grain ARTICLE (`costMap[menuItemId] × quantité`, aucun record ne porte de champ `cost`) ; or le graphe lit `analyse/filteredEventAggregates`, bâti sur `shop-details` qui est **shop-level et ne porte aucun `menuItemId`** (`analyse.js:974`, docblock `useAnalyseItemRecords.js`) → `costMap[undefined]` = 0 à chaque ligne (`analyse.js:1564`). Le KPI, lui, agrège `itemLevelRecords` (`event-timeline`, grain article) via `useMetricsCalculator.js:53` → montant juste, d'où l'écart. `GenericByEventChart` a pourtant un calcul correct depuis `props.records` (item-level) mais `eventRows` court-circuite dès que `eventAggregates` est non vide, donc il n'est jamais atteint. Fix : helper unique `itemLevelTotalsByEvent` (`analyseAggregations.js`, formule verbatim du KPI — surtout pas `r.totalCost`, figé avec une costMap parfois vide en phase 1 ; CA cumulé dans la même passe pour que la marge reste d'un seul grain) ; superposition du seul `cost` sur les agrégats dans `GenericByEventChart` (Map vide = agrégats intacts, pas de 0 transitoire pendant le chargement async) ; colonnes **Coût** + **% Marge** ajoutées à la table d'export « by event » (marge sur le CA item-level, cellules vides et jamais 0 pour un event hors cap) + `menuItemCostMap` dans la `signature` du dataset. Hors périmètre (décision JLH) : `currentPeriodTotals.cost`/`previous`/`YoY` du store restent à 0 (non consommés par le bandeau, qui lit `itemSummary`), la métrique `transactions` du même graphe garde sa divergence de grain (minute × PdV vs minute × PdV × produit), et le cap `MAX_EVENTS = 50` de l'item-level laisse les events au-delà à 0 **sans signalement** (⚠️ ce dernier point : différé **levé le 2026-08-21**, cap porté à 100 + troncature signalée — voir [350-01](350_01_ca_variable_home_analyse_bascule_source.md)) | 🟡 Corrigé non déployé | 🟠 | Analyse |
| [299-01](299_01_associations_ingredient_recette_par_nom_homonymes.md) | Associations ingrédient/recette faites (aussi) par NOM au lieu de l'ID référencé par la recette → deux articles homonymes confondus (« Beurre » plaquette 0,25 kg vs « Beurre doux motte » 0,5 kg) : mauvais article visé par le manque prédictif, mauvais conditionnement remonté, stock d'un homonyme qui nette le besoin d'un autre, ingrédient requalifié en menu item homonyme dans un combo. 4 foyers : `resolveComponentMenuItem` (nom primait sur sourceId, départage « premier du tableau »), `findStockReference` (prédicat mixte id OU nom candidat par candidat), `computePackaging` du Stock-up (idem + ni sourceId ni marketPriceId testés), `consumeFromPool` (repli nom même entre deux lignes identifiées sans id commun). Fix : l'ID prime TOUJOURS, nom = repli réservé aux lignes sans identifiant ; spec bout-en-bout `ingredientAssociationById.spec.js` (beurre de motte : besoin 1 kg, stock 0,4 kg → manque 0,6 kg → 2 mottes de 0,5 kg) | 🟡 Corrigé non déployé | 🟠 | Prévision / Stock |
| [300-01](300_01_analyse_zones_vides_changement_espace.md) | Analyse : donut « Par zone » définitivement vide (« 0 zones / Aucune donnée ») après un changement d'espace SANS rechargement (Aix → Auxerre). `shopArea` n'existe qu'après réconciliation avec les `floorElements` du contexte « All Configurations », chargé en différé — or au changement d'espace (vue non remontée, clé = route.name, cf. BUG-285) la garde « déjà chargé » de `requestDeferredAllConfigsContext` voyait le contexte de l'ANCIEN espace (`configShopContext` jamais purgé par loadSpace) et latchait sans dispatcher ; `configContextSettled` restant true, `areaPending` affichait `anDonutEmpty` au lieu du squelette — cause racine probable de la remarque JLH du 04/08 (« No data for this breakdown »). Fix : `CLEAR_SPACE_KEYED_CACHES` purge aussi le contexte config + bump du jeton anti-race `configContextReqId` (un vol en cours de l'ancien espace ne commit plus par-dessus), reset du latch vue dans le watcher spaceId. Test mutation ajouté (`analyseStore.spec.js`) | 🟡 Corrigé non déployé | 🟠 | Analyse |
| [301-02](301_02_live_bootstrap_complet_relance_a_chaque_tick.md) | Live : `liveShopDetailsPoll()` relançait `analyse/loadSpace` (bootstrap catalogue COMPLET — menu items, ingrédients, packaging, produits/mappings Weezevent, pagination `/menu-components` + fan-out détail) à chaque tick de 15s au lieu de ne rafraîchir que les 2 endpoints réellement volatils pendant un event (shop-granular + shop-details) — charge DB multipliée par le nombre d'onglets/utilisateurs restant sur `/spaces/:id/live`. Trouvé par audit proactif, pas un symptôme rapporté. Fix : `fetchLiveShopSnapshot()` (2 requêtes, catalogues injectés depuis le store) + action dédiée `refreshLiveShopSnapshot` à périmètre de commit réduit ; `loadSpace` inchangée pour ses autres appelants | 🟢 Corrigé | 🟠 | Live events / Performance |
| [302-02](302_02_live_nouvel_event_invisible_sans_recharger.md) | Live : régression introduite par BUG-301-02 — le périmètre allégé du poll ne rafraîchissait plus `state.events`, alors qu'`applyLiveScope()` résout bien un nouvel `eventId` à chaque tick via `/live-status`. Un event créé APRÈS le 1er chargement de la page (ex. run QA d'auto-simulation, `ensureTodaySalesEvent`) n'apparaissait donc jamais dans `filteredEvents` (`analyse.js:829-846`, base = `state.events`) : écran Live complètement vide malgré un vrai signal live confirmé côté backend (`getLiveStatus` recalculé à la main → `isLive:true`, données saines). Signalé par l'utilisateur (« ça marche pas, rien ne s'affiche »). Fix : `fetchLiveShopSnapshot` ajoute un fetch `getEvents` léger (excludeSimulated:false), commit `SET_EVENTS` seulement si le fetch réussit (sentinelle `null` sur échec réseau, jamais d'écrasement par `[]`) | 🟢 Corrigé | 🔴 | Live events |
| [303-02](303_02_live_qa_vente_simulee_facturee_zero.md) | Live/QA : vente simulée (`simulateSale`, `LiveSaleSimulatorWidget`) facturée à 0€ — CA à 0 partout alors que quantités et coût affichaient des valeurs réelles. Cause : menu item mappé à DEUX produits Weezevent (schéma autorise plusieurs `ProductMapping` par `menuItemId`), l'un sain (basePrice=4€), l'autre un doublon créé par un re-sync ultérieur avec `basePrice=null` ; `simulateSale` (`logistics.service.ts:1905`) résolvait via un `Map` sans `orderBy` → ordre Prisma non garanti → tantôt le bon mapping, tantôt le cassé. Fix architectural (pas juste patch) : `simulateSale`/`getSimulableShops` facturent désormais le prix catalogue DataFriday de l'ESPACE (`SpaceMenuItem.priceTtc` → `MenuItem.basePrice`), plus jamais `SalesProduct.basePrice` — ventes réelles (webhook) non concernées, elles portent leur propre prix | 🟢 Corrigé | 🟠 | Live events / Stock |
| [304-02](304_02_live_panneau_filtres_sections_trompeuses_non_scopees.md) | Live : panneau de filtres gauche identique à l'Analyse classique, zéro logique Live-aware. Config/Événements/Dates éditables en apparence mais écrasés à chaque tick (`applyLiveScope`) ; Filtres avancés (niveau EVENT, alors qu'un seul event est jamais en scope en Live) pouvaient vider tout l'écran silencieusement SANS se réinitialiser ; Types de PDV/Zones/Points de vente (`optionsBaseRecords`, `analyse.js:1028`) scopés à `analysableEvents` (TOUT l'historique analysable de l'espace) au lieu du seul event live — un shop actif toute la saison affichait son total saison ; Affluence (`attendanceBounds`) calculée sur `state.events` SANS AUCUN scope. Signalé par l'utilisateur (chiffres "pas corrects", Affluence "qui ne fait rien"). Fix : Config/Événements/Dates/Filtres avancés/Affluence masqués en Live (prop `isLive`) ; nouveau `state.isLiveRoute` bascule `optionsBaseRecords` sur `filteredEvents` (comportement Analyse/Predict/EventPredict inchangé) | 🟢 Corrigé | 🟠 | Live events / Analyse |
| [305-02](305_02_live_bandeau_rouge_elements_trompeurs.md) | Live : suite de BUG-304-02 — mêmes trappes dans le bandeau rouge. Ligne 2 (select période + « Comparer à ») cliquable pour rien ; chip "N événement(s) sélectionné(s)" toujours "1", redondant avec le badge ● LIVE ; chip "Période : Aujourd'hui" visible sans UI pour l'expliquer pendant la fenêtre où l'event live n'est pas encore détecté (`applyLiveScope` bascule alors sciemment sur `timeRange:'today'`) ; bouton "Rapport J+1" (conçu pour un event TERMINÉ) activable dès la 1re minute d'un event encore en cours (`reportEvent` ne vérifie que `date <= now`, pas la fin de l'event). Fix : les 4 masqués/désactivés en Live ; chip Période supprimé via `!state.isLiveRoute` dans `activeFilterChips`. Point initialement laissé ouvert (badge ● LIVE basé sur la route seule) **corrigé le jour même** — voir BUG-306-02 | 🟢 Corrigé | 🟡 | Live events / Analyse |
| [306-02](306_02_live_badge_base_sur_route_pas_detection_reelle.md) | Live : badge "● LIVE" basé uniquement sur `route.name === 'space-live'`, pas sur la détection réelle d'un event (`/live-status`) — restait affiché même sans event dans la fenêtre glissante de 30 min, EN MÊME TEMPS que le titre retombait sur "Analyse" (aucun event sélectionné) : combinaison contradictoire, signalée par l'utilisateur comme "très mal vu". Fix : nouveau `liveEventDetected` (ref posée par `applyLiveScope()` depuis la vraie réponse `/live-status`, réinitialisée en quittant la route Live), badge conditionné dessus. Sert aussi de garde au nouveau bouton "voir/modifier l'event live" (feature du même jour, §18) | 🟢 Corrigé | 🟡 | Live events |
| [307-02](307_02_event_avgspendpertx_percapita_jamais_calcules.md) | `Event.avgSpendPerTx` jamais calculé par le pipeline d'agrégation automatique (`executeProcessEvents`, BUG-033 avait branché `revenue`/`transactionCount` mais pas ces 2 champs) — fiche event affichant "Avg Spend/Tx"/"Per Capita" vides malgré Revenue/Transactions renseignés. Signalé par l'utilisateur en éditant l'event live du jour. Fix : `avgSpendPerTx = revenue/transactionCount` (arrondi, `null` sans transaction) ; `perCapita = revenue/attendees` (`ticketsScanned` ?? `ticketsSold`), `null` (pas 0) sans vraie donnée de billetterie — cas normal pour un event QA simulé, jamais scanné ; se peuple automatiquement pour un event réel dès que le sync attendees existant écrit `ticketsScanned` | 🟢 Corrigé | 🟡 | Événements / Analyse & agrégation |
| [308-02](308_02_live_titre_bouton_edition_disparaissent_sans_vente_recente.md) | Live : titre retombait sur "Analyse" et le bouton d'édition de l'event (BUG-306-02) disparaissait dès que la dernière vente datait de plus de 30 min, alors qu'un event pour AUJOURD'HUI existait bien pour l'espace. Cause : `applyLiveScope()` liait titre ET bouton d'édition au même signal strict que le badge (`getLiveStatus`, vente < 30 min) — sans vente récente, `selectedEventIds` était vidé. Fix : repli `findTodayEventId()` (event dont la fenêtre couvre aujourd'hui, lecture pure sur `state.events`) sert d'ancre pour le titre et le bouton, indépendamment du pulse strict qui reste réservé au badge ● LIVE (`liveEventDetected`) | 🟢 Corrigé | 🟠 | Live events |
| [309-02](309_02_menu_items_edition_ecrase_unit_cost_total_cost_combo.md) | Édition d'un menu item : `unitCost`/`totalCost` des lignes de recette (ingrédients/composants/packagings) écrasés à 0 après sauvegarde, même pour une simple modif de nom/prix. Cause : `create()`/`update()` traitaient le recalcul « plat » (`refreshCosts`) et le recalcul « combo » (`refreshComboCost`) comme mutuellement exclusifs sur `if (comboItemsLines) {...} else if (...)`, or `comboItemsLines` est un tableau `[]` (donc truthy) dès que le frontend envoie `comboItems` — devenu systématique depuis l'ajout des combo items (`ddc8ac4f`, 2026-08-03) — court-circuitant `refreshCosts()`, seule fonction qui persiste `unitCost`/`totalCost` sur les lignes. Fix : les deux recalculs ne sont plus exclusifs (`refreshComboCost` conditionné à `comboItemsLines.length > 0`) | 🟡 Corrigé non testé | 🔴 | Menu & recettes |
| [310-02](310_02_menu_items_ligne_recette_dupliquee_erreur_serveur_generique.md) | Menu item : sélectionner deux fois le même ingrédient/composant/packaging/article combo dans la recette renvoie le message Prisma brut (« Unique constraint failed on the fields... ») au lieu d'un message compréhensible — `update()` (et les routes `replaceComponents`/`replaceIngredients`/`replacePackagings`/`replaceComboItems`) ne catchaient pas `P2002` du tout. Fix : helper `describeMenuItemUniqueConstraintError` qui lit `error.meta.target` et renvoie un message FR ciblé par champ en conflit | 🟡 Corrigé non testé | 🟡 | Menu & recettes |
| [311-01](311_01_eventpredict_estimation_zero_event_sans_historique.md) | Event Predict : event futur SANS historique comparable → `predictedTimelineData = []` → `predictionItemsContext = 'not-calculated'` → grille PDV × articles supprimée (« Aucun article disponible pour cette prédiction ») alors que l'énumération PDV × articles du Space Menu (`configShopElements` + `shopMenuAssignmentItems`) et le canal `manualQuantities` existaient déjà de bout en bout. Feature « Estimation 0 » : bouton « Démarrez une estimation » dans l'empty state → la branche `'not-calculated'` devient `'ready'` (util pur `estimationMode.js`), grille rendue depuis le Space Menu à prédiction 0, saisie manuelle (slider + input number, plafond dynamique > 500), onglet par défaut « Sans ventes prévues », mode persisté en brouillon + ré-armé via `manualQuantities` d'une version rechargée. Aucun changement backend | 🟡 Corrigé non déployé | 🔴 | Event Predict |
| [311-02](311_02_eventpredict_estimation_sliders_absolus_et_couts.md) | Estimation 0, suite (retour test JLH) : (1) sliders shop/article inopérants — un % sur une base 0 rend toujours 0 → en mode estimation ils deviennent des sliders de QUANTITÉ ABSOLUE (0 → échelle max éditable, défaut 1000, utils purs `uniformValue`/`applyFanoutQuantity`/`estimationSliderMax`) écrivant `manualQuantities` sur les couples cochés ; (2) coûts/marges invisibles — lignes slim de l'assignation sans champ de coût + `manualQuantityRecords` lisant le snapshot local figé sans repli → résolution catalogue (`totalCost`) dans `itemUnitCost` + `effectiveMenuItemCostMap` + repli catalogue dans les 4 lecteurs internes ; (3) double application du % réappro/besoin sur les lignes `isManual` déjà ajustées → `isManualOnlyForElement` neutralise le % (`buildStockRequirements`/`buildMenuItemDemand`), `withManualRecords` pré-ajuste à l'injection (sémantique unifiée « isManual = quantité finale »). Aucun changement backend | 🟡 Corrigé non déployé | 🔴 | Event Predict |
| [312-01](312_01_eventpredict_maquettes_toolbar_alias_flicker.md) | Évolution (maquettes validées 08/2026), 7 lots sur une branche : toolbar EP resserrée 2 lignes + 2 chips-filtres globaux « Article sans prévision » / « Article hors Space Menu » (compteurs, filtre cartes + bascule bucket, vues PDV et article) ; NOUVEAU alias « historique emprunté » (table `MenuItemHistoryAlias` + CRUD NestJS + store réactif + drawer « Utiliser l'historique d'un autre article » depuis le kebab, résolution 100 % frontend au point unique `activeTimelineData` — page Analyse intouchée, badge vert sur la cible) ; fix flicker Analyse ↔ Prévu (suppression overlay de transition + double rAF/setTimeout + latch skeleton à store chaud) ; fix auto-sélection à la réactivation (`applyAssignToExplicit`) ; 2 gaps 311_02 côté Réappro (`manualQuantities` lus depuis la colonne BDD, flag `isManual` conservé dans `predictedRecords`). ⚠ Migration `20260811090000_add_menu_item_history_alias` à appliquer manuellement AVANT déploiement | 🟡 Implémenté non déployé | 🟠 | Event Predict |
| [313-01](313_01_eventpredict_kebab_article_bulk_space_menus.md) | Event Predict / Par article : kebab « ⋮ » au niveau ARTICLE — action « Ajouter l'article à tous les PDV (Space Menus) » en 1 seul `POST /space-menu` multi-shops (delta partiel backend, shops déjà activés exclus, grisé si proposé partout) + lien Space Menus ; kebabs par PDV conservés. Maquette JLH 08/2026, aucun changement backend | 🟡 Corrigé non testé | 🟡 | Event Predict / Menu & recettes |
| [314-01](314_01_rearmement_espaces_de_stockage.md) | Réarmement (spec PDF 08/2026) : onglet « Espaces de stockage » à l'étape 1 — stock tampon lu de la section Inventaire du 3D Builder (`ElementInventory.quantity`, store `storageInventory` TTL 15 min), nécessaire = max(0, tampon − restant compté), slider absolu plafonné 5× tampon, alertes seuils min/max (front only), Item Supplier Name + édition Market Price in situ (drawer réutilisé, permission `menu.fb.marketPrices`), lignes refill injectées dans la feuille de course APRÈS le pool de netting (règle « restant brut » → question no 54). Aucun changement backend | 🟡 Corrigé non testé | 🟠 | Stock / Espaces & builder / Achats & référentiels |
| [317-02](317_02_aggregation_processevents_deletemany_non_scope_integration.md) | Multi-intégration sur un même space (1/5) : `executeProcessEvents` effaçait (`deleteMany` sans `integrationId`) les agrégats `SpaceRevenueMinuteAgg`/`SpaceRevenueMinuteItemAgg` de TOUTES les intégrations d'un event partagé avant de ne réinsérer que celle traitée → `Event.revenue`/`transactionCount` ne reflétaient que la dernière intégration "Traitée". Fix : colonne `integrationId` (migration) + `deleteMany`/`INSERT` scopés | 🟡 Corrigé non testé | 🔴 | Intégrations & ventes / Analyse & agrégation |
| [318-02](318_02_aggregation_synchronize_purge_espace_sans_scope_integration.md) | Multi-intégration sur un même space (2/5) : "Synchroniser" (`executeSynchronize`) purgeait les 3 tables d'agrégats de TOUT l'espace sans filtre d'intégration (integrationId même pas destructuré de `job.data`), puis ne reconstruisait que l'intégration passée. Fix : cleanup Phase 1 scopé | 🟡 Corrigé non testé | 🔴 | Intégrations & ventes / Analyse & agrégation |
| [319-02](319_02_getweezeventeventsforspace_integration_arbitraire_espace_partage.md) | Multi-intégration sur un même space (3/5) : `getWeezeventEventsForSpace` (`findFirst` sans `orderBy` sur `LocationSpaceMapping`) résolvait une intégration arbitraire quand l'espace est mappé par plusieurs — réhydratation "déjà lié" faussée à l'étape 4. Fix : `integrationId` transmis bout en bout (route + frontend) | 🟡 Corrigé non testé | 🟠 | Intégrations & ventes |
| [320-02](320_02_shops_dupliques_spaceelementid_sans_contrainte_unique_multi_integration.md) | Multi-intégration sur un même space (4/5) : shops dupliqués dans Space Menus et l'étape 2 du wizard — `LEFT JOIN` non agrégé dans `getSpaceShops` fan-out quand 2 intégrations mappent leurs locations vers le même `SpaceElement`. Fix : sous-requêtes scalaires (`EXISTS`/`LIMIT 1`), au plus 1 ligne par (élément, config) | 🟡 Corrigé non testé | 🟠 | Intégrations & ventes / Menu & recettes / Espaces & builder |
| [321-02](321_02_aggregation_join_transactions_sans_scope_spaceid_contamination_croisee.md) | Multi-intégration sur un même space (5/5, symétrique) : l'agrégation par event ne restreint jamais les transactions aux locations réellement mappées à `spaceId` — risque de contamination croisée si une même intégration alimente 2 espaces différents (trouvé en creusant 317/318, non reproduit en prod) | ⚪ Diagnostiqué | 🟠 | Analyse & agrégation / Intégrations & ventes |
| [322-02](322_02_combo_item_picker_liste_toujours_vide.md) | Combo Item Picker (`MenuItemCreateView.vue`) : le drawer s'ouvre (contrairement à BUG-074) mais reste toujours vide — filtre `comboItem='Yes'` jamais positionné sur aucun item existant, sans message explicite ; aucun filtrage par espace câblé malgré support API. Fix : état vide contextuel + filtrage client par `form.spaces` | 🟡 Corrigé non déployé | 🟠 | Menu & recettes |
| [323-01](323_01_analyse_shop_details_double_appel_serialise.md) | Analyse : `shop-details` appelé DEUX fois en série (granular=0 phase 1 redondant — granular=1 en est un surensemble strict — puis granular=1 en vague 2a) → ~36 s avant les graphes, tous gatés sur l'appel le plus lent. Fix : un seul appel granular lancé à t=0, phase 1 réduite à space+configs+events (~1-2 s) ; volet RPC/index → backend BUG-130-01 (14,7 s → 0,65 s). Addendum : espace « Stade Jean Bouin » vide après fix = cause DONNÉES (SRMA orphelin sur 2 espaces supprimés, agrégation jamais relancée après recréation — re-run wizard Step 4) | 🟡 Corrigé non déployé | 🔴 | Analyse & agrégation |
| [324-01](324_01_health_double_slash_api_base_url.md) | `GET /api/v1//health` 404 : `VUE_APP_API_URL` déployée avec slash final, utilisée brute par les deux `fetch()` de warm-up/sonde (`client.js`) — le réveil anticipé du backend Render ne fonctionnait jamais. Fix : trailing slash normalisé | 🟡 Corrigé non déployé | 🟡 | Technique |
| [323-02](323_02_composants_liste_ne_se_rafraichit_pas_duplication_suppression.md) | Composants : liste ne se rafraîchit pas après duplication/suppression — garde `fetching` de `menuComponents/fetchComponents` ignorait silencieusement un appel arrivant pendant un fetch en vol. Fix store (Promise partagée + refetch en chaîne) + UI optimiste (`UPSERT_ROW`/`REMOVE_ROW`, affichage instantané sans dépendre du réseau/cache) | 🟢 Corrigé | 🟠 | Menu & recettes |
| [324-02](324_02_componentcreateview_vapp_imbrique.md) | `ComponentCreateView.vue` était le seul écran du domaine à instancier son propre `&lt;v-app&gt;` en plus de celui d'`App.vue` (v-app imbriqué, non standard) — retiré lors de la refonte du layout | 🟢 Corrigé | 🟡 | Menu & recettes |
| [325-02](325_02_componentcreateview_sous_composants_mapping_champs_incorrect.md) | `ComponentCreateView.vue` : mapping des sous-composants (`children`) lisait `child.componentId`/`child.itemName`, des champs inexistants sur la forme réelle de l'API (`child.childId`/`child.child.name`) — id et nom toujours faux/"-" pour ces lignes en édition | 🟢 Corrigé | 🟠 | Menu & recettes |
| [326-02](326_02_composants_colonne_supplier_jamais_peuplee.md) | Composants : colonne Supplier toujours "-" — champ jamais lu côté front + `MarketPrice.supplier` (dénormalisé) vide sur des lignes réelles malgré un `supplierId` valide. Fix : lecture `marketPrice.supplierRel?.name` en priorité, résolution des fournisseurs des sous-composants via leurs ingrédients directs, affichage tronqué + popup si &gt;2 fournisseurs | 🟢 Corrigé | 🟠 | Menu & recettes |
| [327-02](327_02_composants_liste_header_tableau_non_sticky.md) | Composants : l'en-tête des colonnes du tableau (COMPONENT NAME/CATEGORY/...) n'était pas sticky au scroll, contrairement au bandeau et à la barre de recherche — `position: sticky` ajouté, offset `141px` estimé non vérifié visuellement | 🟡 Corrigé non testé | 🟡 | Menu & recettes |
| [328-02](328_02_aggregation_chevauchement_fenetres_events_double_comptage.md) | Deux events du même space dont les plages de dates se recoupent comptaient deux fois les mêmes transactions (`executeProcessEvents` traitait chaque event indépendamment, aucune exclusion mutuelle) — résolu comme conséquence de 330-02/329-02 | 🟡 Corrigé non testé | 🔴 | Intégrations & ventes / Analyse & agrégation |
| [329-02](329_02_aucune_heure_capturee_evenement_buffer_pre_ouverture.md) | `executeProcessEvents` ignorait `Event.sessions[0].doorsOpening`/`eventEndTime` — réutilise maintenant le mécanisme Staffing (`combineDayAndLocalTime`, offsets ±2h) via `resolveEventWindow()`, + repli dérivé des transactions non liées observées (MIN/MAX ± 90 min) si `doorsOpening` absent | 🟡 Corrigé non testé | 🔴 | Intégrations & ventes / Analyse & agrégation / RH & staffing |
| [330-02](330_02_aggregation_utiliser_transaction_eventid_au_lieu_de_date_range.md) | Root cause commune à 328/329 : l'agrégation devinait l'event d'une transaction par plage de dates — `resolveEventWindow()` priorise maintenant `t."eventId" = weezeventEventId` (exact) quand le lien existe, repli par date scopé `t."eventId" IS NULL` sinon | 🟡 Corrigé non testé | 🔴 | Analyse & agrégation / Intégrations & ventes |
| [331-02](331_02_bulkcreateevents_ne_pose_jamais_event_weezeventeventid.md) | Prérequis de 330-02 : "Créer et lier tout" ne posait jamais `Event.weezeventEventId` — appelle maintenant `resolveWeezeventLink`. Script de backfill écrit et testé en dry-run (0 lien exploitable trouvé sur l'environnement `.env` actuel) | 🟡 Corrigé non testé | 🔴 | Intégrations & ventes / Analyse & agrégation |
| [332-02](332_02_getlatestsalesprices_seq_scan_sans_filtre_tenant_502.md) | `getLatestSalesPrices`/`getModalSalesPrices` (prix scopé espace, étape 3 du wizard) sans filtre `tenantId` sur le JOIN `WeezeventTransaction` — Seq Scan de toute la table (1,8M lignes, tous tenants), ~23s sur un gros tenant → 502 côté front (affiché à tort comme une erreur CORS). Fix vérifié empiriquement : 22,8s → 3,8-5,8s. **Nécessaire mais pas suffisant seul, voir 333-02** | 🟡 Corrigé non testé | 🔴 | Intégrations & ventes / Menu & recettes |
| [333-02](333_02_pricing_cascade_3_niveaux_sequentiels_toujours_trop_lent.md) | Suite de 332-02 : le cascade de repli à 3 niveaux (espace → non-attribué → global), enchaîné 3 fois (par productId, weezeventId, name), tournait séquentiellement — dépassait encore le timeout client 60s malgré 332-02. Parallélisé (`Promise.all`, même résultat/priorité). Vérifié empiriquement : cascade complet 13,7s (vs ~19s+ estimé avant) | 🟡 Corrigé non testé | 🔴 | Intégrations & ventes / Menu & recettes |
| [334-02](334_02_weezevent_products_catalogue_bloque_par_resolution_prix.md) | Proposition de conception (non implémentée) : `GET /weezevent/products?spaceId=...` bloque l'affichage du catalogue entier tant que le prix de CHAQUE produit n'est pas résolu — découpler catalogue (rapide) et résolution de prix (lente) pour un affichage progressif. Décision produit à valider avant tout travail | ⚪ Diagnostiqué | 🟡 | Intégrations & ventes / Menu & recettes |
| [335-02](335_02_resolvespacelocationids_mauvaise_table_niveau1_jamais_fonctionne.md) | Le "niveau 1" (ventes de CET espace) du cascade de prix n'a JAMAIS fonctionné : `resolveSpaceLocationScope` interrogeait `LocationSpaceMapping` (étape 1, contient un id d'INTÉGRATION) au lieu de `LocationShopMapping` (étape 2, vraies locations) — comparaison garantie sans résultat. Les niveaux 2/3 faisaient tout le travail en silence. Corrigé + vérifié empiriquement (257/346 résolus via de vraies ventes de l'espace) | 🟡 Corrigé non testé | 🔴 | Intégrations & ventes / Menu & recettes |
| [336-02](336_02_pricing_espace_supprime_niveaux_repli_autres_espaces.md) | Suppression des niveaux de repli 2/3 (ventes non attribuées à un espace / ventes globales d'un autre espace) — décision explicite Ulrich, une location non mappée à l'étape 2 n'est pas "probablement cet espace", c'est un point de vente exclu. Dépend de 335-02. Un produit jamais vendu dans l'espace affiche maintenant honnêtement "pas de prix" au lieu d'un prix emprunté ailleurs | 🟡 Corrigé non testé | 🟠 | Intégrations & ventes / Menu & recettes |
| [337-02](337_02_stepmapmenuitems_pagination_front_ne_reduit_pas_le_fetch.md) | Étape 3 lente (17-40s mesurés) : cascade de prix scopé-espace recalculé en raw JOIN à CHAQUE requête (3,1M lignes `WeezeventTransactionItem`). Nouvelle table `SalesPriceAgg` tenue à jour à l'écriture (sync/webhook/Digifood) au lieu d'être recalculée à la lecture — cascade 6-appels vérifié à 1,7s (~20-25x). Backfill complet (26 autres tenants) pas encore lancé | 🟡 Corrigé non testé | 🔴 | Intégrations & ventes |
| [338-02](338_02_stade_jean_bouin_agregation_vide_events_saison_vs_match.md) | RÉGRESSION du 2026-08-18 (commit `23cd32c9`, fix BUG-328/329/330-02) : le repli `eventId IS NULL` vide l'agrégation des tenants où Weezevent groupe la billetterie par SAISON (Stade Jean Bouin/PFC/SFP, 200k+ transactions, 0 ligne ; Aix Arena/AJ Auxerre aussi exposés). Fix : détection des "event-conteneurs" par span RÉEL des transactions (pas les dates déclarées, trompeuses) — vérifié 0→6224 transactions sur un match test | 🟡 Corrigé non testé en prod | 🔴 | Intégrations & ventes / Analyse & agrégation |
| [339-02](339_02_analyse_event_revenue_double_compte_fenetre_jour_entier.md) | Page Analyse (Stade Jean Bouin) : CA d'un event affiche d'abord la bonne valeur (48k) puis se corrige à tort sur 184k (= 48k + le CA du match du LENDEMAIN). Cause : `resolveEventSalesScope` fenêtre au jour calendaire entier (`eventEndDate+1j`) au lieu d'utiliser `eventEndTime`/`sessions` déjà en base (comme `resolveEventWindow` côté Data Integration). Fix (2026-08-19, branche `fix/analyse-page-load-perf`) : fenêtre `[minuit du jour de début — avancé à l'heure de fin d'un event voisin finissant ce jour-là, heure de fin réelle (`eventEndTime`/`showTime` via `combineDayAndLocalTime`)[`, repli jour entier si heure absente ; 4 tests unitaires | 🟢 Corrigé | 🔴 | Analyse & agrégation |
| [341-01](341_01_attendus_inventaire_sources_incorrectes.md) | Réunion Bertrand 19/08 : le badge « Expected » pre-event lisait le plan Stockup sauvegardé (« 1888 pc · 176,8 kg » sans rapport avec le stock), et le mode post n'affichait ni hints Packed/Loose ni le mot « Attendu ». Les calculs backend (pre : post-event précédent + Logistique ; post : pre-event + Logistique − ventes) étaient déjà bons — rebranchage frontend pur : `flattenExpectedUnits`, même agrégateur de badge dans les deux modes (unités réelles de la section), hints post via `postExpectedFields` (trunc, négatifs exclus des hints, chip total garde le signal), libellé « Doit rester » → « Attendu » | 🟡 Corrigé non déployé | 🟠 | Stock |
| [342-01](342_01_rearmement_packs_reference_et_resolution_conditionnement.md) | Réunion Bertrand 19/08, Réarmement/liste de courses : total de packs par groupe article manquant (« Blumberger 50+27 → 77 packs », somme des arrondis PAR LIGNE), référence d'achat (Supplier item du Market Price) absente, Coca 33cl en « 74 pièces » (référence = ingrédient homonyme SANS conditionnement alors que le menu item porte « pack de 24 » → continuation de porteur dans `computePackagingForQuantity`, règles BUG-299-01 intactes), viande tranchée « 405 packs de 1 kg » (conversion 0,02 jamais reçue — cause backend, fiche miroir BUG-131-01 : select ingrédients sans `purchaseUnitConversion`) | 🟡 Corrigé non déployé | 🟠 | Stock |
| [343-01](343_01_predicted_permission_dediee_details_calcul.md) | Réunion Bertrand 19/08 (suite 341-01) : chip « Besoin prédit » réservé admins + directeurs de site via permission dédiée `front.fb.preInventoryPredicted` (backend BUG-132-01, propagation catalogue automatique — Chef exécutif exclu), détail du calcul de l'attendu en infobulle (`buildExpectedCalcDetails`, termes dérivés : pre « post-event précédent + livraisons », post « pre-event + mouvements − vendu »), libellés « Attendu »/« Expected » → « Quantité attendue »/« Expected quantity » | 🟡 Corrigé non déployé | 🟡 | Stock / RBAC |
| [344-01](344_01_shopping_packs_latch_packedmode_et_ref_pool.md) | Réunion Bertrand 19/08 (14:46) : email fournisseur en pièces — même formateur que la table, cause = latch `stockPackedModes[itemKey]=false` seedé quand le conditionnement ne résolvait pas, PERSISTÉ (snapshot + plans) et plus levable (case « Empaqueté » retirée). Purge complète (décision JLH) : packaging résolu = paquets partout (table, email, print, « À déposer » étape 2), legacy ignoré à la lecture. + pool `marketPrices` manquant dans `marketPriceRefFor` (référence d'achat absente sur les lignes libres). Frites en Kg = trou de données (fiche Market Price à remplir), pas de code | 🟡 Corrigé non déployé | 🟠 | Stock |
| [345-01](345_01_catalogues_tronques_pagination_ingredients_marketprices.md) | Recette post-344-01 : « Tsingtao », « X1 »… en « Packaging not resolved » — motif ALPHABÉTIQUE. Cause : `getIngredients()` / `getMarketPrices()` sans params → page 1 seule (100 / 200 lignes, tri name asc), pools de résolution tronqués en silence. Même bug que BUG-054/105 (composants), même remède : boucle paginée (`fetchAllPaginated`, nouvel util testé) branchée sur useSpaceData (ingrédients) et inventory/loadMarketPrices. Appelants Builder/Logistic non touchés (latent, noté) | 🟡 Corrigé non déployé | 🟠 | Stock |
| [346-01](346_01_reco_post_event_400_movementunits_dto.md) | « Create Reconciliation » post-event → 400 `lines.0.property movementUnits should not exist` : le front (343-01) archive `movementUnits` par ligne mais le DTO backend ne le déclarait pas → rejet whitelist `forbidNonWhitelisted` (pattern `salesSource`/Q35). Bloque la création du snapshot post-event donc les attendus du pre-event suivant. Fix backend seul : champ optionnel nullable dans `PostEventReconciliationLineDto` (commit `2d9812f`), aucune migration (lignes en JSON). Reste : merge + déploiement Render | 🟡 Corrigé non déployé | 🔴 | Stock |
| [347-02](347_02_storageinventorysection_packaging_generique_repli_nom_tronque.md) | Inspecteur Inventaire (Builder) : conditionnement générique « Pack(s) » affiché au lieu du vrai libellé « is stored in » (Carton, Pipette...) — résolution client-side par NOM sur catalogue Market Price tronqué à la page 1 (même famille que BUG-345-01). Fix : résolution PAR ID côté backend (`getStorageInventory`), bornée aux articles réellement utilisés par l'élément inspecté, plus de fetch catalogue séparé côté front | 🟡 Corrigé non testé | 🟠 | Espaces & builder / Stock |
| [348-02](348_02_logisticbyitemview_pack_generique_ignore_packagingtype.md) | Écran Logistique : conditionnement générique « pack »/« Packed » affiché pour tous les articles (ex. « 32 Pc/pack » pour Twix, configuré « Carton » ; « N predicted packs » au lieu de « N Pipettes predicted » pour Chimichuri) à CINQ endroits — en-tête, lignes dépliées (quantité + besoin prédit) de l'onglet « Par article » (`LogisticByItemView.vue`) ET en-tête + besoin prédit de la carte article par PDV (`LogisticItemCard.vue`) — `item.packagingType` déjà résolu côté backend mais jamais lu par ces lignes précises. Balayage complet du module Logistique effectué | 🟡 Corrigé non testé | 🟠 | Stock |
| [349-01](349_01_event_predict_deeplink_event_passe_non_rejete.md) | Event Predict ouvert sur un évènement PASSÉ (ex. 14 juin affiché le 21 août) quand l'URL contient `?event=<id-passé>` — la présélection auto (`futureEvents[0]`) est saine, mais trois points d'entrée (`loadAll` deep-link, `applyDeepLinkFromRoute`, watcher `pendingPredictEventId` poussé par le clic barre d'AnalyseView) acceptaient un event id sans validation de date. Décision JLH : rejet du deep-link passé, fallback prochain futur (ou état vide) + toast warning, helper `isTargetableEventId` = même prédicat que le dropdown. Régression assumée : clic barre passée dans Analyse n'ouvre plus la timeline passée | 🟡 Corrigé non déployé | 🟡 | Analyse / Event Predict |
| [350-01](350_01_ca_variable_home_analyse_bascule_source.md) | Trois CA pour le même espace en moins d'une minute (Jean Bouin) : carte **2 926 565,31 €** → Analyse au chargement **2 926 565 €** → après catalogue **2 718 041 €** (−7,12 %), marge 100 %→82,5 %, 42→38 shops, tx/min 38,99→36,79. **Deux sujets distincts.** (1) Carte↔Analyse : le CA est identique **au centime**, seul le per-capita diffère (3,58 vs 6,04) — deux périmètres de billets (tous les events de l'espace vs `filteredEvents`) sous un libellé identique, pas un bug de formule. (2) Dans l'Analyse, `kpiRecords`/`chartRecords` **changeaient de source** en cours de chargement (repli shop-level `SpaceRevenueMinuteAgg` publié comme définitif, puis item-level `SpaceRevenueMinuteItemAgg`) : deux moteurs, formules volontairement divergentes (`reduction` déduite d'un côté, `status='V'` filtré de l'autre, `aggregation.service.ts:543-554`). Cause dominante candidate = **cap `MAX_EVENTS = 50`** de `useAnalyseItemRecords` (différé BUG-298-01) : au-delà, CA/shops/transactions à 0 sans signalement — 4 events/54 ≈ 7,4 % vs 7,12 % observé, **à confirmer** (`eventsWithRevenue` ≠ `filteredEvents.length`). Marge 100 % = **structurel** : la RPC force `menuItemId` à NULL → `costMap[undefined]` = 0. **Catalogue hors de cause** : tous les chemins de CA sont en LEFT JOIN depuis BUG-014/016, `SpaceMenuItem`/`MenuAssignment` n'apparaissent dans aucune requête de ventes. Correctif (décisions JLH) : cap **50→100** (différé 298-01 levé), **zéro valeur provisoire** — repli supprimé partout (KPI, chips header, graphes, donuts, tables, panneau txn/min, variations), `kpiSourceState` à 3 états (`empty` ≠ `loading`, sinon skeleton éternel sur batch KO), marge `null`→« — », périmètre du per-capita affiché des deux côtés | 🟡 Corrigé non testé | 🔴 | Analyse & agrégation |
| [353-01](353_01_analyse_depend_du_spacemenu.md) | L'Analyse dépendait du **SpaceMenu** : « Bud 33cl » affichait 60 unités sur 1 PdV, ses ventes comptées sous « Budweiser 45cl » ; simple ajout au SpaceMenu → **916 unités sur 14 PdV**, sans réimport. Le backend faisait déjà le bon calcul (`getEventTimelineBatch` joint `WeezeventProductMapping` → `MenuItem` ; aucune table SpaceMenu dans le SQL analytique) — c'est `resolveItem` (`analyseReconciliation.js:287-368`) qui l'écrasait : le `menuItemId` backend n'était accepté que s'il appartenait à l'assignation SpaceMenu du PdV, sinon `findBestMatch` par NOM au seuil 70 (prix omis) contre les seuls items du SpaceMenu — or les deux libellés partagent le suffixe « 26/27 (LMFC) ». Fix : l'identité article = le `menuItemId` backend, point ; suppression du match flou, de `assignment`/`assignmentItemsByShop`/`nameToMenuItemId` et du pool de candidats. Agrégations reclées sur `menuItemId` (le nom reste le libellé affiché), bucket timeline sur `weezeventProductId`. **Ventes non mappées conservées en « Non rattachés »** (décision JLH : les exclure coûterait 37,4 % des lignes / 5,16 M€ HT ailleurs). Non-régression : la même vente réconciliée avec et sans SpaceMenu doit donner un résultat identique | 🟡 Corrigé non déployé | 🔴 | Analyse & agrégation |
| [354-01](354_01_transactions_comptent_des_lignes.md) | Le compteur de transactions comptait des **LIGNES de ticket** : 13 925 affichés pour **5 721 tickets** réels (export : 14 138 lignes / 5 802 tickets), panier moyen **4,71 € au lieu de 11,46 €**, txn/min faux dans la même proportion. Deux volets. Backend (fiche api BUG-135-01) : deux écrivains contradictoires sur `SpaceRevenueMinuteAgg.transactionsCount`. Frontend : le KPI sommait le grain ARTICLE (`SpaceRevenueMinuteItemAgg`, non additif — un ticket de 3 articles distincts y pèse 3). Fix : transactions et txn/min lus depuis les **paniers** (`transaction-baskets`, une ligne par ticket) — le KPI et le donut publient enfin le même nombre ; cap events aligné 50 → 100 sur l'item-level, sinon CA sur 100 events et transactions sur 50. **Recalcul SQL de l'historique à appliquer à la main** (ne répare que 282 250 lignes sur 547 954 ; 109 events demandent une re-agrégation) | 🟡 Corrigé non déployé | 🔴 | Analyse & agrégation |
| [355-01](355_01_paniers_vides_espace_multi_integrations.md) | « Product category mix per transaction » à **0 transactions** / « No data for this breakdown » alors que toutes les autres cartes du même event affichaient leurs chiffres. Cause : l'espace a **deux** intégrations Weezevent mappées (7 espaces sur 31) et `resolveEventSalesScope` faisait un `findFirst` sans `orderBy` → filtre `t."integrationId" = <une seule>`, les ventes du 22/08 appartenant à l'autre. Le reste de la page tenait parce que `getEventTimelineBatch` ne déstructure même pas `integrationClause` (il lit la pré-agrégat, déjà scopée par `spaceId`). Fix : `findMany` + `= ANY(...)` (sûreté vérifiée en base : aucun event ne mélange deux intégrations). Corrige au passage un bug latent : lignes paniers sans `minuteLocal` → le curseur horaire daté (BUG-351-01) vidait les donuts sur un event franchissant minuit, et `timelineFilterSignature` ignorait `selectedEventIds` donc une plage périmée survivait au changement d'event | 🟡 Corrigé non déployé | 🔴 | Analyse & agrégation / Intégrations & ventes |
| [356-01](356_01_bandeau_non_mappees_analyse.md) | Lisibilité des ventes non mappées sur l'Analyse. Décision JLH 2026-08-24 (avec aller-retour tracé dans la fiche api BUG-137-01 : exclusion envisagée, implémentée quelques heures, puis écartée) : elles **restent comptées**. Correctifs : libellé du bucket sentinelle « Non rattachés » → **« Non mappées »** (+ « PdV non mappés »), et **indicateur dans le bandeau rouge** (icône ambre, texte au survol, clic → Data Integration ; v1 en bandeau dédié retirée sur retour client « ça prend de la place ») alimenté par le nouvel endpoint `GET /spaces/:id/analyse-unmapped` (`useAnalyseUnmapped`, cache par event, cap partagé avec l'item-level). Cause unique mesurée : produit importé mais jamais mappé à l'étape 3 du wizard (0 ligne orpheline d'import sur 786 882). Le bandeau ne change aucun chiffre | 🟡 Corrigé non déployé | 🟠 | Analyse & agrégation |
| [357-01](357_01_analyse_oom_backend_batch_77_events.md) | Analyse à **0 € partout** sur Stade Jean Bouin (77 events) pendant que Render OOM en boucle (« Ran out of memory, used over 2GB », crash à chaque ouverture de la page). Cause : les 3 endpoints batch (timeline, paniers, unmapped) recevaient les **77 fenêtres en une requête chacun, en parallèle** — matérialisation de centaines de milliers de lignes + JSON géant côté Node. Aggravé par le lot du 24/08 (cap paniers 50→100, endpoint unmapped ajouté). Fix : `_fetchBatchChunked` — paquets de 15 events, **séquentiels**, dans `space.api.js` ; caches/inflight inchangés. Mitigation infra recommandée : Render 2→4 GB. Données saines vérifiées en base (2,87 M€, 94 % mappées) — l'écran vide était un symptôme d'infra, pas de données | 🟡 Corrigé non déployé | 🔴 | Analyse & agrégation / Technique |
| [358-02](358_02_digifood_conteneur_site_cold_start_non_detecte.md) | Step 4 et page Analyse vides pour toute **nouvelle** intégration Digifood (Nantes-Rodez, 0 ligne malgré 4204 transactions/61 091,81 € réels). `resolveSeasonContainerEventIds` (BUG-338-02) détecte un conteneur uniquement par span observé > 2 jours — le conteneur "site" Digifood (`upsertSiteAsEvent`, permanent, jamais un match) n'a que quelques heures de span au 1er match synchronisé → pas détecté → traité à tort comme un lien exact protégé → exclu du repli. Fix : tout `SalesEvent` `metadata.provider === 'digifood'` reconnu conteneur immédiatement, sans attendre un 2ᵉ match | 🟢 Corrigé | 🔴 | Analyse & agrégation / Intégrations & ventes |
| [359-02](359_02_digifood_deconsigne_signe_ecrase_math_abs.md) | Import CSV Digifood : `Math.abs()` sur `total_ttc` écrasait le signe négatif que Digifood fournit pourtant correctement pour la déconsigne (remboursement gobelet) — 1443 lignes/4204 sur Nantes-Rodez comptées en + au lieu de −, CA gonflé de ~7779 €. Signe désormais dérivé du montant source (`price_pu`/`total_ttc`) en plus du flag `type` de l'order. Backfill fait par réimport du CSV (upsert idempotent, items recréés à chaque ré-ingestion) | 🟢 Corrigé | 🔴 | Intégrations & ventes |
| [360-02](360_02_aggregation_fenetre_doorsopening_tronque_ventes_avant_match.md) | Même après 358-02, seuls 17 183 €/61 091 € réels (28 %) apparaissaient : `resolveEventWindow` ancrait la fenêtre sur `doorsOpening − 2h`, excluant les ventes hospitalité/avant-match dès 13h58 pour des portes à 19h00 — un CA plausible mais faux, sans alerte visuelle. Remplacé par une règle métier : chaque jour capture sa journée calendaire locale complète (00h00→minuit suivant), le 1er jour ne démarre jamais à l'heure d'ouverture ; seul le dernier jour d'un event multi-jours se coupe à `eventEndTime` si l'activité déborde sur la nuit suivante | 🟢 Corrigé | 🟠 | Analyse & agrégation |
| [361-02](361_02_bulkcreateevents_conteneur_saison_cree_event_plusieurs_mois.md) | "Créer et lier tout" crée un `Event` DataFriday de 271 à 356 jours à partir d'un conteneur de saison/site Weezevent/Digifood au lieu d'aucun event — **9 déjà créés en base** (Big Five Org, SFP/Auxerre), **3 avec du CA déjà agrégé dessus** (jusqu'à 689 964,26 € comptés comme un seul "match"). `getStep4Context` pose désormais `isSeasonContainer` sur chaque `weezeventEvent` (réutilise `resolveSeasonContainerEventIds`), `bulkCreateEvents`/`unmappedCount` les excluent. **Les 9 events déjà corrompus ne sont pas encore nettoyés** | 🟢 Corrigé (code) | 🔴 | Intégrations & ventes / Analyse & agrégation |
| [362-02](362_02_bulkcreateevents_agregation_jamais_declenchee_automatiquement.md) | "Analyse vide dès que je fais une data integration" : "Créer et lier tout" et "Tout agréger" sont deux actions séparées, rien n'enchaîne la seconde après la première (et le déclenchement live post-webhook, BUG-109, ne s'applique pas à un import CSV). `bulkCreateEvents` appelle désormais `handleAggregateAll()` automatiquement après création/rattachement | 🟢 Corrigé | 🟠 | Intégrations & ventes / Analyse & agrégation |
| [363-02](363_02_resolveseasoncontainer_cold_start_span_declare_weezevent.md) | Le Mans FC (Big Five Org) : Analyse vide malgré 5802 transactions Weezevent réelles — même cold-start que 358-02 mais sur une vraie intégration billetterie ("LE MANS FC - SAISON 26/27", span observé ~5h car intégration tout juste branchée, sous le seuil de détection conteneur). Ajout d'un second signal : span DÉCLARÉ (`startDate`/`endDate`, 290,9 jours ici) en OU avec le span observé — suffit à détecter le conteneur sans attendre d'historique | 🟢 Corrigé | 🔴 | Analyse & agrégation |
| [365-02](365_02_cron_safety_net_ignore_integration_contamination_ecriture.md) | Cas pratique Stade Jean Bouin (PFC + SFP, 2 intégrations Weezevent sur le même space) : "step 4 fausse les calculs, sur Analyse l'un s'affiche et l'autre non". `triggerLiveAggregationSafetyNet` (cron 5 min, BUG-109) regroupait les events "en direct" par space SEUL, sans `integrationId` — sans lui, l'agrégation peut taguer les transactions d'une intégration sous l'event de l'autre (fenêtres qui se recoupent le même jour), contamination à l'ÉCRITURE que la protection en lecture (BUG-146-01, filtre par tag exact) ne peut pas corriger. Fix : résout l'intégration réelle de chaque event (`weezeventEventId → SalesEvent.integrationId`), regroupe les jobs par (space, intégration) au lieu de (space) seul | 🟢 Corrigé | 🔴 | Analyse & agrégation / Live events |
| [366-01](366_01_eventpredict_timeline_minutelocal_perdu_pas_de_date.md) | EventPredict (mode prédiction) : inputs de plage « 00:00 / 23:59 » sans date (Analyse affiche « 22/08 13:58 ») et après-minuit trié en TÊTE de courbe (axe 00:00 → 01:03 puis 21:09 → 23:45). Le mécanisme daté de BUG-351-01 (`minuteLocal`) ne survivait pas au pipeline de prédiction : perdu en 4 endroits de `usePredictiveTimeline.js` (mapping REST — qui cassait aussi `minutesSinceShow` : vente 00:30 pour coup d'envoi 21:00 lue −1230 min —, branche locale, court-circuit mock, agrégation à clé heure-murale qui fusionnait deux jours). Fix : propagation `minuteLocal` bout en bout + `datedKeyForEvent` ancré sur la VRAIE date de l'event prédit (affichage « 07/09 21:00 ») + fenêtre datée dans `computeWindowRatios`. Chart et backend intacts | 🟡 Corrigé non déployé | 🟠 | Event Predict / Timeline |
| [366-02](366_02_demapper_detachait_event_du_space_au_lieu_du_lien.md) | "Démapper" (step 4) faisait `spaceId → null` au lieu de délier uniquement `weezeventEventId` — l'event disparaissait de la liste du space, impossible à retrouver pour le re-mapper. Fix en 3 volets : `resolveWeezeventLink(id, null)` à la place de `updateEvent({spaceId:null})` (ne touche jamais `spaceId`) ; purge des agrégats périmés sur les DEUX tables (`SpaceRevenueMinuteAgg`/`ItemAgg`, la seconde jamais nettoyée avant) ; synchronisation du miroir `SalesEvent.metadata.dfEventId` (sinon le WeezeventEvent restait invisible pour "Créer et lier tout" à jamais) ; et détection d'un event non lié existant à la même date avant `createEvent` pour éviter un doublon au re-mapping | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [367-02](367_02_statut_agrege_contredit_datapoints_apres_demapper.md) | "J'ai cliqué sur Démapper, visuellement rien ne s'est passé [...] alors ça sert à quoi au juste ?" : le badge "Agrégé" restait affiché après purge des data points (statut calculé depuis le dernier `AggregationJobLog` en historique, jamais recroisé avec les data points ACTUELS) — contradiction "Agrégé" + "—". Fix : un job "completed" avec 0 data point est reclassé "pending" ; le bouton "Démapper" ne s'affiche plus une fois déjà délié (plus rien à démapper) | 🟢 Corrigé | 🟡 | Intégrations & ventes |
| [368-02](368_02_event_integrationid_mode_robuste_remplace_conteneur_saison.md) | Nouveau champ `Event.integrationId`, mode `integration-range` (prioritaire, sous exact) : matche directement `t.integrationId` + fenêtre calendaire, **jamais** `t.eventId` — élimine toute la détection de conteneur de saison (338/358/361/363/365-02) pour les events qui l'utilisent. Coexiste avec le mécanisme legacy BUG-146-01 (conteneur de saison, backfillé automatiquement vers le nouveau mode). Corrige aussi le trou de couverture multi-intégrations (`unregisteredDates`). Migration appliquée et backfillée en base le 2026-08-25 | 🟢 Corrigé | 🟠 | Analyse & agrégation / Intégrations & ventes |
| [369-02](369_02_badge_integration_manuel_step4.md) | Step 4 : aucun repère fiable pour distinguer un event PFC d'un event SFP sur un space partagé (seul le nom saisi à la main, convention non garantie), et le menu "Mapper à un événement existant" proposait tous les events du space sans filtre (risque de rattacher par erreur un event de l'autre club). Fix : badge du nom réel de l'intégration (`Integration.name`, via `include` sur `Event.integration`) affiché à côté du nom ; menu de mapping filtré aux events non-taggués ou déjà de l'intégration courante ; reclassement manuel via un vrai bouton "Changer" + dialog dédié (`ChangeEventIntegrationDialog`, pattern `<select>`+`v-dialog` déjà éprouvé), liste des intégrations via un nouvel endpoint `GET /spaces/:id/integrations` mis en cache 15 min côté front — une 1ʳᵉ tentative en `v-menu` inline sur le badge avait été abandonnée (clic erratique non reproductible) | 🟢 Corrigé | 🟡 | Intégrations & ventes |
| [370-02](370_02_job_integrationid_incompatible_avec_integration_range.md) | Résultats d'agrégation incohérents selon le wizard ouvert au clic ("souvent marche, souvent ne marche pas") : en mode `integration-range`, le filtre `integrationId` du JOB (intégration du wizard courant, `this.location.id`) restait ANDé avec celui de l'event — insatisfiable dès qu'ils diffèrent (liste "Couvertes" mixte PFC/SFP, "Relancer" cliqué sur la ligne de l'autre club) → 0 résultat silencieux. Fix : filtre job-level ignoré quand le mode est `integration-range` (le window porte déjà la seule intégration qui compte, celle de l'event) | 🟢 Corrigé | 🔴 | Analyse & agrégation |
| [371-02](371_02_frontiere_voisin_meme_jour_deux_integrations.md) | SFP-Cardiff restait "Non agrégé" malgré des runs propres (sans erreur) : `resolveEventTransactionWindow` (règle de frontière fiche 147-01, partagée écriture/lecture) tronquait à tort le début de sa fenêtre à l'heure de fin de PFC-Le Havre (même jour, Jean Bouin) — jour de fin du voisin == jour de début trivialement vrai pour deux events bornés au même jour, sans distinguer "deux clubs déjà séparés par leur `integrationId`" (aucun besoin de découpage temporel) de "données non disambiguïsées" (BUG-339-02, où le découpage reste nécessaire). Fenêtre réduite à 30 min au lieu de la journée complète → 0 ligne écrite. Fix : la règle de frontière ne s'applique plus entre deux events ayant chacun un `integrationId` différent | 🟢 Corrigé | 🔴 | Analyse & agrégation |
| [372-02](372_02_resolveseasoncontainer_scope_job_integrationid.md) | SFP-Cardiff restait "Non agrégé" MÊME après le fix 371-02 et un redémarrage complet — trouvé en inspectant le job BullMQ dans Redis : `integrationId: PFC` alors que l'event traité est SFP (wizard PFC ouvert au clic). `resolveSeasonContainerEventIds`, encore scopée par cet `integrationId` du job, ne voyait pas le conteneur de SFP → l'event basculait à tort en mode `exact` avec `t.eventId = <conteneur SFP> AND t.integrationId = PFC`, combinaison impossible à satisfaire. Fix : détection de conteneur scopée uniquement par `tenantId`, plus par intégration — propriété intrinsèque des transactions, indépendante de qui lance le job | 🟢 Corrigé | 🔴 | Analyse & agrégation |
| [373-02](373_02_step4_fetch_events_tenant_wide.md) | Step 4 du wizard rapatriait TOUS les events du tenant (611, 4 requêtes paginées) via le cache Vuex tenant-wide `events/fetchEvents`, puis filtrait côté client sur `spaceId` — alors que `GET /events` accepte déjà ce filtre côté backend. Fix : nouvelle fonction `fetchSpaceEvents(spaceId)` dans `useTimelineProcessing.js`, requête scopée directement | 🟢 Corrigé | 🟡 | Intégrations & ventes |
| [374-02](374_02_progression_vide_event_unique_lourd.md) | "Agréger" sur un event volumineux (SFP-Cardiff, 27 s réelles) restait bloqué à "Initialisation..." 0% tout du long puis sautait à 100% — `getJobProgress` calculait le % sur `transactionsProcessed` (compteur incrémenté une fois par EVENT ENTIER), aucune granularité intra-event. Fix : 3 paliers intermédiaires posés dans `metadata.currentEventStep` après chaque grosse étape SQL d'un event, combinés par `getJobProgress` sans changer le sens de `transactionsProcessed` | 🟢 Corrigé | 🟡 | Analyse & agrégation / Intégrations & ventes |
| [375-02](375_02_tout_agreger_echecs_individuels_invisibles.md) | "Tout agréger" : un event en échec individuel (catch par event, jamais loggé) n'empêchait pas le job de finir `completed` — sur un lot de 77 events, un échec isolé passait totalement inaperçu, même chose en pire pour "Agréger" sur un event UNIQUE (le job restait `completed` malgré l'échec de son seul event). Fix : échecs résumés dans `error`/`metadata.errorCount`, loggés explicitement, front affiche un message distinct dès que `errorCount > 0` | 🟢 Corrigé | 🟠 | Analyse & agrégation |
| [376-02](376_02_purge_ne_nettoie_pas_residu_autre_integration.md) | PFC-Dijon (fem) affichait 985 points = 869 lignes résiduelles taguées SFP (résidu de l'ancien pipeline, jamais nettoyé) + 116 lignes fraîches taguées PFC. La purge avant réagrégation, scopée par intégration (BUG-317-02, pensée pour un event légitimement partagé), ne supprimait jamais les lignes taguées avec une AUTRE intégration — alors qu'un event en mode `integration-range` (BUG-368-02) lui appartient désormais exclusivement, rendant tout résidu d'une autre intégration forcément périmé. Fix : purge totale (sans filtre `integrationId`) en mode `integration-range` ; les modes legacy gardent l'ancien scoping | 🟢 Corrigé | 🔴 | Analyse & agrégation |
| [358-01](358_01_txmin_deux_formules_selon_panneau.md) | Carte KPI « TX/MIN » : **deux formules selon l'état du panneau Shop Performance** — 11,76/min carte fermée (transactions ÷ durées nominales, repli 180 min/event) qui saute à 26,94/min au clic (override = Σ des taux par PdV sur minutes actives réelles), et retombe à la fermeture. Aggravants : garde `o > 0` qui retombait silencieusement sur l'autre formule pour un override 0, et `sourceState` paniers publiant `'ready'` dès le premier record (Σ partielle qui bouge, contraire à BUG-350-01). Décision JLH 24/08 : **une seule formule, la Σ des taux moyens par PdV en permanence**, dérivée des paniers filtrés (`sumShopTransactionRates`), stable au clic ; sous-texte de carte explicitant la formule ; `'ready'` seulement quand tous les events scopés sont tentés | 🟡 Corrigé non déployé | 🟠 | Analyse & agrégation |
| [359-01](359_01_analyse_timeline_detail_espace_precedent.md) | Changement d'espace : le détail timeline (clic barre) restait titré avec le **match de l'espace précédent** — le watcher d'auto-ouverture (`immediate: true`) tirait au remontage AVANT `loadSpace`, résolvait `selectedEventIds` (jamais purgés, cf. 360-01) dans le pool d'events de l'ANCIEN espace et ouvrait la timeline avec son nom/date pendant que le fetch partait avec le nouveau spaceId ; rien n'appelait `closeTimeline()` au changement d'espace (route Live keepAlive incluse). Fix : garde d'alignement `store.spaceId === route.spaceId` dans le watcher + `closeTimeline()` dans le watcher de route (branche instance survivante) | 🟡 Corrigé non testé | 🟠 | Analyse & agrégation |
| [360-01](360_01_analyse_kpis_vides_filtres_espace_precedent.md) | Changement d'espace : **0 € partout, aucun KPI, aucune vente, définitif — hard refresh requis**. `state.filters` (dont `selectedEventIds`) survivait au changement d'espace : `CLEAR_SPACE_KEYED_CACHES` ne touchait pas les filtres, `resetFilters` n'existe que sur Live, `filteredEvents` intersectait les ids de l'ancien espace avec les events du nouveau → ∅ → `kpiRecords` ∅ ; `pruneFiltersToOptions` sans entrée `selectedEventIds` ne rattrapait pas. Fix : `CLEAR_SPACE_KEYED_CACHES` réinitialise aussi `filters = DEFAULT_FILTERS()` (sémantique hard-refresh ; deep-link `?config=` rejoué après `loadSpace`, inchangé) | 🟡 Corrigé non testé | 🔴 | Analyse & agrégation |
| [361-01](361_01_analyse_lenteur_chunks_sequentiels.md) | Page Analyse nettement plus lente depuis le 24/08 : le correctif anti-OOM BUG-357-01 envoyait les paquets batch **strictement en séquentiel** (⌈N/15⌉ allers-retours à la file × 3 endpoints — sur-correction : l'OOM venait de requêtes de 77 events, pas de 2 paquets de 15 en vol). Fix : `_fetchBatchChunked` en concurrence bornée `_BATCH_CONCURRENCY = 2` par endpoint, taille de paquet inchangée — borne mémoire 2×15 events, wall-clock ≈ parallèle. Repli sûr : concurrence 1 = comportement 357-01 exact | 🟡 Corrigé non testé | 🟠 | Analyse & agrégation / Performance |
| [362-01](362_01_chartjs_update_canvas_detache_ownerdocument_null.md) | Crash runtime « Cannot read properties of null (reading 'ownerDocument') » : vue-chartjs relance `chart.update()` sur mutation des données réactives même quand le canvas n'est plus dans le DOM (vue keep-alive désactivée, démontage au changement d'espace) — Chart.js `bindResponsiveEvents → detached → _resize → getComputedStyle(parent null)`. Déclencheur aggravé par le reset des filtres de 360-01 (toutes les données de charts mutent d'un coup). Fix : garde dans `registerChartJs` — `update()` no-op si `canvas.isConnected === false` ; au ré-attachement, le handler « attached » de Chart.js redessine avec les données déjà à jour | 🟡 Corrigé non testé | 🟠 | Analyse & agrégation / Transverse |
| [363-01](363_01_analyse_chargement_progressif_jean_bouin.md) | **Analyse figée ~110 s sur les gros espaces** (Jean Bouin, 77 events) : les fonctions batch (`space.api.js`) résolvaient UNE promesse pour le lot entier → rien à l'écran avant le dernier paquet. Fix : résolution PAR PAQUET (promesse dédiée par event + `onEvent`), tri récents-d'abord, patch du cache par event dans `useAnalyseItemRecords`/`useTransactionBaskets`, bandeau « Chargement des évènements : x/N » ; `sourceState` item-level durci ('ready' seulement quand TOUS les events scopés sont tentés — sinon les KPI publieraient des sommes partielles, interdit BUG-350-01). + Volet Lighthouse : reflow forcé 753 ms WorkspaceAppHeader (lecture scrollTop → rAF), shimmer donuts composité (`transform` au lieu de `background-position`), CLS légende réservée. Moitié backend : cache Redis par event, fiche backend 143-01 | 🟡 Corrigé non testé | 🔴 | Analyse & agrégation / Performance |
| [364-01](364_01_analyse_payload_memoire_concurrence.md) | **Analyse Jean Bouin : ~164 Mo téléchargés au montage, 1,9 Go de mémoire navigateur** (HAR + Performance monitor 24/08). La page transporte le grain minute×shop×produit de 77 events (~2 Mo/event timeline + ~1 Mo/event paniers) alors qu'AUCUN consommateur du montage ne lit la minute (11 consommateurs timeline recensés) ; 5 points de rétention simultanés (LRU space.api, caches préprocessés ×2 non bornés, copies réconciliées, `useShopPerformance` qui RE-télécharge les 2 endpoints) ; purge seulement au changement d'espace, jamais au démontage ; préprocess 15→36 clés dont ~21 mortes ; + régression 363-01 (re-map complet de l'accumulé à chaque paquet). Correctifs planifiés (plan 25/08) : file FIFO globale concurrence 2, fix régression, vraie barre de progression x/N, `useShopPerformance` branché sur les caches existants, purge au démontage, projection ~15 clés, et endpoints de montage sans minute (~10-20 Ko/event). Versant serveur : fiche backend 144-01 ; CA par event → `Event.revenue` (décision Bertrand 25/08, backend 146-01) | 🟡 Corrigé non testé (25/08 : tout livré, timeline de montage en summary ; paniers summary différés — TX/MIN/peak exigent la minute) | 🔴 | Analyse & agrégation / Performance |

**317-02 à 321-02 ajoutés le 2026-08-14** (signalement utilisateur KOUAME Ulrich : "quand je choisis
le même space pour 2 data-intégrations, j'ai l'impression que les données de l'une écrasent celles
de l'autre, surtout au step 4, events et transactions" + "plusieurs duplications au niveau des shops
dans Spaces Menu"). Investigation en 2 temps : un premier agent de diagnostic a confirmé les 2
symptômes rapportés dans le code réel (317/318 pour l'écrasement agrégats, 320 pour la duplication
shops), avec vérification manuelle ligne par ligne de chaque affirmation avant rédaction des fiches.
En creusant la chaîne d'appel complète (frontend → composables → routes → service) pour rédiger des
fiches actionnables, deux causes supplémentaires sont apparues : 319 (réhydratation étape 4 qui
pioche la mauvaise intégration côté lecture, distinct du problème d'écriture 317/318) et 321 (le
symétrique inverse — une intégration servant 2 espaces n'est pas isolée non plus, risque théorique
confirmé par le code mais non observé en production). Racine commune à 317/318 : les tables
`SpaceRevenueMinuteAgg`/`SpaceRevenueMinuteItemAgg`/`SpaceProductRevenueDailyAgg` n'ont aucune
colonne `integrationId` — un fix propre nécessite une migration de schéma, pas seulement un patch de
requête. Ces 5 fiches sont un pré-requis pour que "plusieurs intégrations sur un même space" (cas
d'usage déjà permis par le modèle de données `LocationSpaceMapping`) fonctionne réellement de bout
en bout.

**317-02 à 320-02 corrigés en code le 2026-08-14** sur la branche `fix/multi-integration-same-space`
(demande explicite utilisateur : "crée une nouvelle branche pour fixer tout ça", 321-02 explicitement
laissé de côté — "théorique, on laisse pour l'instant"). Migration
`20260814170000_add_integrationid_space_revenue_agg` (colonne `integrationId` + backfill, sans
toucher aux `@@unique` existants) ; `executeProcessEvents`/`executeSynchronize` scopent désormais
leurs `deleteMany` par intégration ; `getWeezeventEventsForSpace` accepte `integrationId` de bout en
bout (route + frontend) ; `getSpaceShops` dédoublonne via sous-requêtes scalaires au lieu d'un `LEFT
JOIN` non agrégé. Suite `aggregation.service.spec.ts` verte (2 tests ajoutés), `tsc --noEmit` propre.
Non testé en environnement réel, non déployé.

**328-02 à 330-02 ajoutés le 2026-08-14**, même fil de discussion que 317-320 (KOUAME Ulrich, après
explication du fonctionnement de l'agrégation par event) : "c'est un vrai problème" sur le
chevauchement de fenêtres entre deux events du même space. 328 documente le symptôme confirmé
(double comptage des transactions sur les dates communes). 329 documente l'absence totale de champ
"heure de début" dans toute l'app (`type="date"` partout, `eventEndTime` jamais fusionné à
`eventEndDate`) — bloquant pour le besoin métier explicite d'un buffer de 1-2h avant l'heure
d'ouverture réelle. 330 documente la cause racine commune : `WeezeventTransaction.eventId`, une FK
exacte posée automatiquement à l'ingestion (Weezevent ET Digifood, indexée en base), existe déjà et
n'est jamais utilisée par l'agrégation — qui devine par comparaison de dates à la place. Fix
structurel proposé : prioriser `eventId` (élimine le chevauchement pour les transactions liées),
repli par date amélioré (329) uniquement pour les transactions non liées. Trois fiches
`⚪ Diagnostiqué` — pas encore corrigées, impact business élevé (chiffres de revenus), nécessitent
validation Bertrand sur plusieurs points produit avant implémentation (buffer configurable par
tenant/space/event ? sémantique du "site as event" Digifood ?).

**329-02 corrigée le même jour** suite à la relance d'Ulrich ("tu es sûr que sur les events qu'on
crée sur DataFriday il y a pas opendoor ou un truc de ce genre ?") : le diagnostic initial
("aucune heure de début n'existe nulle part") était faux. `Event.sessions[0].doorsOpening` existe
réellement, et `StaffingService.getEventContext()` (`staffing.service.ts:60-178`) le combine déjà
à la date via `combineDayAndLocalTime` (timezone-aware, DST géré) avec un buffer par défaut
`DEFAULT_OFFSET_OPEN_MINUTES = -120` / `DEFAULT_OFFSET_CLOSE_MINUTES = +120` — exactement le besoin
métier décrit. Le fix se réduit donc à réutiliser ce mécanisme dans l'agrégation plutôt qu'à en
concevoir un nouveau — périmètre revu à la baisse, moins de questions ouvertes pour Bertrand.
Repli sans `doorsOpening` également précisé : dérivé des transactions réellement observées
(`MIN`/`MAX` sur un scan large + buffer 1-2h) plutôt qu'un repli sur le jour calendaire entier.

**331-02 ajoutée le même jour**, en réponse à une seconde question d'Ulrich ("l'event de vérité est
celui créé dans DataFriday, pas ceux venant de Weezevent/Digifood — comment on gère les données
manquantes ?"). Le principe était déjà le bon dans 330-02 (`SalesEvent` = pont, jamais source de
données), mais en vérifiant COMMENT ce pont (`Event.weezeventEventId`) est réellement posé en
pratique, découverte d'un bug distinct et bloquant : le flux "Créer et lier tout" (le plus utilisé)
n'utilise pas le mécanisme typé (`PATCH :id/weezevent-link`) mais écrit dans
`SalesEvent.metadata.dfEventId` — un champ non déclaré, jamais relu par l'API. 330-02 mis à jour
pour dépendre explicitement de 331-02.

**328-02 à 331-02 corrigés en code le 2026-08-14** sur la branche
`fix/event-aggregation-window-precision` (demande explicite : "procède à l'implémentation des
fixes"). `combineDayAndLocalTime`/`parseEventSessions`/`DEFAULT_EVENT_DURATION_HOURS` extraits de
`staffing.service.ts` vers `backend/src/shared/utils/event-window.util.ts` (comportement Staffing
inchangé, duplication supprimée). Nouvelle méthode `AggregationService.resolveEventWindow()` :
lien exact `eventId` (330) → `doorsOpen`±offsets Staffing (329) → repli dérivé des transactions non
liées MIN/MAX ± 90 min (329) → repli historique jour calendaire — chaque mode de repli filtre
`t."eventId" IS NULL` (328). `bulkCreateEvents` pose désormais `Event.weezeventEventId` via
`resolveWeezeventLink` (331) ; script de backfill écrit et testé en dry-run
(`scripts/backfill-event-weezevent-link.ts`, 0 lien exploitable sur l'environnement `.env` actuel).
5 tests ajoutés dans `aggregation.service.spec.ts` (describe "résolution de fenêtre transaction →
event"), suite complète verte (`aggregation`, `staffing`, `spaces.controller`), `tsc --noEmit`
propre. **Pas de resync lancé** : les events déjà traités gardent leurs anciens agrégats tant qu'un
nouveau "Traiter"/"Synchroniser" n'est pas déclenché. Non testé en environnement réel, non déployé.
Un balayage de tests plus large (aggregation/staffing/events/spaces) a révélé 2 échecs
préexistants sans rapport avec ce fix (confirmés reproductibles en isolation, fichiers jamais
touchés cette session) : `events.service.spec.ts` (mock `spaceRevenueMinuteAgg` manquant) et
`spaces.service.spec.ts` (`getRevenueSummaries`/`findAll`, déjà signalé lors de BUG-317-02).

BUG-277-01 ajouté et corrigé le 2026-08-02 (signalement utilisateur avec capture, thème sombre) :
le drawer « Event detail » de la page Event Predict s'affichait corps clair (`#f9fafb`) avec
valeurs de champs quasi blanches — illisible. Triple défaut lié à la téléportation dans `<body>`
via `EventDrawerShell` : `:is-dark` jamais passé au shell, texte forcé en `on-surface` sombre par
les `themeClasses` Vuetify, tokens `--fb-*` retombant sur leurs fallbacks clairs hors de
`.event-predict-overlay` (même famille que BUG-198/237-02). Audit de généralisation : les 9
autres consommateurs du shell passent tous `:is-dark` avec leur propre bloc `--dark` — cas isolé.
Corrigé dans `EventDetailsEditor.vue` seul (pattern `EventPredictSourcesDrawer`) + commentaire
obsolète « drawer NON téléporté » remplacé ; non buildé/testé (pas de `pnpm dev` dans la session).

BUG-278 à 283 ajoutés et corrigés le 2026-08-02 (même session) : **audit dark mode complet de
l'application** demandé après un 2ᵉ signalement (pagination blanche, tableau Analyse). Balayage
statique croisé avec les 16 fiches dark existantes pour ne re-signaler ni les exclusions
volontaires ni les 🟡 déjà en code : ~25 fichiers restants répartis en 6 vagues — pagination
Analyse (278), delete dialogs à prop `isDark` fantôme (279), charts Chart.js « phase 2 » de
BUG-196 (280), inspecteur Builder2 annoncé « vague dédiée » par BUG-247-01 (281), chrome global
et téléportés (282), étapes Restock reportées par BUG-197 (283). Deux dettes déclarées de
longue date soldées (196 phase 2, 197 restock/shopping), 3 faux positifs d'audit documentés
(`EventPredictRowActions`, `MapEventToExistingDialog`, `LiveSaleSimulatorWidget`),
`MarketPriceFilters` (verrouillage clair volontaire commenté) laissé intact → question #49 de
`QUESTIONS_A_BERTRAND.md`. Tout en overrides `.dark`/`--dark`/tokens (clair inchangé par
construction) ; aucun build ni contrôle navigateur dans la session — contrôle visuel JLH requis
avant tout passage 🟢.

BUG-284-01 ajouté et corrigé le 2026-08-03 (+ durcissement `!important` de BUG-278, récidive
constatée à l'écran — source du fond blanc établie comme extérieure au repo, procédure DevTools
documentée dans la fiche) : freeze momentané de la page Analyse au clic sur un segment de
graph/camembert et au changement de configuration. Quick wins uniquement, sur la carte
suivante : clic → dispatch immédiat → ~20 passes synchrones sur les records dans 7+ composants
+ ré-animation Chart.js 1000 ms. Livré : toggle coalescé 150 ms par clé (read-modify-write sur
l'état en attente, annulé par tout write direct), cache item-level `shallowRef` + `Object.freeze`
(fin du surcoût Proxy, multiplicateur « vieux PC »), contexte de réconciliation en singleton
(`effectScope` détaché — mémos 1× au lieu de 3×), animations 200 ms (choix JLH), boucles
`itemTotals` fusionnées (résultat identique au bit près). Pas de loader (choix JLH). Le chantier
structurel d'index partagés reste porté par la fiche ⚪ 179 (mise à jour), à déclencher si le
freeze persiste sur les machines cibles.

BUG-285-01 ajouté et corrigé le 2026-08-03 (même session) : la page Analyse consommait 2-3 Go
de RAM Chrome. Audit croisé (2 explorations) : dataset minute×shop×article en 5-6 copies
simultanées, 3 couches de caches sans aucune éviction (API session, accumulateurs Vuex par clé,
caches composables), `<keep-alive>` illimité sur 33 routes, re-préprocessing idempotent du
chart timeline. Corrigé : LRU 30 + purge par espace sur les caches API, purge des accumulateurs
au changement d'espace (mutation `CLEAR_SPACE_KEYED_CACHES` + `clearCache()` composables),
gels/`shallowRef` sur les 3 chemins jumeaux oubliés de BUG-284, `<keep-alive :max="6">`
(décisions JLH), ré-agrégation sautée quand l'entrée est déjà agrégée. Volet fluidité (maquette
artefact validée) : signal partagé `filtersRecomputing`, surlignage optimiste de la part
cliquée dans les donuts, nouveau `AnalyseSkeletonVeil` (voile shimmer, dark inclus) sur
donuts/tableau/rail/distribution — la fenêtre de coalescing 150 ms de BUG-284 laisse le
navigateur peindre le feedback avant le burst de recalculs. Conservés sciemment : chaîne
`loadTimelineForEvent` (couverte par tests, fiche 178 mise à jour), `picture` des vignettes
(consommé, hypothèse « toujours nul » de l'audit réfutée). Mesure mémoire réelle à faire par
JLH après build.

**235 bugs au total**, 235 ajouté et corrigé le 2026-07-28 suite à un signalement utilisateur : import
complet du tenant Auxerre (gros volume) échouant systématiquement avec "délai maximal dépassé" sur
une instance nouvellement créée, alors que le job backend continuait de tourner sans jamais être
annulé. Cause : les timeouts de polling ajoutés par BUG-206/218 mesuraient une **durée totale**
écoulée plutôt qu'une inactivité — un tenant volumineux peut légitimement dépasser 10 min. Corrigé
dans les 3 pollers concernés (`SyncJobFloatingWidget.vue`, `SyncProgressDialog.vue`,
`StepProcessTimeline.vue`) en remplaçant le seuil de durée totale par un seuil d'**inactivité** :
l'horloge d'abandon est repoussée à chaque progrès constaté (`totalCollected`/`totalInserted`/
`processedChunks`, ou `current`/`percentage` pour le job d'agrégation), et le job n'est déclaré
bloqué qu'après 10 min **sans aucun progrès**. Combiné à un fix backend (BUG-112, même session :
parallélisation de la bissection de collecte Weezevent, jusque-là strictement séquentielle).
| [235](235_conformite_charte_typographique_tokens.md) | Conformité charte typo : tokens CSS (`--fs-*`/`--fw-*`), checker `pnpm lint:typo`, nettoyage police Roboto, migration progressive par domaine (role/user/market-prices/events/spaces/analyse faits ; menu-fb/views/EventPredictView restants) | 🟡 En cours | 🟢 | Transverse / Charte graphique |
| [236](236_hr_crypto_randomuuid_contexte_non_securise.md) | HR : `crypto.randomUUID is not a function` sur IP LAN/HTTP (contexte non sécurisé) → création impossible ; fix helper `newId()` à repli. + **reconstruction propre de HR (Suppliers + Postes staff)** (CRUD liste/drawer/delete-dialog au pattern SuppliersListView, rendu dans le chrome DashboardView, routes `/hr` & `/hr/positions`) + fix double-header `/hr` + suppression prototype HR mort | 🟡 Corrigé non déployé | 🟠 | RH / Staffing |
| [235](235_builder2_labels_pdv_lisibilite_tri_alphabetique.md) | Builder v2 — libellés PDV illisibles (ton sur ton) + liste du panneau droit non triée | 🟡 Corrigé non déployé | 🟡 | Espaces & builder |
| [242-03](242_03_eventslistview_colonne_date_debut.md) | EventsListView — **amélioration** : ajout de la colonne « Date de début » (`eventStartDate`) juste après le Nom (template de cellule déjà présent, en-tête manquant) | 🟡 Corrigé non déployé | 🟡 | Événements |
| [243-03](243_03_settings_menu_edit_space_builder3d.md) | Settings — **amélioration** : menu déroulant « Edit space » (en tête), liste dynamique des espaces + barre de recherche + états vides, clic → builder 3D `/spaces/:id/builder2` | 🟡 Corrigé non déployé | 🟡 | Espaces & builder |
| [235](235_pre_event_reconciliation_lignes_orphelines_sans_nom.md) | Réconciliation pré-événement : lignes « — » = comptages orphelins pointant vers des articles/PdV supprimés (ids cuid absents après ré-import catalogue UUID) ; exclusion des lignes + nettoyage SQL des `InventoryCount` orphelins (fiche 234 sur `feat/postEventInventory`, renumérotée 235 au merge — collision avec la 234 Live de `develop`, même mécanique que le 2026-07-22) | 🟡 Corrigé non déployé | 🟠 | Stock |
| [236](236_reconciliation_section_inaccessible_mobile.md) | Inventaire : la section Réconciliation n'était rendue que dans la colonne gauche desktop (`showLeftFilters` exige `!isMobile`) — aucun accès mobile aux documents ; corrigé en montant la section dans `InventoryFilterDrawer` | 🟡 Corrigé non déployé | 🟡 | Stock |
| [237](237_post_event_prerempli_par_comptage_pre_event.md) | Post-event Inventory s'ouvre **pré-rempli et « 100 % compté »** avec les saisies du Pre-event du même match (`InventoryCount` keyé sans la phase, même `eventId` depuis §12.4) : garde « comptage incomplet » jamais déclenchée, un clic archive un snapshot post-event = comptage d'avant-match, qui devient la baseline du cycle suivant | 🟡 Corrigé non déployé | 🟠 | Stock |
| [238](238_reco_post_event_ventes_non_jointes_avalees.md) | Réconciliation post-event : ventes dont le PdV (nom normalisé) ou l'article ne joint pas le référentiel compté **écartées en silence** → `Qty Sold` 0, `Missing`/`Miss €` gonflés du volume vendu, aucun signal (le chemin pre-event, lui, remonte `unjoinedItemKeys`) | 🟡 Corrigé non déployé | 🟠 | Stock |
| [239](239_pre_event_taille_de_paquet_divergente_serveur_front.md) | Pre-event : le serveur casse les packs avec la chaîne Logistique (MarketPrice → MenuComponent → MenuItem) et le front reconvertit avec `inventoryQuantityPackaged` (**MenuItem prioritaire**) — priorités inverses → attendus, hints « Attendu : N » et écarts faux dès que les deux valeurs diffèrent | 🟡 Corrigé non déployé | 🟠 | Stock / Logistique |
| [240](240_reconciliation_dark_mode_et_formats_fr_fr_en_dur.md) | Section + vue Réconciliation : 44 couleurs en littéraux, **0** `var(--fb-*)` → deux blocs blancs en thème sombre ; dates/nombres en `toLocaleString('fr-FR')` en dur malgré l'i18n maison | 🟡 Corrigé non déployé | 🟡 | Stock / Thème & i18n |
| [241](241_getpreeventinventory_repli_legacy_hors_event.md) | `getPreEventInventory` : le repli legacy prend le dernier snapshot du space antérieur au jour du match, **sans filtre `eventId` ni `kind`** (contrairement à son commentaire) → stock de départ possiblement issu d'un autre match, non tracé ; contredit « un match = un eventId » (§12.4) | 🟡 Corrigé non déployé | 🟠 | Stock |
| [242](242_reco_post_event_ventes_composees_non_explosees.md) | Réco post-event : ventes de produits préparés jamais explosées vers les ingrédients → sur toute ligne comptée au grain ingrédient, `Qty Sold` 0 et `Missing` = 100 % de la consommation réelle (ex-Q35, tranchée owner 2026-07-27 : Option 1 — la réco consomme `explodeSalesToConsumption` via `GET event-consumption`) | 🟡 Corrigé non déployé | 🟠 | Stock / Logistique |
| [243-01](243_01_analyse_dropdown_outils_pre_event_inventory_absent.md) | Analyse : dropdown « Outils » sans entrée **Pre-event Inventory** (écran inatteignable depuis la vue par défaut d'un espace) et Post-event libellé « Inventory » — la liste d'outils est dupliquée dans **5 fichiers** sans source commune, `spacePreInventoryPath`/`onToolboxSelect` étaient déjà câblés mais en code mort | 🟡 Corrigé non déployé | 🟠 | Stock / Navigation |
| [244-01](244_01_timeline_analyse_filtres_non_appliques.md) | Timeline Analyse : **5 filtres sur 6** ne l'atteignaient pas (cliquer un article dans « Item performance » ne changeait rien), et 2 des 3 props effectivement passées étaient **inertes** — gardées par des maps `null` jamais fournies. `eventTimelineData` est un fetch indépendant qui ne traversait aucun prédicat | 🟡 Corrigé non déployé | 🟠 | Analyse & agrégation |
| [245-01](245_01_donut_categories_par_transaction.md) | **Feature** — donut « répartition des catégories de produits par transaction » (+ drill-down au grain article). Nouvel endpoint `GET /spaces/:id/transaction-baskets` : seule lecture du code qui préserve l'identité du panier. Absorbe la demande « Rapport Type de transaction » (`transactionType` n'existe nulle part). Filtres en sémantique « contient » (#42 tranchée). **Non mergeable** tant que #41 (remboursements) est ouverte | 🟡 Implémenté non déployé | — | Analyse & agrégation |
| [246-01](246_01_referentiels_pagination_bloquee_page_1.md) | Référentiels : **11 écrans bloqués sur la page 1** — `items-length` posé sur `v-data-table` alors que c'est une prop de `v-data-table-server`, donc ignorée : pagination client sur la seule page reçue (« 1-10 of 10 » vs « 41 Total Categories »), tout le référentiel au-delà de la 10ᵉ ligne inatteignable. Régression du correctif BUG-171 | 🟡 Corrigé non déployé | 🟠 | Menu & recettes / Achats & référentiels |
| [247-01](247_01_analyse_kpi_header_ca_shop_level_puis_item_level.md) | Bande KPI du header : REVENUE affiche **243 428,69 €** (repli shop-level) puis **173 739,07 €** (item-level) — **28,6 % d'écart** publié comme une valeur finale, sans état de chargement. Racine : **les deux lectures ne rattachent pas les ventes de la même façon** — shop-level par l'id d'event figé dans `SpaceRevenueMinuteAgg`, item-level par une **fenêtre de dates recalculée** sur `Event."eventDate"`. Une date d'event mal saisie efface donc tout le CA de cet event des vues item-level, sans erreur (« Match 10 Mai », `eventDate` au 31/05 pour des ventes du 10/05 : 47 579,50 € invisibles ; date corrigée le 2026-07-30, +41 618,53 € HT récupérés). Au passage : cette colonne contient un `Event.id` DataFriday malgré son nom, la RPC ne marche que grâce à ce décalage — à ne pas « corriger » d'un seul côté. Explique aussi le filtre Configuration perçu comme inerte : les events retirés pèsent 41 % du shop-level mais 0,65 % de l'item-level. **Écart résiduel élucidé le 2026-07-30 : c'est intégralement la TVA** — après correction de la date, item-level 215 310,63 € vs shop-level 243 428,69 €, soit 28 118,06 € (13,06 %). La formule d'agrégation est corrigée depuis le 2026-07-21 (`a71045b`), mais les agrégats antérieurs n'ont jamais été rejoués : agrégat écrit avant le fix = TTC au centime près, après = HT au centime près. **Portée : 8 espaces, ≈ 1,26 M€ affichés en TTC sous un libellé HT** (toutes les cartes de la home page). Correctif = rejouer `process-events` **avec `integrationId`** (sans lui, double comptage), audit dans `backend/prisma/sql/2026-07-30_audit_agg_perimes.sql`. `reduction` et le filtre `status='V'` mesurés et écartés | 🔴 Non corrigé (diagnostic runtime + base établi) | 🔴 | Analyse & agrégation |
| [248-01](248_01_stockreconciliation_meta_non_appliquee_prod.md) | **Défaut de déploiement, pas de code** — `GET /inventory/:spaceId/reconciliations` renvoie 500 en production : « The column `StockReconciliation.meta` does not exist ». Le schéma déclare la colonne (`schema.prisma:2795`) et la migration idempotente existe (`prisma/sql/2026-07-24_stockreconciliation_meta.sql`) — elle n'a **jamais été jouée sur la base de prod**. `migrate deploy` de `render.yaml:7`/`:41` est un no-op silencieux (`prisma/migrations/*` gitignoré, [ADR-0002](../../../backend/docs/adr/0002_migrations_manuelles_jamais_plateforme.md)). Le front avale le 500 en `console.warn` : la section Réconciliation est vide sans le dire. **6 requêtes** touchent `meta` implicitement, pas seulement l'endpoint signalé (dont le reset logistique et l'export). §13.4 du module 10 prédisait un `undefined` silencieux : c'est en fait un P2022, donc un 500 dur — et son étape `prisma generate` est inutile sur Render (corrigé en §13.5) | 🔴 Ouvert (SQL à jouer en prod) | 🔴 | Stock |

**BUG-247-01 ajouté le 2026-07-30** (signalé par l'utilisateur sur la bande KPI d'Analyse, puis
instrumenté en navigateur : traces `[DIAG cfg]` temporaires dans `analyse.js` / `AnalyseView.vue`, à
retirer avec le correctif). Le symptôme lu comme « les widgets se recalent sur une configuration par
défaut » n'a rien à voir avec le filtre Configuration : `cfg` reste `null` et
`eventsInActiveConfiguration` vaut 18 = tous les events, du début à la fin de la séquence. C'est
`kpiRecords` qui change de source (repli shop-level → item-level) entre deux valeurs qui divergent de
28,6 %. La pré-sélection de config (BUG-225) a bien été retirée le même jour, mais sur décision
utilisateur — ce n'était pas la cause de ce symptôme-ci. Le second symptôme rapporté (« changer la
configuration ne bouge pas les widgets ») a été reproduit et **infirmé** : le filtre atteint bien le
store et le périmètre passe de 16 à 10 events, mais les events retirés ne portent que 0,65 % des
records item-level — même racine, vue sous un autre angle.


**BUG-248-01 ajouté le 2026-07-30** — remonté par l'utilisateur (500 en console sur Pre/Post-event
Inventory). Aucune ligne de code à corriger : c'est l'avertissement de déploiement conjoint du bloc
2026-07-24 ci-dessous (fiches 238/241) qui n'a pas été exécuté. La fiche porte la commande exacte —
`psql "$DIRECT_URL"`, PAS le pooler — et le rayon de souffle complet.

**BUG-246-01 ajouté le 2026-07-29** (signalé par l'utilisateur : des catégories visibles dans le
formulaire d'édition d'un article étaient absentes de l'écran Product Categories. Ce n'était pas un
problème de liaison de données — l'écran était **bloqué sur sa première page**. `items-length` est
une prop de `v-data-table-server` ; posée sur un `v-data-table` ordinaire elle est ignorée et la
pagination retombe sur `items.length`, soit la page serveur courante, d'où « 1-10 of 10 » face à un
compteur d'en-tête annonçant 41. Régression directe de **BUG-171**, marquée 🟢 à tort et repassée à
⚪ : ce correctif avait supprimé le chargement client complet sans donner au paginateur de quoi
connaître le total. 8 composants basculés sur `v-data-table-server`, couvrant 11 écrans ;
`MenuItemView` traité par composant dynamique avec import Vuetify explicite, l'auto-import du
tree-shaking ne sachant pas résoudre un `<component :is>`. Tri des colonnes désactivé en mode
serveur : tous les endpoints ordonnent en dur par nom sans accepter de paramètre de tri, l'en-tête
ne triait donc que les 10 lignes affichées — un tri qui mentait sur son périmètre. **Validation en
navigateur requise** : ce défaut est invisible en test unitaire, c'est ce qui l'a laissé passer.)
| [246-02](246_02_eventformdrawer_sessions_double_stringify.md) | `EventFormDrawer.vue` : chaque session ré-encodée en JSON avant l'envoi (double-stringify), sessions perdues hors du formulaire (export CSV) | 🟢 Corrigé | 🟠 | Événements |
| [247-01](247_01_darkmode_cartes_espaces_homepage.md) | Dark mode : cartes d'espaces blanches sur la homepage `/spaces` — `SpaceItem.vue` sans moitié sombre (le parent avait `isDark` sans le passer) + balayage : 12 composants « littéraux clairs, zéro affordance sombre » corrigés (shell global, RH, Analyse, Data integration), vague 1 répliquée dans `datafriday-web` | 🟡 Corrigé non déployé | 🟡 | Espaces & builder (transverse) |

**BUG-245-01 ajouté le 2026-07-29** (feature, pas défaut : donut « catégories de produits par
transaction » demandé avec capture de référence. Absorbe la demande séparée « Rapport Type de
transaction » — vérification préalable : `transactionType` n'existe nulle part dans le code, et un
« type de transaction » désigne en réalité une combinaison de catégories. Nouvel endpoint backend
obligatoire : `getEventTimelineBatch` porte déjà toute la chaîne de jointure mais écrase `t.id` en
`COUNT(DISTINCT)`, et aucun pré-agrégat ne porte de dimension transaction. Réponse pré-groupée par
(event × minute × PdV × combo) pour rester filtrable côté client — renvoyer des comptes finaux
aurait recréé le défaut de BUG-244-01 le jour même. Aucune migration : les index existants couvrent
les prédicats. Un seul montage couvre Analyse, Live et Predict. 7 tests backend + 19 front.
Sur les deux hypothèses métier ouvertes, #42 a été **tranchée le jour même par l'owner** : filtrer
« Bières » garde les tickets qui en contiennent, paniers **mixtes inclus** — d'où l'ajout de
`typeCombo` à l'endpoint et un prédicat `buildBasketFilterPredicate` dédié, 10 tests. Reste
**bloquante pour le merge** : #41, le traitement des remboursements au dénominateur.)

**BUG-244-01 ajouté le 2026-07-29** (signalé par l'utilisateur : cliquer une ligne d'« Item
performance » ne changeait pas la timeline. Diagnostic plus large — `eventTimelineData` vient d'un
fetch indépendant qui ne traverse ni le getter store ni le prédicat item-level, et le `passesFilters`
interne du graphique n'était alimenté que sur 3 dimensions dont 2 court-circuitées par des gardes sur
des maps jamais passées. Corrigé en pré-filtrant dans le parent avec le MÊME `reconcileRecord` +
`buildItemFilterPredicate` que les donuts — plutôt qu'en complétant les props, ce qui aurait recréé
le bug dans un second dialecte : les donuts émettent des clés **réconciliées**, jusqu'à la sentinelle
« Non rattachés ». Au passage : `buildItemFilterPredicate` extraite vers `analyseDimensions.js`, et
les 2 constructions du contexte de réconciliation fusionnées en un composable unique. 12 tests
ajoutés. Trois défauts pré-existants que ce correctif rend visibles — produits non mappés sans nom,
fusionnés entre eux, et écartés de la ventilation par article — sont documentés dans la fiche et
**non corrigés**, chacun changeant l'agrégation pour tout tenant à couverture de mapping imparfaite.)

**BUG-243-01 ajouté le 2026-07-29** (signalé par capture — le dropdown « Outils »
d'Analyse n'affichait qu'une entrée « Inventory » là où Inventory/Logistic/Restock/Event Predict en
affichent deux (Pre-event + Post-event). Une seule ligne manquait dans `toolboxItems`
[`analyse/filters/FilterPanel.vue:616`](../../src/components/analyse/filters/FilterPanel.vue), le
chemin et le handler existant déjà ; corrigé en réutilisant la clé `invToolPreInventory` partagée
par les autres écrans, plus alignement du libellé `anToolInventory` sur « Post-event Inventory ».
La duplication de la liste dans 5 fichiers — cause structurelle — est documentée dans la fiche mais
**non résolue** ; le filtrage par permission manquant côté Analyse et l'absence de « Live » dans les
4 autres listes sont laissés ouverts.)

> Pas de « **N bugs au total** » sur cette entrée : le compteur du paragraphe suivant (« 240 ») ne
> correspond plus à rien de vérifiable — 261 fiches sur disque, 242 numéros `NNN` distincts et 262
> lignes de tableau avant l'ajout de 243-01. Plutôt que de propager un total faux, la date et le
> numéro suffisent. À recaler d'un coup si quelqu'un veut restaurer le compteur.

**240 bugs au total** (242 ajouté le 2026-07-27 : ex-Q35 tranchée par l'owner — Option 1, la réco
post-event consomme les ventes explosées en ingrédients par la cascade Logistique ; déploiement
backend requis, repli automatique au grain article sinon, `meta.salesSource` archivé. 237-241
ajoutés le 2026-07-24 : vérification de l'implémentation Pre/Post-event
Inventory contre `modules/10_POST_EVENT_INVENTORY.md`, cf. §13 de ce document — le brief produit et
les correctifs déjà documentés sont conformes, ces 5 fiches sont les écarts trouvés au-delà.
**Tous corrigés le jour même** sur `feat/postEventInventory` : backend 41/41, front 478 tests verts
(4 échecs préexistants hors périmètre, identiques avant/après). ⚠️ Déploiement **conjoint** requis —
`prisma/sql/2026-07-24_stockreconciliation_meta.sql` + `prisma generate` + redémarrage backend, sans
quoi la colonne `meta` reste absente ; le front, lui, retombe automatiquement sur un POST sans
contexte plutôt que d'échouer, réflexe [BUG-228](228_inventory_snapshot_kind_rejete_backend_perime.md).)

**234 bugs au total** (222-231 ajoutés le 2026-07-20 sur `feat/postEventInventory` ; numérotés à
l'origine 193-203 sur cette branche, renumérotés au merge dans `develop` le 2026-07-22 pour éviter
la collision avec 193-221, déjà pris par l'audit `data-integration/fb` et le fix RBAC ajoutés en
parallèle sur `develop`. Le doublon 190/193 de la fiche Predict — grain article des scénarios est
resté sur [BUG-190](190_predict_vues_article_absentes_grain_shop_level.md) : `feat/postEventInventory`
l'avait lui-même renuméroté 193 sans changer le contenu, changement abandonné au merge puisque 190
reste la version canonique dans `develop`.)

**228** (ajouté le 2026-07-20) : pas un bug de code — 400 `property kind should not exist` sur le
save du snapshot inventaire alors que `CreateInventoryDto` déclare bien `kind` ; le serveur
exécutait un build antérieur au commit `6491562`. Fiche gardée comme réflexe diagnostic : « property
X should not exist » avec DTO à jour ⇒ vérifier la fraîcheur du build backend avant de chercher un
bug.

**227** (ajouté le 2026-07-20, sur capture DevTools de l'utilisateur) : le vrai blocage de la page
Analyse n'était **aucun** des lots du plan de chargement — c'était un payload,
`getConfigShopMenuItemsLight` sélectionnant `picture` par ligne d'assignation. Le stockage base64 en
base lui-même est ouvert en question #27.

**226** (ajouté le 2026-07-20) : lots A, D et B du
[plan de chargement progressif](../PLAN_CHARGEMENT_PROGRESSIF_ANALYSE.md), demandé le jour même ;
seul le lot C — unifier les 2 pipelines `shop-items` — reste ouvert.

**223-225** (ajoutés le 2026-07-20, sur retour utilisateur direct) : le donut « Par zone » d'Analyse
n'a ni skeleton ni état vide pendant le chargement **différé** du contexte PdV — seule dimension
sans sentinelle de repli (BUG-223) ; la liste « Outils » d'Analyse/Prédire (`FilterPanel.vue`,
partagée par les deux modes) n'avait jamais reçu l'entrée `space-pre-inventory` ajoutée sur les 4
autres écrans (BUG-224) ; et le landing par défaut ne pré-sélectionnait aucune configuration,
déclenchant systématiquement le fan-out le plus large du module (BUG-225, règle « 1re config avec
events » tranchée le jour même avec l'utilisateur). **La pré-sélection de BUG-225 a été annulée le
2026-07-30** sur décision de l'utilisateur (« il ne devrait pas y avoir de config par défaut
sélectionnée ») : on atterrit de nouveau sur « All Configurations », l'union restant différée après
le premier rendu. Le point 2 de la fiche (dédup du contexte PdV) reste en place.

**222** (ajouté le 2026-07-20, découvert en vérifiant la logique Pre/Post-event contre la spec
métier) : voir [`../modules/10_POST_EVENT_INVENTORY.md`](../modules/10_POST_EVENT_INVENTORY.md) §
Vérification.

**229-231** (ajoutés le 2026-07-20/21, audit `/hr` et `Settings`/`MainNav`) : props à double
majuscule (`onOpenHR`, `onOpenFBIntegration`) cassant la liaison kebab-case, câblage Settings « Edit
HR » silencieusement mort (BUG-229) ; famille Consolidated* enchaînant handler puis `onClose()` →
double navigation (BUG-230) ; écrans RH routés avec crashs dialog/CSV, backend mort, N+1 — corrigés
puis remplacés le 2026-07-21 par `components/hr/` (Vuetify + i18n) (BUG-231).
**221 bugs au total**, 193-221 ajoutés puis corrigés le 2026-07-20 sur la branche
`docs/audit-data-integration-fb` suite à un audit ciblé et approfondi de toute la page
`/data-integration/fb` (8 agents en lecture intégrale, un par fichier/groupe de fichiers —
`DataIntegrationView.vue`, le wizard et ses 4 étapes, les 4 dialogs de l'étape 4,
`SyncProgressDialog`/`SyncJobFloatingWidget`, la couche API/store), suivi d'une seconde vague de
5 agents de correction (fichiers disjoints, aucun conflit) qui a fixé les 29 bugs le jour même —
détail du correctif dans chaque fiche individuelle (`## Correction`). Décision produit tranchée en
amont pour BUG-193 (case de suppression retirée plutôt que rendue fonctionnelle côté backend, pas
de changement de schéma) et pour BUG-221 (code mort supprimé plutôt que réintégré). Détail architectural et
code mort
supplémentaire dans [`docs/modules/05_INTEGRATIONS_VENTES.md`](../modules/05_INTEGRATIONS_VENTES.md#repasse-du-2026-07-20--audit-ciblé-du-code-frontend-data-integrationfb) ;
dette technique non promue en fiche individuelle (a11y, i18n, duplication, code mort mineur) dans
[`docs/utiles/AUDIT_DATA_INTEGRATION_FB_DETTE_TECHNIQUE_2026-07-20.md`](../utiles/AUDIT_DATA_INTEGRATION_FB_DETTE_TECHNIQUE_2026-07-20.md).
| [194](194_darkmode_incomplet_component_library_market_prices.md) | Dark mode incomplet sur `component-library` et `market-prices` (parents/enfants non alignés sur le pattern `isDark`/`--dark`) | 🟢 Corrigé | 🟡 | Menu & recettes / Achats & référentiels |
| [193](193_auth_ismanager_getter_mort.md) | Getter `isManager` mort (gating par nom de rôle, incompatible 6 rôles métier) | 🟢 Corrigé | 🟢 | Auth & onboarding (RBAC) |
| [195](195_market_prices_dialogs_type_categorie_dupliques_create_edit.md) | Dialogs de création (Type/Category/Industriel/Packaging) dupliqués/triplés entre les 3 drawers market-prices → extraits en composants partagés (Supplier laissé inline) | 🟢 Corrigé | 🟡 | Achats & référentiels |
| [196](196_darkmode_completion_domaines_restants_etoiles_required.md) | Dark mode incomplet sur les domaines restants (events, market-prices, component-library, products, référentiels, analyse + header workspace) + étoiles « required » incohérentes ; z-index des selects EventFormDrawer | 🟢 Corrigé | 🟡 | Transverse |
| [197](197_darkmode_workspaces_fb_inventory_logistic_restock.md) | Dark mode absent/incomplet sur les workspaces F&B (contrat `--fb-*` déclaré sur trop peu de racines) : Inventory, Logistic, Restock `?step=stock`, champ « Outils », ligne « Tout l'historique » du bandeau Analyse, bordures des donuts | 🟡 Corrigé non déployé | 🟡 | Espaces & builder / Analyse |
| [198](198_darkmode_eventpredict_overlay_teleporte.md) | Dark mode absent sur l'overlay Event Predict `?toolbox=event-predict` (téléporté hors `.v-application` → `.v-theme--dataFridayDark` non-ancêtre ; dégradé clair gagnant sur `var(--ep-bg)` ; drawer sources & terminal téléportés) | 🟡 Corrigé non déployé | 🟡 | Analyse & agrégation |
| [199](199_darkmode_domaines_user_role.md) | Dark mode absent/incomplet sur User & Role (vues UserList/UserCreate sans dark ; drawers/dialogs téléportés recevant `isDark` mais sans classe `--dark` posée) — ProfileView déjà theme-aware | 🟡 Corrigé non déployé | 🟡 | RBAC / Users |

**192 bugs au total** (190-192 ajoutés le 2026-07-20, branche `fix/currentBug-fixAuthentification`, domaine Auth & onboarding) : correctif de la déconnexion intempestive multi-onglets sur rotation du refresh token (BUG-190, décision extraite dans une fonction pure testée `src/utils/authSessionEvent.js`), du JWT imprimé en clair dans la console à l'onboarding (BUG-191), et suppression du code mort du domaine Auth (`Login.vue`, `api/endpoints/onboarding.js`, 4 guards jamais attachés — BUG-192). Voir aussi [BUG-27](27_bypass_demo_actif_sans_distinction_env.md) et [BUG-28](28_predict_test_sans_guard_auth.md), corrigés dans la même branche.
| [190](190_predict_vues_article_absentes_grain_shop_level.md) | Mode Predict : « Répartition du CA par article » et « Articles du menu par PdV » absents (prédiction shop-level sans dimension article) | 🟡 Corrigé non déployé | 🟠 | Analyse & agrégation |
| [255](255_hr_supplier_departments_rejete_backend_render_obsolete.md) | Création HR Supplier → 400 « property departments should not exist » : code correct (DTO+Prisma ont `departments`), mais backend **Render obsolète** (ex-`sectors`) + migration HR à appliquer — à redéployer/migrer (ops) | ⚪ Diagnostiqué | 🟠 | RH / Déploiement |
| [258](258_composants_cache_ttl_supprime_reste_local.md) | Composants supprimés « restés localement » : cache TTL 15 min du store `menuComponents` servait la liste périmée après suppression → TTL retiré (refetch toujours frais) | 🟢 Corrigé | 🟡 | Menu & recettes / Cache |
| [259](259_events_cat_subcat_item_value_id_non_normalise_bulk.md) | Events Catégorie/Sous-catégorie : `item-value="id"` non fiable (getters non normalisés, items en `_id`) → sélection groupée inopérante ; `id` normalisé | 🟢 Corrigé | 🟡 | Événements |
| [311-03](311_03_events_colonne_configuration_pas_maj_apres_creation.md) | EventsListView : la colonne « Configuration » d'un event nouvellement créé reste vide (`loadConfigNames` n'était appelé qu'au mounted) → re-résolution des configs après save/import | 🟢 Corrigé | 🟡 | Événements |
| [315-01](315_01_eventpredict_vue_article_item_disparait_au_clic.md) | Event Predict / Configuration, vue article : cocher/décocher un item le fait **disparaître** de la liste — chip-filtre actif ré-évalué en live alors que le clic change justement ce que le filtre teste (rattache/détache), + décocher = **détacher du Space Menu write-through** (l'entrée sort de `groupByMenuItemArray`, cas `!mi`/`!shops.length`), + re-tri « cochés d'abord » qui téléportait la carte. Fix « comportement naturel » : tri alphabétique stable, session de chip (item traité reste affiché grisé « ✓ traité » jusqu'au changement de filtre, ghost re-cochable pour les détachés), `transition-group` sur la liste | 🟡 Corrigé non testé | 🟠 | Event Predict |
| [316-01](316_01_estimation_fanout_absolu_slider_et_staff.md) | Mode estimation : le slider « par article » posait la **même quantité absolue sur chaque PDV coché** (`applyFanoutQuantity` — 129 saisis = 129 × N shops) → Stock up identique partout, total ×N ; aggravé par `ui/slider.vue` qui **émettait `update:value` à chaque changement de `max`** (échelle éditable) → fan-out silencieux écrasant les saisies par PDV (0 partout sur état « mixte »). Fix : `splitQuantityAcrossKeys` (le slider article porte le TOTAL, réparti équitablement — décision JLH), slider no-op sans vrai changement, libellé reformulé. + Staff : « Aucun goal TPE » = config RH d'espace absente (400 backend avant toute lecture de CA) et l'état vide n'offrait aucun accès aux Settings RH → pill + drawer RH rendus aussi à vide ; verrous restants (CA lu de la seule version `isDefault`, volumétrie à 0) → questions no 55/56 | 🟡 Corrigé non testé | 🔴 | Event Predict / RH |

**190-bis bugs au total.** 190 ajouté le 2026-07-20 sur `feat/analyse` (numéroté 170 à l'origine sur
cette branche ; renuméroté **190** au merge dans `develop` — 170 y était déjà pris par
`170_delete_bloque_sans_moyen_de_trouver_les_dependants.md`). 172-189 ajoutés le 2026-07-18 sur `feat/analyse` (numérotés à l'origine
149-166 sur cette branche ; renumérotés 172-189 au merge du 2026-07-20 dans `develop` pour éviter la
collision avec 149-171 ci-dessus, ajoutés en parallèle sur `develop` le 2026-07-19). Trois fiches
supplémentaires de `feat/analyse` (initialement 167-169 sur cette branche, elles-mêmes déjà
renumérotées depuis 149-151 lors d'un merge interne antérieur) étaient des doublons strictement
identiques aux fiches 149-151 ci-dessus (même bug, même correctif) — supprimées au merge, 149-151
restent la version canonique. Audit croisé /analyse + Event Predict + Stock
(inventory/logistics/restock), mené avec le backend (fiches 89-102) et un objectif de performance
« contenu initial des vues < 300ms ». Découverte structurante : toute la chaîne `/analyse/*` du
front (action `loadSpaceLightweight`, 4 buckets d'état, `analyse.api.js`, mock 39KB) était MORTE —
jamais dispatchée, jamais lue — et a été supprimée (172) ; le vrai chemin est `loadSpace →
useSpaceData` two-phase, qui reçoit : cache-first 15 min stale-while-revalidate au re-mount (174),
pagination composants parallélisée (175), et côté backend le cache Redis de la RPC shop-details
(~300ms économisés, back 92). Deux N+1 majeurs éteints par adoption de batchs existants : le moteur
predict passe au batch event-timeline (180, avec fix préalable de l'empoisonnement in-flight du
batch sur rejet — 173) et Space Inventory au batch shop-items enrichi (185) — soldant le BUG-010
backend. Predict : `manualQuantities` enfin envoyé (fiche 08 → 🟢, le backend était prêt depuis le
début). Restock : alerte explicite sur 403 + envoi de `stockExcluded`/`currentStep` (fiche 19 mise à
jour ; le choix de permissions backend reste à Bertrand). Laissés volontairement en ⚪/⚫ après
diagnostic : le tradeoff phase-2 unscoped (176, annoté en code — ne pas « re-scoper » sans lever les
gotchas), l'hydration N+1 des recettes (177, en arrière-plan, vrai fix côté backend), la triple
couche de cache timeline (178), les getters lourds (179, plan de fix par index `Map` posé), la
cascade de duplication des versions predict (181, bloquée par le nettoyage des doublons prod) et la
double persistance des comptages (183, décision d'architecture → `QUESTIONS_A_BERTRAND.md`). État de
la suite unit après session : 397/401 verts — les 4 échecs restants (suites `apiOrMock.spec.js`
[teste le fallback mock supprimé], `spaceMenusInventory.spec.js`, `eventDetailsEditor.spec.js`) sont
PRÉEXISTANTS, vérifiés identiques à HEAD avant toute modification de cette session ; corrigé au
passage un unhandledRejection réel dans le batch timeline (promesses dérivées sans handler) révélé
par la nouvelle spec `spaceApiTimelineBatch.spec.js`.

**171 bugs au total**, 171 ajouté et corrigé le 2026-07-19, même session, suite à un nouveau retour
utilisateur sur le fix BUG-169 : la pagination bornée évitait bien la requête non bornée, mais les
10 écrans de liste téléchargeaient quand même la totalité des données pour n'en afficher que 10 via
la pagination client Vuetify. Basculé en pagination + recherche réelles côté serveur, en 4 chantiers
parallèles (Product, Component, MarketPrice, référentiels plats — ce dernier réduit à un seul point
de changement grâce à BUG-165), tous copiant le pattern déjà en production pour `/menu-items`
(`MenuItemView.vue`/`getMenuItemsPage`). Le mécanisme "liste complète" utilisé par les dropdowns
ailleurs dans l'app (formulaires de création, wizards CSV) a été délibérément laissé intact et
découplé de ce nouveau mécanisme, pour ne rien casser. Non testé en navigateur (pas de `pnpm dev`
cette session).

**170 bugs au total**, 170 ajouté et corrigé le 2026-07-19 suite à un retour utilisateur en test
live : les gardes de suppression de BUG-79/81/82 bloquaient correctement la suppression d'une
taxonomie encore référencée, mais sans aucun moyen de retrouver les lignes bloquantes parmi
potentiellement des milliers. Les 6 `ConflictException` backend concernées portent maintenant un
payload structuré (`blockedBy`/`filterField`/`filterValue`), et les 6 écrans de suppression
affichent un lien direct vers l'écran cible déjà filtré (`/menu-items`, `/components`,
`/market-prices` lisent désormais `?type=`/`?category=` au montage). Non testé en navigateur (pas
de `pnpm dev` cette session).

**169 bugs au total**, 159-169 ajoutés le 2026-07-19 suite à un audit complet de la section
"Configurations" (10 pages : Menu Item Types/Categories, Good Types/Categories, Component
Types/Categories, Brand Names, Display Names, Industrials, Packing Types), en miroir de l'audit
backend (BUG-78 à 88, voir `api-datafriday-staging/docs/bugs/00_INDEX.md`). Motifs récurrents :
écritures Vuex optimistes avec objet partiel écrasant des champs (BUG-159/160, même famille que
BUG-149 déjà corrigé pour Events, jamais porté sur les taxonomies Menu/Configurations) ; deux des
trois paires Type/Category (Good, Component) dérivent leurs Categories de l'endpoint Types au lieu
d'appeler leur propre endpoint dédié pourtant implémenté côté backend, avec pour conséquence une
absence d'invalidation croisée de cache (BUG-161/163) ; résolution de FK par correspondance de nom
plutôt que par l'id chargé, même famille que BUG-62/81 déjà connus dans ce domaine mais jamais
corrigée sur les drawers MarketPrice (BUG-162) ; code mort ciblant des routes backend inexistantes
(BUG-164) ; duplication quasi totale des 4 référentiels plats jamais factorisée en composant
générique (BUG-165), qui explique la répétition du bug i18n sur 10 écrans (BUG-166) ; 4 clés de
traduction FR de la sidebar Configurations jamais traduites, laissées en anglais (BUG-167). Aucun de
ces bugs n'a été reproduit en navigateur (pas de `pnpm dev` dans cette session) — à valider
manuellement avant correction. Fiche de domaine étendue :
[`docs/modules/04_MENU_CATALOGUE.md`](../modules/04_MENU_CATALOGUE.md).

**159-164, 166-168 corrigés le 2026-07-19**, même jour, en parallèle par cluster de fichiers
(Product/Component/Brand/Display i18n+cache ; Good/Component Categories endpoint dédié ; MarketPrice
FK ; i18n Good ; i18n Industrial/PackingType). BUG-161 tranché en faveur de l'alignement sur le
pattern `productCategories.js` (appel direct de l'endpoint dédié) plutôt que de garder la dérivation
depuis Types ; a résolu l'essentiel de BUG-163 au passage, complété par un câblage d'invalidation
croisée Categories→Types. BUG-162 : en creusant le fix, l'agent a découvert que
`MarketPriceListView.vue` omettait `marketPriceTypeId`/`marketPriceCategoryId` de l'item agrégé
transmis aux drawers — sans quoi le correctif restait inerte (fallback silencieux sur l'ancien
comportement, pas de régression mais aucun bénéfice réel) — corrigé dans la foulée dans le même
fichier. BUG-165 (refactor de factorisation des 4 référentiels plats) et BUG-169 (pagination)
volontairement non traités dans cette passe initiale : chantiers jugés distincts d'un bugfix
isolé — voir plus bas, tous deux corrigés le même jour dans une seconde passe après une demande
explicite de ne pas laisser cette dette de côté. Aucun de ces correctifs n'a été testé en navigateur
(pas de `pnpm dev` dans cette session) — chaque fiche
liste les points de validation manuelle à faire avant déploiement.

**165 et 169 corrigés le 2026-07-19**, même jour, seconde passe. BUG-165 : extraction d'une factory
Vuex générique (`store/modules/factories/flatReferentialModule.js`) + 3 composants génériques
(`FlatReferentialListView`/`FormDrawer`/`DeleteDialog` sous `components/common/`), les 12 fichiers
per-entité devenus des thin wrappers (~30-40 lignes chacun au lieu de 163-353) plutôt que supprimés
— `BrandNameFormDrawer.vue`/`DisplayNameFormDrawer.vue` sont importés directement par
`MenuItemCreateView.vue` en dehors du contexte liste, la suppression aurait cassé cet import. Le
refactor a mis au jour 2 divergences comportementales réelles jamais unifiées silencieusement
(`mergeOnUpdate` jamais porté sur Industrial/PackingType par le fix BUG-160,
`loadErrorFallback` jamais traduit par BUG-166 sur ces 2 mêmes écrans) — préservées telles quelles
dans le refactor puis closes séparément juste après, chacune devenue une correction d'une ligne une
fois la factorisation en place. BUG-169 : l'arbitrage initial "cardinalité faible, pas de risque
actif" a été explicitement rejeté (croissance attendue à plusieurs centaines de lignes par tenant
d'ici la fin du mois) — les 10 endpoints paginés en 3 passes (MarketPrice, Product+Component,
référentiels plats, cette dernière réduite à un seul point de changement côté store grâce au
refactor BUG-165 tout juste terminé), chacune suivant le contrat déjà établi par `marketPrices.js`
(le store boucle sur des pages serveur bornées à 200 lignes et reconstitue la liste complète avant
de la committer) — choisi précisément pour ne PAS reproduire la classe de bug "plafond silencieux"
déjà documentée et corrigée ailleurs dans ce projet (BUG-52/54/89/139) : aucun consommateur
dropdown/picker (une recherche exhaustive en a confirmé au moins 2 par module, aucune exception) ne
reçoit de liste tronquée.

**158 bugs au total**, 158 ajouté et corrigé le 2026-07-19 suite à un balayage de complétude
("on a tout couvert ? pour les events") : seul bouton natif Vuetify du domaine sur `color="primary"`
au lieu du rouge codé en dur `#ff3131` utilisé partout ailleurs — invisible en thème clair (où
`primary` vaut justement `#ff3131`) mais viré violet en thème sombre (palette d'accent dark
volontairement distincte, `plugins/vuetify.js`). Corrigé par cohérence avec le reste du domaine.

**157 bugs au total**, 157 ajouté le 2026-07-19 suite à 2 retours utilisateur sur le passage
BUG-155/156 : (1) barre de chargement des 4 `v-data-table` du domaine rendue en gris/noir Vuetify
par défaut au lieu du rouge de marque — `loading` booléen ne suffit pas, Vuetify n'applique le thème
`primary` que si une couleur est explicitement déduite, corrigé en passant la couleur directement en
chaîne (`loading ? '#ff3131' : false`) ; (2) navigation "cliquer un événement lié" (introduite par
BUG-153) n'ouvrait pas la bonne fiche en usage réel — cause racine non identifiée sans navigateur,
retirée sur demande explicite de l'utilisateur plutôt que corrigée à l'aveugle (liste des événements
liés conservée, non cliquable).

**156 bugs au total**, 155-156 ajoutés et corrigés le 2026-07-18 suite à un retour utilisateur
direct sur BUG-153 : "on ne doit pas avoir de popups sur ces pages d'events" et "la traduction n'est
pas gérée". BUG-155 migre les 8 derniers `v-dialog` du domaine Événements
(`EventTypeDialog.vue`/`EventCategoryDialog.vue`/`EventSubcategoryDialog.vue`/
`EventDeleteDialog.vue`, le mini-dialog "Créer une équipe" d'`EventFormDrawer.vue`, et les 3 dialogs
de suppression inline des écrans taxonomie) vers `EventDrawerShell.vue`, avec ajout du support dark
mode qui manquait sur les 4 premiers (fond blanc codé en dur jusque-là). BUG-156 branche l'i18n sur
`TaxonomyDetailDrawer.vue` (texte français en dur depuis sa création par BUG-153) et corrige au
passage 3 boutons "Enregistrement…" en dur pré-existants sur les dialogs de taxonomie repérés durant
le même passage.

**154 bugs au total**, 153-154 ajoutés et corrigés le 2026-07-18 suite à un retour utilisateur sur
capture d'écran de `/event-types` : l'action "view" (icône œil) ouvrait un `v-dialog` centré non
conforme à la charte graphique (sidebar) et n'affichait qu'un compteur d'événements liés au lieu de
la liste réelle — `/event-categories` et `/event-subcategories` n'avaient quant à elles aucune
action "view". Nouveau composant partagé `TaxonomyDetailDrawer.vue` (même précédent que
`TaxonomyImportDrawer.vue`, prop `entity`) construit sur `EventDrawerShell.vue`, avec liste
d'événements liés cliquables naviguant vers `/events?editEventId=<id>` (BUG-153). En câblant cette
navigation, découverte que le deep-link `?editEventId=` d'`EventsListView.vue` ne fonctionnait qu'à
la toute première visite de `/events` dans la session — `keep-alive` empêchant `mounted()` de se
redéclencher, sans `activated()` pour compenser (même mécanisme que BUG-122, jamais répliqué ici).
Corrigé par ajout d'un hook `activated()`, avec garde contre une régression de perte de deep-link
sur la toute première activation (BUG-154).

**152 bugs au total**, 152 ajouté et corrigé le 2026-07-18 suite à une relecture ciblée de
`/event-categories` (frontend→backend) : un grep sur les consommateurs de `createEventCategory` a
remonté `EventCategoriesView.vue`, une implémentation entière alternative (706 lignes) hors du
domaine `events/` réellement routé — racine d'un arbre mort de 8 fichiers (~5000 lignes) partant de
`appCopy.vue` (aucun importeur), jamais nettoyé après la bascule vers l'implémentation actuelle.
Supprimé après vérification qu'aucun fichier réel ne le référence. Voir aussi
[BUG-77](../../../api-datafriday-staging/docs/bugs/77_createeventcategory_type_global_rejete_regression_bug66.md)
(fiche miroir backend, même session : régression du fix BUG-66 empêchant la création d'une catégorie
sous un type d'événement global).

**148 bugs au total**, 130-148 ajoutés et majoritairement corrigés le 2026-07-17 suite à un audit
complet du domaine Événements (`/events`, `/event-types`, `/event-categories`,
`/event-subcategories` + module backend miroir) : `hasHomeTeam` jamais réellement sauvegardé
depuis son seul écran de gestion dédié (2 bugs, cause racine = deux implémentations divergentes de
création de catégorie, laissée en ⚪ pour arbitrage) ; registre `inflight` absent des 4 stores du
domaine (déviation du pattern établi ailleurs) ; bouton "Calculer le revenu" mort (retiré) ; aucun
dialog/drawer du domaine n'était `persistent` pendant une requête — le cas le plus grave concernant
les deux importeurs CSV, dont la boucle d'import continue en tâche de fond même si l'utilisateur
croit avoir fermé le drawer ; le parseur CSV partagé (`utils/csv.js`, seul consommateur = ce
domaine) cassait sur les champs multi-lignes entre guillemets (même classe de bug déjà fixée
ailleurs sous forme de parseurs locaux, jamais répercutée sur cet utilitaire partagé) ; l'import CSV
d'events envoyait des champs absents du contrat `CreateEventDto` (`doorsOpen`/`showTime`/
`visitingTeam`/`performerName`/`sponsor`/`openingActName`/`allSessions`), provoquant un rejet 400
systématique (`forbidNonWhitelisted`) pour toute ligne renseignant l'un de ces champs — corrigé pour
les champs ayant un vrai foyer côté DTO, décision produit posée pour les 3 qui n'en ont aucun ; ni
import (Events ni taxonomie) ne dédupliquait au ré-import, ni ne signalait un fichier vide ; le
store `events.js` ne paginait jamais `GET /events`, tronquant silencieusement à 50 lignes (défaut
backend) tout tenant plus chargé ; `team.api.js` masquait toute erreur réseau réelle en "aucune
équipe" ; i18n contourné sur 5 dialogs (4 suppressions + création d'équipe inline) ; pagination
`v-data-table` non configurée sur les 4 écrans (défaut Vuetify 10 lignes) ; plus quelques nettoyages
mineurs (computed morts, recherche linéaire non mémoïsée). 145-148 documentent des décisions
produit non tranchées mises au jour par ce même audit (duplication de la logique de création de
catégorie, absence de validation croisée ticketsScanned/ticketsSold, incohérence de TTL de cache,
composant `EventDrawerShell` disponible mais non adopté par les 3 drawers du domaine). BUG-146
tranché le 2026-07-18 : pas de blocage (cas légitimes en billetterie où scanné > vendu — invités
hors vente, comps), avertissement non bloquant ajouté à la place (`EventFormDrawer.vue`, bandeau
réactif pendant la saisie, `submit()` non modifié). 145/147/148 tranchés et corrigés le même jour :
BUG-145 unifie création ET édition de catégorie sur `EventCategoryDialog.vue` (étendu avec un mode
édition + une option de création de type à la volée, tous deux additifs/rétrocompatibles), qui
remplace le drawer inline dupliqué d'`EventsCategorieListView.vue` ; BUG-147 aligne le TTL du store
`events.js` sur la convention 15 min ; BUG-148 migre les 3 drawers du domaine
(`EventFormDrawer.vue`, `CsvImportDrawer.vue`, `TaxonomyImportDrawer.vue`) vers
`EventDrawerShell.vue`, après avoir étendu ce dernier avec le support `persistent` et dark mode
qui lui manquaient (leur absence aurait fait régresser BUG-134 et le thème sombre sur les 3
drawers migrés). extraits de [`../modules/`](../modules/00_INDEX.md) (source exhaustive,
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
toujours non corrigé (décision produit du 2026-07-15 à reconfirmer avant d'y toucher) ; 113-129
ajoutés et majoritairement corrigés le 2026-07-17 suite à un audit complet de la page `/space-menus`
et de ses 7 composants live (4 vues, 3 tiroirs) + de sa couche état (composables, clients API,
store) : `ShopDetailView.vue` s'est révélé être un écran orphelin (route jamais atteinte par
aucune navigation en application) dont l'action principale "Attacher" était un stub 100% factice
sans appel réseau (BUG-113), avec en prime une logique de disponibilité/catalogue entièrement
divergente du reste du feature (BUG-114) ; une fuite de verrou de scroll body bloquait le défilement
de toute l'application après avoir quitté `/space-menus` (route keep-alive) avec un tiroir resté
ouvert (BUG-117) ; deux tiroirs d'édition shop se sont révélés éditer le même concept "types de
shop" sous des noms de champ et valeurs incompatibles, un save silencieux écrasant les vrais types
du shop par un défaut codé en dur (BUG-118) ; un deep-link `?space=&config=` depuis Event Predict se
cassait au retour sur une page gardée en mémoire (BUG-122) ; un filtre de recherche résiduel
polluait silencieusement la vue "By Shop" après un passage par "By Menu Item" (BUG-123) ; des race
conditions sans garde de fraîcheur pouvaient afficher les données d'un espace précédent après un
changement rapide de sélection (BUG-124) ; le cache Vuex `shopMenuItems` n'était jamais invalidé
après une écriture Space Menus, laissant Event Predict/Restock servir un roster périmé jusqu'à 15
minutes (BUG-128) ; et un cluster de 3 composables entiers (`useSpaceMenu.js`,
`useSpaceMenuReconciliation.js`, `useShopElementMapping.js`) s'est révélé être du code mort jamais
branché aux écrans réels malgré une documentation de module qui les décrivait comme la couche
d'édition live ; complétés par des correctifs de dark mode non propagé, i18n contourné, formatage
monétaire incohérent, petits nettoyages de code mort et de perf (recalcul O(P×S) non mémoïsé), et
quelques soucis UX/a11y mineurs. BUG-116 tranché et corrigé le même jour après recherche
approfondie (historique git, recherche d'un spec document introuvable, vérification qu'aucune
route backend `/shop-element-mappings` n'existe, découverte d'un concept concurrent déjà en
production sous un autre nom) : arbitrage en faveur de la suppression (prototype abandonné, pas
une fonctionnalité en attente) — les 3 composables et leurs tests dédiés supprimés, doc module
mise à jour.

**151 bugs au total**, 149-151 ajoutés le 2026-07-18 suite à un audit ciblé de `/event-types`,
`/event-categories` et `/event-subcategories` (suite du passage 130-148 du 2026-07-17, complété
ensuite par une relecture des DTOs/contrôleurs/gardes de suppression — rien d'autre trouvé côté
backend sur ces 2 écrans) : les mutations Vuex `UPDATE_EVENT_TYPE`/`UPDATE_EVENT_CATEGORY`/
`UPDATE_EVENT_SUBCATEGORY` remplaçaient l'item entier au lieu de fusionner avec l'existant, et
plusieurs composants construisaient eux-mêmes des objets partiels pour les dispatches optimistes
au lieu d'utiliser la réponse API complète — perte silencieuse de `categories`/`subcategories`/
`createdAt`/`updatedAt` après édition, création inline (`EventTypeDialog.vue`/
`EventCategoryDialog.vue`/`EventSubcategoryDialog.vue`, montés depuis `EventFormDrawer.vue`) ou
import CSV (`TaxonomyImportDrawer.vue`), auto-corrigé après 15 min (TTL cache) ou reload (BUG-149,
corrigé) ; export CSV des sous-catégories lisant un nom de champ (`categoryId`) qui n'existe sur
aucune ligne réelle de l'API, colonne "Event Category" toujours vide (BUG-150, corrigé) ;
`TaxonomyImportDrawer.vue` ne forçait jamais le mapping de la FK parente (type/catégorie) avant
import, chaque ligne concernée échouant en 400 brut plutôt que d'être bloquée ou clarifiée en amont
(BUG-151) — tranché le jour même par l'utilisateur en faveur du blocage (`canProceed`/nouveau
`valuesFullyMapped`) plutôt que l'auto-création par nom (précédent Menu Items BUG-110/111/112),
pour ne pas fragmenter silencieusement la taxonomie résolue par nom dans le moteur Event Predict
(cf. `QUESTIONS_A_BERTRAND.md` #10). Les 3 corrigés par lecture de code croisée (schéma Prisma,
service backend, consommateurs réels via grep) mais **non reproduits en navigateur** (pas de
`pnpm dev` dans cette session) — à valider manuellement.

**BUG-301-02 à 305-02 ajoutés le 2026-08-05** (module Live, session dédiée à tester l'écran
`/spaces/:id/live` en conditions réelles avec le widget QA d'auto-simulation). Chaîne de
découvertes : un audit proactif du polling Live (BUG-301-02, dette de perf — bootstrap catalogue
complet relancé à chaque tick) a révélé en le corrigeant une régression bloquante (BUG-302-02,
`state.events` plus jamais rafraîchi → nouvel event live invisible sans recharger), trouvée par
l'utilisateur lui-même en testant. Puis CA à 0€ sur les ventes simulées malgré quantités/coût
corrects (BUG-303-02, mapping Weezevent dupliqué au prix incomplet — corrigé en changeant la source
de prix des ventes QA vers le catalogue DataFriday plutôt qu'en patchant le symptôme). Puis deux
vagues de nettoyage UI sur remarque utilisateur (« je sens qu'il y a encore plein de brouilli ») :
panneau de filtres gauche (BUG-304-02 — compteurs Types de PDV/Zones non scopés à l'event live) puis
bandeau rouge (BUG-305-02 — mêmes trappes : filtres auto-écrasés, chips trompeurs, bouton Rapport
J+1 activable sur un event pas terminé). **BUG-306-02 ajouté et corrigé le même jour** : le point
laissé ouvert par BUG-305-02 (badge ● LIVE basé sur la route, pas la détection réelle) s'est
concrètement produit — badge LIVE + titre "Analyse" simultanés — et a été fermé en même temps que
l'ajout d'un bouton "voir/modifier l'event live" (§18, `docs/modules/11_LIVE.md`, demande
utilisateur : édition via le drawer existant, dates verrouillées pendant qu'un event est en cours).
Ce nouveau bouton a lui-même immédiatement révélé BUG-308-02 (titre/bouton liés au même pulse strict
que le badge → disparaissaient dès 30 min sans vente malgré un event du jour bien réel — corrigé par
un repli "event dont la fenêtre couvre aujourd'hui"). Et BUG-307-02, trouvé en ouvrant cette fiche
d'édition : `Avg Spend/Tx`/`Per Capita` vides malgré Revenue/Transactions renseignés — le pipeline
d'agrégation automatique (BUG-033) n'avait jamais été étendu pour calculer ces 2 champs.

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
   [`api-datafriday-staging`](../../../api-datafriday-staging/docs/bugs/) qui pointe vers
   celle-ci (voir BUG-007 / backend BUG-012 comme exemple).

**Pourquoi le code auteur (`AA`)** : `NNN` seul est "le prochain numéro disponible" au moment où on
crée la fiche — sur des branches parallèles, deux personnes peuvent choisir le même `NNN` sans le
savoir. Ça s'est déjà produit plusieurs fois dans ce changelog (172-189 et 222-231, voir les
mentions "renuméroté au merge pour éviter la collision" plus bas), et à chaque fois il a fallu
renuméroter après coup — y compris un doublon `193` jamais résolu (voir le tableau ci-dessus). Le
suffixe `AA` rend `NNN_AA` unique dès la création : si deux personnes tombent sur le même `NNN`, les
deux fiches coexistent simplement (`169_01` et `169_03` par exemple) sans renumérotation
obligatoire — un nettoyage manuel reste possible plus tard si on veut, mais n'est plus nécessaire
pour éviter un conflit.

**Rétroactivité** : les fiches déjà créées avant le 2026-07-28 gardent leur nom `NN_slug.md` actuel
(sans code auteur) — non renommées. Cette convention s'applique aux nouvelles fiches à partir de
maintenant.
