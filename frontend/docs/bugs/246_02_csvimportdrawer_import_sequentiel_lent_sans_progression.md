# BUG-246-02 — `CsvImportDrawer.vue` : import CSV strictement séquentiel (lent) et sans indicateur de progression

- **Statut** : 🟡 Corrigé non testé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-28, signalé par l'utilisateur (import réel d'~500 events, plus de
  3 minutes, écran bloqué sur un spinner indéterminé sans aucun compteur)
- **Fichiers** : `src/components/events/drawers/CsvImportDrawer.vue` (`doImport()`, écran "Résultats
  de l'importation")

## Symptôme

`doImport()` traitait les lignes du CSV **une par une**, avec un `await createEvent(payload)`
séquentiel dans une boucle `for` — chaque event attend la réponse complète du précédent avant de
démarrer. Pour ~500 lignes, à quelques centaines de ms par requête (POST `/events`, qui déclenche
en plus côté backend la tentative d'auto-link Weezevent), le temps total dépasse largement les
3 minutes observées. Pendant tout ce temps, l'écran "Résultats de l'importation" n'affichait qu'un
`v-progress-circular` **indéterminé** et le texte fixe "Importation en cours..." — aucun compteur,
aucune estimation, impossible de savoir si l'import avançait ou était bloqué.

## Cause racine

La boucle d'import n'avait jamais été parallélisée (contrairement à `bulkCreateEvents()` dans
`StepProcessTimeline.vue`, qui utilise déjà un lot concurrent de taille `BULK_CREATE_BATCH_SIZE=5`
pour le même type d'opération — création d'events en masse). Aucun état de progression
(compteur traité/total) n'existait dans le composant, uniquement un booléen `importLoading`.

## Correction

- **Vitesse** : la boucle séquentielle est remplacée par un traitement en lots de
  `IMPORT_CONCURRENCY = 5` events créés en parallèle (`Promise.all` par lot), même convention que
  `BULK_CREATE_BATCH_SIZE` dans `StepProcessTimeline.vue`. La logique de construction du payload
  par ligne (mapping des champs, résolution des FK taxonomie, calcul de `hasMissingAssociation`)
  est extraite dans une méthode dédiée `buildImportRow(row, rowNumber)`, réutilisée par le
  pré-filtrage de dédup et par l'exécution.
- **Dédup préservée sous concurrence** : le `Set existingKeys` (BUG-137) est mis à jour de façon
  **synchrone**, ligne par ligne, *avant* de lancer les requêtes du lot — deux lignes du même CSV
  partageant le même nom+date (doublon interne au fichier, pas seulement contre la base) sont donc
  toujours détectées, y compris quand elles tombent dans le même lot parallèle.
- **Progression visible** : deux nouveaux champs `importedCount`/`importTotal`, incrémentés à
  chaque ligne traitée (qu'elle aboutisse à une création, une erreur ou un skip). L'écran affiche
  désormais un `v-progress-circular` déterminé + un texte "X / Y événements traités" +
  une barre `v-progress-linear`, au lieu du spinner muet.
- Les erreurs collectées (nom manquant / doublon / échec API) sont retriées par numéro de ligne
  avant affichage — le traitement par lots ne les produit plus dans un ordre strictement croissant.

## Risque de régression / à surveiller

- Parallélisation par lots de 5 : même pattern que `StepProcessTimeline.bulkCreateEvents()`, déjà
  en production sur ce même domaine — accepté comme risque résiduel connu : si plusieurs events du
  même lot partagent la même date (mais des noms différents, donc pas un doublon), leurs tentatives
  concurrentes d'auto-link Weezevent (`EventWeezeventLinkService.relinkForTenantDate`, BUG-021)
  peuvent course-condition entre elles sur un WeezeventEvent candidat unique — cas déjà possible
  aujourd'hui via le wizard d'intégration, non aggravé par ce fix.
- `node --check`/parse `@vue/compiler-sfc` + `@babel/core` propres sur le fichier modifié (SFC et
  script syntaxiquement valides). Suite `pnpm test:unit` ciblée (`events.unit.spec.js`,
  `events.integration.spec.js`, 94 tests) verte — aucun test dédié à `CsvImportDrawer.vue`
  n'existe dans `tests/unit/` à ce jour.
- Non exécuté en navigateur. À tester manuellement avec un vrai fichier de plusieurs centaines de
  lignes : vérifier que le compteur avance de façon fluide, que le temps total baisse nettement
  (division par ~5 attendue, hors variance réseau), et que le décompte final
  (succès/doublons/erreurs) reste identique à celui d'avant le fix sur un même fichier.

## Références

- [[137_csv_import_events_sans_dedoublonnage]]
- [[214_stepprocesstimeline_weezeventmappings_jamais_rehydrate]] (pattern de lots concurrents déjà
  établi dans `StepProcessTimeline.vue`)
