# BUG-242-03 — EventsListView : ajout de la colonne « Date de début »

> Note : ce n'est pas un défaut mais une **amélioration** UI, tracée ici à la demande pour garder
> l'historique des changements du module Événements au même endroit que les bugs.

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟡 Mineur (amélioration UI, aucun impact données)
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-29 · **Traité le** : 2026-07-29 (emmanuel)
- **Fichiers** : `components/events/views/EventsListView.vue`, `i18n/translations.js`

## Symptôme

Le tableau de la liste des événements (`/events`) n'affichait aucune **date de début** : les
colonnes étaient Espace / Nom / Catégorie / Revenu / Tickets scannés / Actions. Impossible de
repérer visuellement quand un événement commence sans ouvrir sa fiche.

## Cause racine

Simple omission d'affichage : la donnée existait déjà côté vue. `mappedEvents` expose bien
`eventStartDate` (`e.eventStartDate || e.startDate`) et un template de cellule
`#item.eventStartDate` (avec `formatDate`) était **déjà présent** dans le `<v-data-table>` — mais
aucune entrée correspondante n'était déclarée dans `tableHeaders`, donc la colonne n'était jamais
rendue.

## Correction

- **`tableHeaders`** : ajout de `{ title: t('eventsList.colStartDate'), key: 'eventStartDate' }` en
  **2ᵉ position, juste après la colonne Nom** (`key: 'name'`). Le rendu réutilise le template
  `#item.eventStartDate` existant (format `jj/mm/aaaa`, `-` si vide), la colonne est triable comme
  les autres colonnes de données.
- **i18n** : nouvelle clé `eventsListColStartDate` — « Date de début » (FR) / « Start Date » (EN).
  Volontairement distincte de `eventsListColDate` (`eventDate`) pour éviter toute confusion entre la
  date d'événement générique et la date de **début**.

## Risque de régression / à surveiller

- Aucun impact données (colonne d'affichage seule). À revérifier après rebuild : l'ordre des
  colonnes (Espace · Nom · **Date de début** · Catégorie · Revenu · Tickets · Actions), le tri, et
  l'affichage `-` pour les événements sans date de début.
- L'export CSV n'est pas modifié (il exportait déjà `eventStartDate` sous « Start Date »).

## Références

- [`modules/00_INDEX.md`](../modules/00_INDEX.md) — domaine Événements.
