# BUG-243-02 — `CreateEventDialog.vue` (wizard) : champs performer/sponsor/opening act absents

- **Statut** : 🟡 Corrigé non testé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Intégrations & ventes / Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-28 (audit ciblé du domaine Événements)
- **Fichiers** : `src/components/integration/wizard/dialogs/CreateEventDialog.vue`,
  `src/components/events/drawers/EventFormDrawer.vue` (référence), `src/i18n/translations.js`

## Symptôme

Le commit `7098379` ("feat: add performer, sponsor, and opening act fields to event form", même
jour) a ajouté `performerName`/`sponsor`/`openingActName` à `CreateEventDto` (backend) et au
formulaire principal `EventFormDrawer.vue` (`/events`). Le dialog de création d'event du wizard
d'intégration Weezevent (`CreateEventDialog.vue`, utilisé pour créer un event depuis une date non
couverte) n'a pas été mis à jour dans le même commit : aucun champ pour ces 3 informations, et le
payload `createEvent({...})` ne les envoie pas. Un event créé depuis ce wizard a donc toujours ces
3 champs à `null`/absent, contrairement à un event créé depuis `/events`.

## Cause racine

Le commit `7098379` a touché `EventFormDrawer.vue` mais pas `CreateEventDialog.vue` — deuxième
point d'entrée de création d'event, non repéré au moment du commit.

## Correction

- Ajout d'une section "Performer / Sponsoring" dans la partie "Plus d'options" de
  `CreateEventDialog.vue`, avec deux champs texte (`performerName`, `sponsor`) et un champ
  conditionnel (`openingActName`, affiché seulement si le toggle "Opening act" déjà existant est
  actif) — même convention que les toggles/chips voisins du dialog.
- Nouvelles clés i18n ajoutées (`intgCreateEvtSectionEntertainment`, `intgCreateEvtPerformerLabel`,
  `intgCreateEvtPerformerPlaceholder`, `intgCreateEvtSponsorLabel`,
  `intgCreateEvtSponsorPlaceholder`, `intgCreateEvtOpeningActNameLabel`,
  `intgCreateEvtOpeningActNamePlaceholder`) en `en`/`fr`, suivant la convention `intgCreateEvt*` déjà
  utilisée par tout le reste de ce dialog (contrairement à `EventFormDrawer.vue`, qui mélange
  labels français en dur et clés i18n — non reproduit ici).
- Les 3 champs sont réinitialisés dans le watcher `modelValue` (ouverture du dialog) et envoyés
  dans le payload `createEvent(...)` (`performerName || undefined`, etc., cohérent avec le style
  du reste du payload).

## Risque de régression / à surveiller

- `CreateEventDto` (backend) accepte déjà ces 3 champs en optionnel (`@IsOptional() @IsString()`)
  — aucun changement backend nécessaire.
- Non exécuté en navigateur. À tester manuellement : ouvrir "Créer un event" depuis une date non
  couverte du wizard, renseigner performer/sponsor/opening act (avec le toggle actif), créer
  l'event, vérifier dans `/events` que les 3 champs sont bien persistés.

## Références

- Commit `7098379` (ajout initial de ces champs à `EventFormDrawer.vue`/`CreateEventDto`).
