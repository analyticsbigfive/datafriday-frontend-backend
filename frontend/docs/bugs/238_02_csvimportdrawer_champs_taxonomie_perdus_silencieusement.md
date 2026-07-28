# BUG-238-02 — `CsvImportDrawer.vue` : Espace/Configuration/Type/Catégorie/Sous-catégorie perdus silencieusement à l'import ; 4 champs fantômes désormais réellement stockés (BUG-136 tranché)

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
2. **BUG-136 non tranché (au 2026-07-28, avant correctif)** : 4 champs proposés au mapping
   (`performerName`, `sponsor`, `openingActName`, `allSessions`) n'avaient aucun foyer dans
   `CreateEventDto` — ils étaient déjà silencieusement exclus du payload envoyé (cf. commentaire
   historique dans le code), mais restaient visibles et sélectionnables dans l'UI de mapping,
   laissant croire à tort qu'ils seraient pris en compte.

## Correction

- **Cause 1** : résolue en amont par [BUG-236-02](236_02_csvimportdrawer_dropdowns_taxonomie_vides_sans_indication.md)
  (les dropdowns se peuplent réellement désormais, avec erreur visible sinon). En complément, plus
  aucune perte ne reste silencieuse même quand une valeur est légitimement laissée sur "Ignorer" :
  - Un résumé "Valeurs non associées" s'affiche **avant** l'import, sur la dernière étape de
    mapping, listant par dimension les valeurs CSV qui n'ont pas de correspondance choisie.
  - L'écran de résultats affiche désormais un décompte `missingAssociations` : nombre d'événements
    importés avec au moins une association (espace/config/type/catégorie/sous-catégorie) absente
    alors que la colonne CSV contenait une valeur.
- **Cause 2 — décision produit finalement tranchée le 2026-07-28 en faveur de l'option 1 du
  BUG-136** ("ajouter les colonnes au schéma") plutôt que l'option 2 retenue plus tôt dans la
  journée (retrait du mapping) :
  - `performerName`/`sponsor`/`openingActName` : 3 nouvelles colonnes nullable sur `Event`
    (migration `20260728160000_event_performer_sponsor_openingact_fields`), ajoutées à
    `CreateEventDto`/`UpdateEventDto` (dérivé via `PartialType`) et passées telles quelles dans
    `events.service.ts` (`create()` direct, `update()` en spread conditionnel `!== undefined`,
    même idiome que les autres champs texte libre). Re-proposées au mapping CSV (`eventFields`) et
    ajoutées au formulaire manuel (`EventFormDrawer.vue`) et à l'éditeur `EventDetailsEditor.vue`
    (dont `performerName`, utilisé par le scoring de similarité prédictive,
    `predictiveAnalytics.js`) — via `EventPredictView.buildEventPatchPayload`/`pickEventOverride`.
  - `allSessions` : pas de nouvelle colonne — c'est la **source** d'un vrai parsing multi-sessions
    (voir [BUG-240-02](240_02_csvimportdrawer_sessions_multiples_non_parsees.md)), pas un champ
    scalaire à stocker tel quel.

## Risque de régression / à surveiller

- **Migration en attente d'application** : `20260728160000_event_performer_sponsor_openingact_fields`
  a été écrite (3 `ALTER TABLE ... ADD COLUMN` nullables, non destructif) mais **pas encore
  appliquée à la base** — nécessite `npm run db:deploy` (ou `prisma migrate deploy`) côté backend
  avant que ces champs ne soient réellement persistables. Tant que ce n'est pas fait, `POST
  /events`/`PATCH /events/:id` avec ces champs échouera (colonne inconnue en base).
- Non vérifié en navigateur (contrainte de session, cf. BUG-236-02/BUG-237-02) : après application
  de la migration, tester un import avec un espace/type/catégorie mappé sur une vraie valeur,
  vérifier sur la fiche événement créée que `spaceId`/`eventTypeId`/`performerName`/etc. sont bien
  posés, et qu'un import avec une valeur volontairement laissée sur "Ignorer" fait bien apparaître
  le résumé "Valeurs non associées" avant l'import et le décompte `missingAssociations` après.

## Références

- [BUG-136](136_csvimportdrawer_champs_hors_dto_400_garanti.md) — origine des 4 champs fantômes,
  décision produit tranchée le 2026-07-28 (option 1 : ajout au schéma)
- [BUG-236-02](236_02_csvimportdrawer_dropdowns_taxonomie_vides_sans_indication.md) — cause racine
  amont (dropdowns vides sans indication)
- [BUG-240-02](240_02_csvimportdrawer_sessions_multiples_non_parsees.md) — parsing multi-sessions de
  la colonne `allSessions`
- `backend/src/features/events/events.service.ts:184-218` (`resolveEventSpaceFields`/
  `resolveEventTaxonomyFields`, comportement `undefined` = skip, nécessaire pour PATCH — non modifié)
- `backend/prisma/migrations/20260728160000_event_performer_sponsor_openingact_fields/migration.sql`
