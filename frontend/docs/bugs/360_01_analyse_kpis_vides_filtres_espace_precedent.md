# BUG-360-01 — Analyse : plus aucune vente ni KPI après un changement d'espace (hard refresh requis) — filtres jamais purgés

- **Statut** : 🟡 Corrigé non testé
- **Sévérité** : 🔴 Bloquant (page inutilisable après toute navigation inter-espaces)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `datafriday-frontend-backend` (frontend)
- **Découvert le** : 2026-08-24 (signalement JLH)
- **Fichiers** : `src/store/modules/analyse.js` (`CLEAR_SPACE_KEYED_CACHES`, `DEFAULT_FILTERS`,
  `filteredEvents`, `pruneFiltersToOptions`)

## En clair

En changeant d'espace, la page gardait en mémoire les filtres de l'espace précédent — notamment
la liste des matchs sélectionnés. Ces identifiants n'existant pas dans le nouvel espace, le
croisement « events du nouvel espace ∩ sélection de l'ancien » donnait un ensemble vide : zéro
vente, zéro KPI, définitivement. Seul un rechargement complet (qui réinitialise tout) faisait
revenir les chiffres. Le correctif oublie les filtres au moment du changement d'espace, comme un
rechargement l'aurait fait.

## Symptôme

Espace A avec un event sélectionné → sélecteur d'espace → espace B : bandeau KPI à 0 €/vide,
« 1 event(s) selected » résiduel, timeline « No timeline data available », panneau latéral vide.
Hard refresh sur B → tout s'affiche. La page « chauffe » en prime : les watchers/recalculs
tournent en boucle courte sur des périmètres vides à chaque interaction.

## Cause racine

`state.filters` survivait au changement d'espace :

- `CLEAR_SPACE_KEYED_CACHES` (`analyse.js`, seul point de purge au changement d'espace, gardé
  `prevSpaceId !== spaceId` dans `loadSpace`) purgeait les caches par clé et le contexte config
  (BUG-300-01) mais **pas les filtres** ;
- `resetFilters` n'est dispatché que sur la route Live et par le bouton « Reset filters » ;
- `filteredEvents` (`analyse.js:836`, intersection par id `:851`) croisait
  `filters.selectedEventIds` (ids de l'espace A) avec `state.events` (espace B) → ∅ →
  `filteredShopGranularData` ∅ → `kpiRecords` ∅ → `kpiSourceState` vide → 0 € partout ;
- `pruneFiltersToOptions` ne pouvait pas rattraper : sa table de dimensions n'a **pas d'entrée
  `selectedEventIds`**, et sa garde ne purge une dimension que si ses options sont non vides —
  jamais vrai sur un périmètre déjà vide.

Un hard refresh réinitialise Vuex à `DEFAULT_FILTERS()` — d'où la « guérison » au reload.

## Correction

2026-08-24, branche `fix/event-predict-deeplink-event-passe` :

- `CLEAR_SPACE_KEYED_CACHES` réinitialise désormais aussi `state.filters = DEFAULT_FILTERS()`.
  Point d'accroche choisi exprès : cette mutation n'est commise qu'au CHANGEMENT d'espace réel
  (un seul appelant, gardé), jamais au re-load du même espace ni sur la route Live (qui garde son
  propre `resetFilters`). Sémantique = celle du hard refresh.
- La restauration du deep-link `?config=` reste fonctionnelle : `ensureAuthAndLoad` la rejoue
  APRÈS `loadSpace` (le reset précède la restauration).
- Fix conjoint : BUG-359-01 (garde du watcher d'auto-ouverture timeline, côté vue).

## Risque de régression / à surveiller

- Les sliders attendance repartent sur `[0, 1 000 000]` jusqu'à la recalibration post-chargement
  (`ticketsSoldRange`/`ticketsScannedRange`) — identique au comportement d'un premier chargement.
- `selectedConfigurationId` est aussi remis à null : la validation existante de `loadSpace` et la
  restauration `?config=` couvrent les deux cas légitimes (config valide du nouvel espace via
  URL ; config invalide silencieusement écartée).
- Vérifier : A (filtres actifs, event sélectionné) → B : KPIs pleins sans refresh ; retour A :
  filtres repartis à zéro (assumé — comportement hard-refresh).

— JLH
