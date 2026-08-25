# BUG-361-02 — "Créer et lier tout" crée un `Event` DataFriday de plusieurs mois à partir d'un conteneur de saison/site Weezevent/Digifood

- **Statut** : 🟢 Corrigé (code) — **9 events déjà corrompus en base, pas encore nettoyés**
- **Sévérité** : 🔴 Bloquant/impact business (CA agrégé faux, déjà visible)
- **Domaine** : Intégrations & ventes (wizard, étape 4) / Analyse & agrégation
- **Repo(s) concerné(s)** : les deux
- **Découvert le** : 2026-08-25 — en travaillant le step 4 pour Nantes, KOUAME Ulrich signale
  "j'ai vu un truc de SAISON, je sais pas trop d'où ça vient"
- **Fichiers** : `backend/src/features/aggregation/aggregation.service.ts:909-936`
  (`getStep4Context`) ; `frontend/src/components/integration/wizard/StepProcessTimeline.vue:1313-1327`
  (`bulkCreateEvents`, `unmappedCount`) ; `backend/src/features/events/events.service.ts:551-593`
  (`listAmbiguousWeezeventMatches`, 3ᵉ surface touchée par le même défaut, cf. "Correction")

## Symptôme

Sur les tenants où Weezevent groupe la billetterie par saison entière sous un seul id (AJ Auxerre,
Stade Français — cf. BUG-338-02), ou pour un site Digifood (cf. BUG-358-02), la liste
`weezeventEvents` affichée au step 4 pour mapping manuel contient ces conteneurs mélangés aux vrais
matchs, sans distinction. Cliquer "Créer et lier tout" (`bulkCreateEvents`) crée alors **un seul
`Event` DataFriday par conteneur**, avec `eventStartDate`/`eventEndDate` = début/fin de la saison
entière (271 à 356 jours de span) — au lieu d'aucun event (le conteneur ne représente aucun match).

**Vérifié en base, 9 events déjà créés par erreur avant ce fix**, tous tenant "Big Five Org", spaces
SFP et Auxerre : "SF - Saison 2019-20", "SF-saison 20-21", "Stade Français - Saison 2021-22",
"STADE FRANCAIS - SAISON 22-23", "STADE FRANÇAIS SAISON 23-24", "AJ AUXERRE - Saison 25/26" (×2),
"AJ AUXERRE - Saison 26/27" (×2, 2 spaces différents). **3 d'entre eux ont déjà du CA agrégé
dessus** : "AJ AUXERRE - Saison 25/26" (`fbfa4f8b-...`) 27 047 lignes / **689 964,26 €**, "SF -
Saison 2019-20" (`283764b8-...`) 212 lignes / 6 299,18 €, "AJ AUXERRE - Saison 26/27"
(`291d23d7-...`) 479 lignes / 4 907,09 € — tout le CA de la saison compté comme un seul "match".

## Cause racine

Deux défauts cumulés :
1. `getStep4Context` (`aggregation.service.ts:909-928`) renvoyait `weezeventEvents` sans aucune
   distinction entre match précis et conteneur — alors que `resolveSeasonContainerEventIds`
   (BUG-338-02/358-02) sait déjà les détecter, mais n'était appelé que côté agrégation
   (`executeProcessEvents`), jamais côté step 4.
2. `bulkCreateEvents` (frontend) traite `weezeventEvents` comme une liste de candidats matchs sans
   filtre, et transforme aveuglément chaque entrée non liée en `createEvent(...)`.

Une fois un tel Event créé et lié (`Event.weezeventEventId` = id du conteneur), l'agrégation ne le
traite pas en mode "exact" (le conteneur est bien détecté comme tel par `seasonContainerIds`), mais
retombe en mode "range" — qui, depuis BUG-360-02, calcule la fenêtre à partir des dates de CET
Event, qui EST le faux event de plusieurs mois. La fenêtre engloutit alors tout le CA de la saison.

## Correction

- `getStep4Context` calcule désormais `seasonContainerIds` (réutilise
  `resolveSeasonContainerEventIds`) et pose `isSeasonContainer: boolean` sur chaque entrée de
  `weezeventEvents`.
- `bulkCreateEvents` exclut les entrées `isSeasonContainer` de `toCreate` — ne les crée plus jamais.
- `unmappedCount` (bandeau "X events non mappés") exclut aussi les conteneurs — ils ne seront
  jamais individuellement mappables, ne doivent plus être comptés comme "à faire".
- **3ᵉ surface découverte le même jour, sur un tenant réel** : le banner "événement ambigu" (`listAmbiguousWeezeventMatches`, résolution manuelle BUG-021) proposait lui aussi un conteneur
  comme candidat — cas réel observé : l'event de test "FCN Test pas d'event passé" (tenant Big
  Five Org) se voyait proposer "PARIS FOOTBALL CLUB SAISON 26 - 27" comme correspondance possible.
  Filtré directement en SQL (span déclaré ≤ `INTERVAL '2 days'` OU `endDate` absent, ET
  `metadata->>'provider'` ≠ `'digifood'`) plutôt que de réutiliser `resolveSeasonContainerEventIds`
  (éviterait une dépendance croisée `EventsService`→`AggregationService`, cf. risque de cycle de
  modules déjà documenté en BUG-021). Vérifié en base : 0 ligne retournée après fix pour le cas
  réel (contre 1 avant).

## Risque de régression / à surveiller

- **Les 9 events déjà corrompus ne sont PAS nettoyés par ce fix** (pas de backfill/suppression
  fait) — décision explicite à prendre : suppression, ou déliaison (`weezeventEventId = null`) +
  correction de `eventStartDate`/`eventEndDate` ? Les 3 avec CA déjà agrégé nécessitent en plus un
  `delete` sur leurs lignes `SpaceRevenueMinuteAgg`/`ItemAgg` pour ne pas laisser un CA faux visible.
- Aucune indication visuelle dans le step 4 pour un conteneur non créable (juste retiré du compte
  et de la création) — un utilisateur pourrait se demander où est passée une entrée qu'il voit dans
  `weezeventEvents` mais qui n'apparaît jamais mappable. Pas traité dans ce fix (périmètre : bloquer
  la corruption, pas peaufiner l'UX de la liste).
- Aucun test unitaire/e2e ajouté (frontend, pas de suite Jest sur ce composant à ce jour).

## Références

- [BUG-338-02](338_02_stade_jean_bouin_agregation_vide_events_saison_vs_match.md),
  [BUG-358-02](358_02_digifood_conteneur_site_cold_start_non_detecte.md) — détection des
  conteneurs, réutilisée ici côté step 4.
- [BUG-360-02](360_02_aggregation_fenetre_doorsopening_tronque_ventes_avant_match.md) — le calcul
  de fenêtre par dates d'Event dont ce bug exploite la faille pour un Event corrompu.
- [BUG-362-02](362_02_bulkcreateevents_agregation_jamais_declenchee_automatiquement.md) — bug
  distinct découvert dans la même investigation ("Analyse vide dès que je fais une data
  integration").
