# BUG-157 — Domaine Événements : loading des `v-data-table` en noir (au lieu du rouge de marque) + navigation "événement lié" retirée (non fiable)

- **Statut** : 🟢 Corrigé (partiel — voir "Correction")
- **Sévérité** : 🟡 Mineur (UX)
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-19
- **Fichiers** :
  - `src/components/events/views/EventsTypeListView.vue:60`
  - `src/components/events/views/EventsCategorieListView.vue:60`
  - `src/components/events/views/EventsSubcategorieListView.vue:60`
  - `src/components/events/views/EventsListView.vue:75`
  - `src/components/events/drawers/TaxonomyDetailDrawer.vue`

## Symptôme

Deux retours utilisateur distincts après BUG-155/156 :
1. La barre de chargement des 4 `v-data-table` du domaine (`/events`, `/event-types`,
   `/event-categories`, `/event-subcategories`) s'affichait en noir/gris au lieu du rouge de
   marque utilisé partout ailleurs dans l'app.
2. Cliquer sur un événement dans la liste "Événements liés" de `TaxonomyDetailDrawer.vue`
   (introduite par BUG-153) n'ouvrait pas le bon événement sur `/events` — la navigation
   `?editEventId=<id>` ne restaurait pas la bonne fiche en usage réel.

## Cause racine

**1)** `:loading="loading"` (booléen) sur `v-data-table` : Vuetify n'applique le rouge de marque
(`theme.primary = #ff3131`, cf. `plugins/vuetify.js`) à la barre de progression que si un `color`
explicite est fourni ou déduit — passer un booléen fait retomber sur `props.color` du tableau, non
défini ici, donc sur le rendu par défaut (gris/noir neutre de Vuetify), indépendamment du thème
configuré. Confirmé en lisant `VDataTableHeaders.js` (bundle Vuetify) : `loading` accepte aussi une
chaîne, auquel cas cette chaîne est utilisée **directement** comme couleur de la barre.

**2)** Cause racine non identifiée avec certitude — plusieurs hypothèses non tranchées (permission
`menu.events.manage` sur la route `/events` interceptant la navigation, timing de
`EventsListView.mounted()`/`activated()` vs `TaxonomyDetailDrawer.loadEvents()`, ou tout autre
facteur non reproductible sans navigateur). Pas de `pnpm dev` dans cette session pour investiguer
plus loin.

## Correction

**1)** `:loading="loading"` → `:loading="loading ? '#ff3131' : false"` sur les 4 `v-data-table`
(passe la couleur de marque directement en chaîne quand actif, `false` sinon pour ne pas afficher de
barre au repos).

**2)** Fonctionnalité retirée plutôt que corrigée à l'aveugle (décision utilisateur explicite : "si
pas possible d'ouvrir la sidebar de la bonne page d'édition, alors on retire") : les lignes
d'événements liés dans `TaxonomyDetailDrawer.vue` ne sont plus cliquables (retrait de `goToEvent()`,
du `@click`, de l'icône `ChevronRight`, du hover rouge) — la liste reste affichée (nom + date) mais
purement informative. Le mécanisme de deep-link `?editEventId=` lui-même (`EventsListView.vue`,
consommé par ailleurs par l'alerte "évènements sans coup d'envoi" de la timeline prédictive) n'est
**pas** retiré — son fix BUG-154 (hook `activated()` pour le cas `keep-alive`) reste valide
indépendamment de cet usage-ci.

## Risque de régression / à surveiller

Si la navigation "événement lié" est un jour réintroduite, la déboguer en navigateur réel avant de
la considérer acquise — cause racine de l'échec jamais confirmée ici.

## Références

- [BUG-153](153_taxonomie_view_popup_non_conforme_liste_evenements_absente.md) — introduction de `TaxonomyDetailDrawer.vue` et de la navigation aujourd'hui retirée.
- [BUG-154](154_eventslistview_deeplink_editeventid_casse_keepalive.md) — fix du mécanisme de deep-link lui-même, conservé (autre consommateur légitime).
