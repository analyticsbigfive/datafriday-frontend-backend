# BUG-201 — Fonctionnalité "configurer la prochaine location" entièrement câblée mais jamais utilisée

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟠 Majeur (fonctionnalité entière non fonctionnelle, silencieusement)
- **Domaine** : Intégrations & ventes (wizard)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-20 (audit ciblé `/data-integration/fb`)
- **Fichiers** : `src/components/integration/wizard/WizardSuccess.vue:33,45`,
  `src/components/integration/wizard/IntegrationWizard.vue:78,166`,
  `src/views/DataIntegrationView.vue:785-794`

## Symptôme

`WizardSuccess.vue` a une carte "autres locations à configurer" complète
(`v-if="otherLocations.length > 0"`, bouton émettant `configure-next`), relayée correctement par
`IntegrationWizard.vue` (`@configure-next="$emit('configure-next', $event)"`). Mais le seul point
de montage réel, `DataIntegrationView.vue:785-794`, ne passe jamais `:other-locations` à
`<IntegrationWizard>` (donc toujours `[]` par défaut) et n'écoute même pas `@configure-next`. La
carte ne s'affiche donc jamais, et même si elle s'affichait, l'événement émis n'aurait aucun
handler.

## Cause racine

Le contrat UI/événement (`WizardSuccess` → `IntegrationWizard` → parent) est complet et correct,
mais l'appelant en production n'a jamais été mis à jour pour fournir `otherLocations` ni gérer
`configure-next`.

## Correction

Rien à ce jour. Décider si la fonctionnalité doit être finie côté `DataIntegrationView.vue` (lui
passer la liste des locations non encore mappées + gérer l'événement pour enchaîner l'ouverture du
wizard sur la suivante) ou si le code doit être retiré comme mort.

## Risque de régression / à surveiller

Faible — la fonctionnalité n'a jamais été active en production, aucun changement de comportement
observable pour les utilisateurs actuels tant qu'on ne fait rien.

## Références

- `docs/modules/05_INTEGRATIONS_VENTES.md` (§ Écrans de transition, `WizardSuccess.vue`).
