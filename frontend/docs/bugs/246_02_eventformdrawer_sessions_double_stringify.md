# BUG-246-02 — `EventFormDrawer.vue` : chaque session ré-encodée en JSON avant l'envoi (double-stringify)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-29, en comparant un export CSV (`EventsListView.vue`) à son fichier
  source : la colonne "All Sessions (Doors|Show)" ressortait vide (`|`) pour deux events créés
  manuellement via le formulaire, alors que la base contenait bien des horaires.
- **Fichiers** : `src/components/events/drawers/EventFormDrawer.vue:926`,
  `src/components/events/views/EventsListView.vue` (`parseEventSessions`)

## Symptôme

Un event créé/modifié via `EventFormDrawer.vue` (pas via l'import CSV) perd ses horaires de
session dès qu'on les relit ailleurs que dans ce même formulaire (export CSV notamment) : la
colonne "Doors Open"/"Show Time" est vide, la colonne "All Sessions" ne contient que des `|`.
Vérifié en base (tenant "Big Five") : `sessions` valait
`"[\"{\\\"showTime\\\":\\\"19:00\\\",\\\"doorsOpening\\\":\\\"17:30\\\"}\"]"` — un tableau
contenant une **chaîne** JSON, pas un objet.

## Cause racine

`submit()` (`EventFormDrawer.vue:926`) envoyait
`sessions: this.newEvent.sessions.map((s) => JSON.stringify(s))` — chaque session était donc déjà
sérialisée en chaîne avant même d'entrer dans le payload Axios (qui sérialise l'ensemble en JSON de
toute façon). Côté backend, `EventsService.create()`/`update()` fait
`sessions: JSON.stringify(dto.sessions)` sur ce tableau déjà composé de chaînes → la valeur stockée
est un tableau de chaînes JSON, pas un tableau d'objets. `initFormFromEvent()` (même fichier,
lignes 800-806) avait déjà un repli défensif qui re-parse chaque élément-chaîne, ce qui masquait le
bug **à l'intérieur du formulaire lui-même** (l'édition réaffichait correctement les horaires) —
mais tout autre consommateur des données brutes (export CSV, autre vue) héritait du double-encodage.

C'est le même bug que celui décrit dans une session de travail précédente (référencée en interne
comme "BUG-250-02", jamais retrouvée sur disque sous ce nom) : le correctif documenté à l'époque
n'a en réalité jamais été appliqué au fichier.

## Correction

- `EventFormDrawer.vue:926` : `sessions: this.newEvent.sessions.map((s) => JSON.stringify(s))` →
  `sessions: this.newEvent.sessions` (le tableau d'objets est envoyé tel quel, la sérialisation
  JSON globale de la requête HTTP suffit).
- `EventsListView.vue` (`parseEventSessions`, utilisée par l'export CSV) : ajout du même repli
  défensif que `initFormFromEvent` — re-parse chaque élément si c'est encore une chaîne — pour que
  les events déjà persistés avec l'ancien double-encodage restent exportables correctement sans
  backfill.

## Risque de régression / à surveiller

- Pas de backfill des events déjà corrompus par l'ancien bug (ex. les deux events de test
  "Auxerre Vs Soyez"/"Auxerre Ipswitch ") — `parseEventSessions` les lit correctement grâce au
  repli, donc pas bloquant, mais leur `sessions` en base reste techniquement doublement encodé
  jusqu'à une réédition + sauvegarde (qui les réécrira au bon format).
- Aucun test unitaire existant sur `EventFormDrawer.vue`/`EventsListView.vue` — à vérifier
  manuellement : créer un event avec plusieurs sessions via le formulaire, exporter, confirmer que
  "All Sessions" contient les vraies heures.

## Références

- [253_02 (référencé en interne, absent du disque)] — le déplacement de la résolution des équipes
  côté backend a documenté ce même sessions-double-stringify dans une session antérieure sans que
  la fiche correspondante ait été réellement écrite ; cette fiche-ci fait foi.
