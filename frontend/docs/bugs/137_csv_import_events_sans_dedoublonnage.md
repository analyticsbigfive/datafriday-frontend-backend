# BUG-137 — Import CSV Events : aucune déduplication au ré-import

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/events/drawers/CsvImportDrawer.vue` (`doImport`)

## Symptôme

`CsvImportDrawer.doImport()` appelait `createEvent()` pour chaque ligne sans vérifier au préalable
l'existence d'un event de même nom/date. Un utilisateur qui ré-importe deux fois le même fichier
(erreur de manip, ou pour "corriger" une ligne après un échec partiel) dupliquait silencieusement
tous les événements déjà importés — `Event` n'a d'ailleurs aucune contrainte `@@unique` en base
(contrairement aux 3 tables de taxonomie), donc rien ne bloque la duplication côté backend non plus.

## Cause racine

Aucune vérification de doublon avant création, ni côté client ni contrainte DB — même classe de bug
déjà rencontrée et corrigée sur l'import CSV Menu Items (BUG-086).

## Correction

Avant l'import, construction d'un `Set` des events déjà présents dans le store
(clé `nom (minuscule, trim) + date`). Chaque ligne dont la clé correspond est comptée `skipped` et
signalée dans le résumé au lieu d'être recréée ; la clé est ajoutée au `Set` après chaque création
réussie pour couvrir aussi les doublons internes au même fichier CSV.

`TaxonomyImportDrawer.vue` (types/catégories/sous-catégories) n'a pas reçu de dédup client
équivalente : ces 3 tables ont une contrainte `@@unique` en base, et le fix backend BUG-69 (P2002 →
409 avec message clair) fait déjà remonter un doublon comme une erreur de ligne explicite
("existe déjà") plutôt qu'une duplication silencieuse — la lacune UX y était donc déjà refermée
côté backend.

## Risque de régression / à surveiller

Vérifier qu'un ré-import du même fichier CSV events ne recrée plus les lignes déjà importées
(comptées "ignorées" dans le résumé), et qu'un fichier avec deux lignes identiques entre elles n'en
crée qu'une (dédup intra-fichier).

## Références

- `docs/bugs/86_menu_items_csv_pas_de_dedup_reimport.md`
- `../../../api-datafriday-staging/docs/bugs/69_events_module_pas_de_traduction_p2002_p2003.md`
