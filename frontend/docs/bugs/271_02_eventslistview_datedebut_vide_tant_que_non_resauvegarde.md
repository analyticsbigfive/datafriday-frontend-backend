# BUG-271-02 — EventsListView : "Date de début" vide tant que l'événement n'a pas été ouvert puis resauvegardé

- **Statut** : 🟢 Corrigé (2026-08-02)
- **Sévérité** : 🟡 Mineur (affichage seul, aucune perte de donnée)
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-08-02 (signalé par l'utilisateur)
- **Fichiers** : `src/components/events/views/EventsListView.vue:555`,
  `src/components/events/drawers/CsvImportDrawer.vue:1309-1334` (`buildImportRow`)

## Symptôme

Dans le tableau `/events`, la colonne "Date de début" reste vide pour certains événements — jusqu'à
ce qu'on ouvre le drawer d'édition et qu'on sauvegarde une fois, après quoi la date apparaît.

## Cause racine

Deux défauts qui se combinent :

1. **Création** — les événements importés en CSV n'envoient jamais `eventStartDate` au payload de
   création (`CsvImportDrawer.vue`, `buildImportRow`) : le mapping CSV n'a qu'une seule colonne de
   date, `eventDate` (`aliases: ['event date', 'eventdate', 'date']`), aucune colonne "date de
   début" distincte. `events.service.ts` (`create()`) ne pose la colonne que si
   `dto.eventStartDate !== undefined` — jamais envoyée, elle reste `NULL` en base pour tout
   événement importé par CSV. Les autres chemins de création (`CreateEventDialog.vue`,
   `StepProcessTimeline.vue`) envoient bien `eventStartDate`, donc non affectés.
2. **Lecture** — `EventsListView.vue:555` (`mappedEvents`) ne faisait aucun repli sur `eventDate`
   quand `eventStartDate` est `null` : `e.eventStartDate || e.startDate || ''` (`e.startDate`
   n'existe d'ailleurs jamais sur la réponse `Event`, c'est un champ `WeezeventEvent`) → case
   vide. `EventFormDrawer.vue` (`initFormFromEvent`), lui, fait déjà ce repli à l'édition
   (`e?.eventStartDate || e?.eventDate`) — d'où l'impression que "sauvegarder corrige" : l'édition
   pré-remplit le champ requis "Date de début" depuis `eventDate`, et le save qui suit comble
   enfin la colonne en base.

## Correction

- `CsvImportDrawer.vue` : `buildImportRow` envoie désormais `eventStartDate: eventDate` (même
  valeur que `eventDate`, pas de colonne CSV dédiée — même convention que les autres chemins de
  création).
- `EventsListView.vue` : `mappedEvents` ajoute un repli sur `eventDate` —
  `e.eventStartDate || e.startDate || eventDate || ''` — pour que les événements déjà en base avec
  `eventStartDate = null` (créés avant ce correctif, ou par un futur chemin qui omettrait encore
  le champ) s'affichent correctement sans dépendre d'une resauvegarde manuelle.

## Risque de régression / à surveiller

- Les événements déjà importés par CSV avant ce correctif gardent `eventStartDate = NULL` en base
  (pas de backfill effectué) — ils s'affichent correctement grâce au repli front, mais un futur tri
  strictement sur la colonne backend `eventStartDate` (hors repli) resterait faux pour cet
  historique tant qu'aucun backfill n'est fait.
- Vérifier après déploiement : import CSV d'un nouvel événement → colonne "Date de début"
  visible immédiatement dans `/events`, sans ouvrir le drawer.

## Références

- [`docs/bugs/242_03_eventslistview_colonne_date_debut.md`](242_03_eventslistview_colonne_date_debut.md)
  — bug différent (colonne absente de l'en-tête), déjà corrigé, sans rapport avec cette fiche.
- [`docs/modules/07_EVENEMENTS.md`](../modules/07_EVENEMENTS.md) — domaine Événements.
