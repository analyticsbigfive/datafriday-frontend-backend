# BUG-369-02 — Aucun repère fiable club/intégration dans la liste "Couvertes" du step 4, mapping manuel non filtré par intégration

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur (ergonomie / garde-fou, pas de corruption de données)
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : les deux
- **Découvert le** : 2026-08-25 — KOUAME Ulrich, en testant le wizard PFC sur un space
  (Jean Bouin) partagé avec une 2ᵉ intégration (SFP) : "je peux faire le mapping de SFP ici même
  si je suis sur PFC ? ça va marcher ?"
- **Fichiers** :
  - `backend/src/features/events/events.service.ts` (`includeRelations`)
  - `frontend/src/components/integration/wizard/StepProcessTimeline.vue`

## Contexte

La liste "Couvertes" du step 4 affiche volontairement TOUS les events d'un space, toutes
intégrations confondues (PFC + SFP sur Jean Bouin) — utile pour avoir une vue d'ensemble. Mais
rien ne permettait de distinguer visuellement à quel club/intégration appartient chaque ligne, à
part le nom saisi manuellement par l'utilisateur ("PFC-Marseille", "SFP-Bordeaux") — une
convention, pas un contrôle du système. Un event mal nommé serait passé inaperçu.

Deuxième trou lié : le dialog "Mapper à un événement existant" (`MapEventToExistingDialog`,
ouvert depuis une date non couverte) proposait cette même liste complète sans filtre — depuis le
wizard PFC, rien n'empêchait de sélectionner par erreur un event SFP.

## Fix

- **Badge fiable** : `Event.integration` (id + name) inclus dans `includeRelations`
  (`events.service.ts`), affiché en badge à côté du nom de l'event dans la liste "Couvertes"
  — basé sur `Event.integrationId` (le vrai champ), pas sur le nom.
- **Filtre du dialog de mapping** : computed `mappableEvents`, même règle que le relink
  automatique de `bulkCreateEvents` (`!integrationId || integrationId === location.id`) —
  seuls les events sans intégration ou déjà de l'intégration courante sont proposés.
- **Reclassement manuel — 2 tentatives** :
  1. Un menu cliquable sur le badge (`v-menu` Vuetify inline, liste dérivée des events déjà
     chargés) a été implémenté puis abandonné : comportement de clic erratique en usage réel
     (menu qui s'ouvre par intermittence), non reproductible en lecture de code ni sans
     navigateur. Retiré entièrement.
  2. Reparti sur le pattern déjà éprouvé du composant (`MapEventToExistingDialog`, `<select>`
     natif dans un `v-dialog`) plutôt qu'un `v-menu` inline par ligne : bouton dédié "Changer"
     à côté de "Démapper" sur chaque ligne couverte, ouvrant `ChangeEventIntegrationDialog.vue` →
     `updateEvent(id, {integrationId})`. La liste des intégrations proposées vient d'un vrai
     endpoint (`GET /spaces/:id/integrations`, `spaces.service.ts::getSpaceIntegrations`) — plus
     fiable que la dérivation depuis les events déjà chargés (révèle aussi une intégration
     n'ayant encore aucun event taggué) — mis en cache côté front 15 min
     (`store/modules/spaceIntegrations.js`, même pattern que `spaceShops.js`), le nombre
     d'intégrations d'un space changeant rarement.

## Risque de régression / à surveiller

- `spaceIntegrations` (liste proposée dans le menu) est dérivée des events déjà chargés dans le
  wizard, pas d'un endpoint dédié "intégrations du space" (aucun n'existe) — une intégration du
  space qui n'a encore AUCUN event taggué n'apparaîtrait pas dans le menu tant qu'aucun badge ne
  la révèle.
- Le badge nécessite un redémarrage backend (nouveau champ `include`) pour apparaître.

## Références

- [BUG-368-02](368_02_event_integrationid_mode_robuste_remplace_conteneur_saison.md) — le champ
  `Event.integrationId` que ce badge rend enfin visible.
- [BUG-370-02](370_02_job_integrationid_incompatible_avec_integration_range.md) — trouvé en
  creusant les données révélées par ce badge (deux events du même space, mêmes chiffres).
