# BUG-376-02 — La purge avant réagrégation ne nettoyait pas les résidus tagués sur une AUTRE intégration, en mode integration-range

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🔴 Critique (chiffres affichés = mélange d'un résidu périmé + des vraies données)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : backend
- **Découvert le** : 2026-08-26 — KOUAME Ulrich, en constatant que PFC-Dijon (fem) et
  SFP-Montauban (06/09/2025, Jean Bouin) affichaient encore des chiffres suspects après les
  fixes BUG-370/371/372-02 : "tu peux vérifier ce qu'on a dans la BD ? [...] c'est pas du tout
  bon."
- **Fichiers** : `backend/src/features/aggregation/aggregation.service.ts` (`executeProcessEvents`,
  `deleteWhere`)

## Contexte

Vérifié en base : `PFC-Dijon (fem)` avait DEUX lots de lignes simultanés dans
`SpaceRevenueMinuteAgg` pour le même `weezeventEventId` :
- 869 lignes taguées `integrationId = SFP`, du 24/08 (résidu de l'ancien pipeline, avant que cet
  event ait son propre `Event.integrationId`) — **33 325,98 €**.
- 116 lignes taguées `integrationId = PFC`, du 26/08 (fraîches, correctes) — **1 975,41 €**.

Total affiché : 985 points (869 + 116) — un mélange d'un résidu périmé et des vraies données.

La purge (`deleteWhere`, BUG-317-02 puis BUG-372-02) scope la suppression sur
`window.integrationId` (celle de l'EVENT, en mode `integration-range`) — pensée pour ne jamais
effacer la contribution légitime d'une AUTRE intégration sur un event PARTAGÉ. Mais depuis
BUG-368-02, un event avec `Event.integrationId` posé n'est plus jamais "partagé" — il appartient
EXCLUSIVEMENT à cette intégration. Toute ligne taguée avec une intégration DIFFÉRENTE pour ce
MÊME `weezeventEventId` est donc forcément un résidu de l'ancien pipeline (container-range/range,
avant migration), jamais une contribution légitime — mais la purge scopée la laissait
indéfiniment de côté, à chaque re-agrégation.

## Fix

En mode `integration-range`, la purge n'est plus scopée par `integrationId` du tout — suppression
totale des lignes de ce `weezeventEventId`, quelle que soit l'intégration qui les a taguées. Le
`INSERT` qui suit reste lui-même scopé correctement (`t.integrationId = event.integrationId`
dans `matchClause`), donc aucune donnée légitime n'est perdue — seul un résidu historique
peut disparaître, ce qui est le but recherché. Les modes legacy (`range`/`container-range`/`exact`)
gardent le scoping par `integrationId` du job à l'identique (rationale BUG-317-02 intacte pour
ces events qui, eux, peuvent réellement être partagés).

Test de régression : `aggregation.service.spec.ts`, réécrit pour vérifier une purge SANS filtre
`integrationId` en mode `integration-range`.

## Action requise (pas automatique)

Cette purge ne s'applique qu'AU PROCHAIN "Agréger"/"Relancer" sur l'event concerné — elle ne
nettoie rien rétroactivement toute seule. **Relancez "Agréger" sur PFC-Dijon (fem) et
SFP-Montauban** (et tout autre event double-affiche déjà migré vers `integration-range`) pour
purger les résidus et obtenir des chiffres propres.

## Références

- [BUG-368-02](368_02_event_integrationid_mode_robuste_remplace_conteneur_saison.md) — rend un
  event exclusif à une seule intégration, ce qui invalide la rationale originale de BUG-317-02
  pour ces events-là.
- [BUG-372-02](372_02_resolveseasoncontainer_scope_job_integrationid.md) — avait déjà corrigé le
  SCOPE de la purge (integrationId de l'event, pas du job) sans remettre en cause LE PRINCIPE de
  la scoper du tout en mode integration-range.
