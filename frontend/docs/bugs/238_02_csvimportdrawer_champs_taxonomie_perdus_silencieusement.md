# BUG-238-02 — `CsvImportDrawer.vue` : Espace/Configuration/Type/Catégorie/Sous-catégorie perdus silencieusement à l'import, 4 champs fantômes retirés du mapping

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-28
- **Fichiers** : `src/components/events/drawers/CsvImportDrawer.vue` (`eventFields`, `doImport`)

## Symptôme

Après un import CSV, seuls `name`, `eventDate`, `ticketsSold`/`ticketsScanned` sont effectivement
renseignés sur les événements créés — Espace, Configuration, Type, Catégorie et Sous-catégorie
restent vides malgré un mapping apparemment fait à l'étape correspondante, sans aucune erreur
affichée à l'étape Résultats (l'import est rapporté "en succès").

## Cause racine

Deux causes distinctes :

1. **Cascade du BUG-236-02** : `spaceId`/`configurationId`/`eventTypeId`/`eventCategoryId`/
   `eventSubcategoryId` dans le payload dépendent chacun d'un dictionnaire
   (`spaceValueMap`/`configValueMap`/…) rempli **uniquement** si l'utilisateur a pu choisir une
   valeur dans les dropdowns des étapes 3-7. Si ces dropdowns étaient vides (BUG-236-02), les maps
   restent `{}` pour toute la session → ces 5 champs valent `undefined` sur chaque ligne. Côté
   backend, `events.service.ts:184-218` (`resolveEventSpaceFields`/`resolveEventTaxonomyFields`)
   n'assigne ces champs que `if (dto.xxx !== undefined)` — comportement correct et nécessaire pour
   les mises à jour partielles (PATCH), mais qui rend absence = silence côté création aussi :
   aucune erreur n'est levée, l'événement est créé sans ces associations.
2. **BUG-136 non tranché** : 4 champs proposés au mapping (`performerName`, `sponsor`,
   `openingActName`, `allSessions`) n'ont jamais eu de foyer dans `CreateEventDto` — ils étaient
   déjà silencieusement exclus du payload envoyé (cf. commentaire historique dans le code), mais
   restaient visibles et sélectionnables dans l'UI de mapping, laissant croire à tort qu'ils
   seraient pris en compte.

## Correction

- **Cause 1** : résolue en amont par [BUG-236-02](236_02_csvimportdrawer_dropdowns_taxonomie_vides_sans_indication.md)
  (les dropdowns se peuplent réellement désormais, avec erreur visible sinon). En complément, plus
  aucune perte ne reste silencieuse même quand une valeur est légitimement laissée sur "Ignorer" :
  - Un résumé "Valeurs non associées" s'affiche **avant** l'import, sur la dernière étape de
    mapping, listant par dimension les valeurs CSV qui n'ont pas de correspondance choisie.
  - L'écran de résultats affiche désormais un décompte `missingAssociations` : nombre d'événements
    importés avec au moins une association (espace/config/type/catégorie/sous-catégorie) absente
    alors que la colonne CSV contenait une valeur.
- **Cause 2** : tranchée en faveur de l'option 2 du BUG-136 ("retirer ces 4 champs du mapping CSV")
  — `performerName`, `sponsor`, `openingActName`, `allSessions` sont retirés de `eventFields`.
  L'UI ne promet plus une capacité qui n'existe pas ; le commentaire de contournement
  `forbidNonWhitelisted` dans `doImport()` est devenu obsolète et supprimé.

## Risque de régression / à surveiller

- Si un CSV existant contient des colonnes `Performer`/`Sponsor`/`Opening act`/`All sessions`,
  elles ne seront simplement plus proposées au mapping (pas d'erreur, la colonne est ignorée comme
  n'importe quelle colonne non reconnue) — comportement volontaire, voir décision produit ci-dessus.
- Non vérifié en navigateur (contrainte de session, cf. BUG-236-02/BUG-237-02) : tester un import
  avec un espace/type/catégorie mappé sur une vraie valeur, vérifier sur la fiche événement créée
  que `spaceId`/`eventTypeId`/etc. sont bien posés, et qu'un import avec une valeur volontairement
  laissée sur "Ignorer" fait bien apparaître le résumé "Valeurs non associées" avant l'import et le
  décompte `missingAssociations` après.
- Si le produit décide finalement de vouloir stocker Performer/Sponsor/Opening act/All sessions
  (option 1 du BUG-136), cela nécessite une vraie évolution de schéma (`Event` + `CreateEventDto` +
  service) — à netraiter comme une fonctionnalité, pas un bug.

## Références

- [BUG-136](136_csvimportdrawer_champs_hors_dto_400_garanti.md) — origine des 4 champs fantômes,
  décision produit désormais tranchée (option 2)
- [BUG-236-02](236_02_csvimportdrawer_dropdowns_taxonomie_vides_sans_indication.md) — cause racine
  amont (dropdowns vides sans indication)
- `backend/src/features/events/events.service.ts:184-218` (`resolveEventSpaceFields`/
  `resolveEventTaxonomyFields`, comportement `undefined` = skip, nécessaire pour PATCH — non modifié)
