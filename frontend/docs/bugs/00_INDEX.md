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
| [171](171_configurations_pagination_recherche_server_side.md) | Taxonomies Configurations : pagination + recherche réelles côté serveur pour les 10 écrans de liste | 🟢 Corrigé | 🟡 | Menu & recettes / Achats & référentiels (Configurations) |
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
| [225](225_analyse_predict_config_par_defaut_et_dedup_contexte.md) | Analyse/Prédire : aucune config pré-sélectionnée → union « All Configurations » (fan-out max) par défaut ; + contexte PdV dispatché 2× | 🟢 Corrigé | 🟠 | Analyse & agrégation |
| [226](226_chargement_analyse_dedup_catalogues_et_phase2_en_vagues.md) | Chargement Analyse : `market-prices`/`packaging` sans dédup in-flight (2× ~60 s), phase 2 monolithique (graphes bloqués par les catalogues recette), contexte PdV rebâti à chaque demande | 🟢 Corrigé | 🟠 | Analyse & agrégation / Stock |
| [227](227_shop_items_photo_base64_dupliquee_par_pdv.md) | `shop-items` : 5,6 Mo / 53 s — une photo base64 de 915 ko réémise une fois par PdV (14 Mo émis, 38 ko utiles), jamais lue côté front | 🟢 Corrigé | 🔴 | Analyse & agrégation / Stock / Menu |
| [228](228_inventory_snapshot_kind_rejete_backend_perime.md) | Snapshot inventaire : `POST /inventory` 400 « property kind should not exist » — backend exécutant un build antérieur au DTO (`6491562`), aucun code fautif, fix = redéployer | ⚪ Diagnostiqué | 🔴 | Stock |
| [229](229_props_double_majuscule_liaison_kebab_morte.md) | Props à double majuscule (`onOpenHR`, `onOpenFBIntegration`) : liaison kebab-case camelisée en `onOpenHr`/`onOpenFbIntegration` → ne matche jamais, câblage Settings « Edit HR » silencieusement mort ; liaisons passées en camelCase | 🟡 Corrigé non déployé | 🟠 | RH / Navigation |
| [230](230_consolidated_views_double_navigation_onclose.md) | Consolidated* : `handleOpen*FromSettings` appelle le handler puis `onClose()` → en mode routé, la 2ᵉ navigation écrase la 1ʳᵉ ; contourné dans `HrView` (prop `onOpenEvents` omise, entrée MainNav masquée) | ⚪ Diagnostiqué | 🟡 | RH / Navigation |
| [231](231_ecrans_rh_routes_restes_prototype.md) | Écrans RH routés : crashs dialog/`toast`/CSV, Edge Function KV morte, N+1, dialogs shadcn disloqués dans le layout Vuetify — corrigés puis **écrans prototype remplacés par `components/hr/` (Vuetify + i18n)** le 2026-07-21 ; vues prototype retournées en quarantaine | 🟡 Corrigé non déployé | 🟠 | RH |
| [232](232_pre_event_expected_non_normalise_negatifs.md) | Pre-event Inventory : attendus divergents de la Logistique et vrac **négatif** (Loose -1/-2) — somme brute baseline+deltas sans casse de pack (`normalizeLevel`) ni rejeu séquentiel, mouvements non joignables avalés ; fix = calcul serveur normalisé, chemin unique baseline/réconciliation | 🟡 Corrigé non déployé | 🔴 | Stock |
| [233](233_pre_event_expected_fuite_via_reconciliations.md) | Pre-event Inventory : les attendus gatés par `preInventoryExpected` **fuient** via `POST pre-event-reconciliations` (réponse avec `expectedPacked/Loose`) et `GET reconciliations` (lignes complètes) — permission de classe seule sur ces routes ; expurgation conditionnelle à trancher | 🔴 Ouvert | 🟠 | Stock / RBAC |
| [234](234_space_live_double_header_route_non_declaree_dashboardview.md) | Route `space-live` : double header (route Live non déclarée dans les listes self-headed / rail-push de DashboardView) | 🟢 Corrigé | 🟡 | Live events / Shell app |
| [235](235_syncprogress_stepprocesstimeline_timeout_duree_totale_faux_positif_gros_tenant.md) | Timeout de polling par durée totale (BUG-206/218) : faux positif "délai maximal dépassé" sur un gros tenant toujours en progrès | 🟢 Corrigé | 🟠 | Intégrations & ventes |
| [236-02](236_02_csvimportdrawer_dropdowns_taxonomie_vides_sans_indication.md) | Import CSV événements : dropdowns Espaces/Configs/Types/Catégories/Sous-catégories vides sans aucune indication (échec de fetch avalé par `Promise.allSettled`) | 🟡 Corrigé non déployé | 🔴 | Événements |
| [237-02](237_02_csvimportdrawer_darkmode_menu_select_teleporte_illisible.md) | Import CSV événements : champ de mapping illisible en dark mode (menu `v-select` téléporté hors de `.elv--dark`) | 🟡 Corrigé non déployé | 🟠 | Événements |
| [238-02](238_02_csvimportdrawer_champs_taxonomie_perdus_silencieusement.md) | Import CSV événements : Espace/Configuration/Type/Catégorie/Sous-catégorie perdus silencieusement à l'import ; 4 champs fantômes (BUG-136) désormais réellement stockés (schéma étendu) | 🟢 Corrigé | 🔴 | Événements |
| [239-02](239_02_csvimportdrawer_eventenddate_eventendtime_absents_mapping.md) | Import CSV événements : `eventEndDate`/`eventEndTime` absents du mapping malgré usage backend réel (multi-jours, fenêtre live) | 🟢 Corrigé | 🟠 | Événements |
| [240-02](240_02_csvimportdrawer_sessions_multiples_non_parsees.md) | Import CSV événements : événements multi-sessions, une seule session capturée (colonne "All Sessions" non parsée) | 🟢 Corrigé | 🟡 | Événements |
| [241-02](241_02_csvimportdrawer_menu_select_derriere_scrim_drawer.md) | Import CSV événements : menu déroulant d'un `v-select` invisible/inatteignable (z-index Vuetify posé sur `.v-overlay`, pas `.v-overlay__content` — 1er correctif inefficace, cause probable réelle du BUG-237-02) | 🟡 Corrigé non déployé | 🔴 | Événements |

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

**231 bugs au total** (222-231 ajoutés le 2026-07-20 sur `feat/postEventInventory` ; numérotés à
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
events » tranchée le jour même avec l'utilisateur).

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
