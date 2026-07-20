# BUG-200 — "Reprendre où on s'était arrêté" ne fonctionne pas dans le wizard d'intégration

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟠 Majeur
- **Domaine** : Intégrations & ventes (wizard)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-20 (audit ciblé `/data-integration/fb`)
- **Fichiers** : `src/components/integration/wizard/IntegrationWizard.vue:193,199` (`currentStep`,
  `showOverview`), `src/views/DataIntegrationView.vue` (`toCard`/`toDigifoodCard`, ~827-890,
  `openWizard`, ~1713-1718)

## Symptôme

D'après `docs/modules/05_INTEGRATIONS_VENTES.md:648`, rouvrir le wizard pour une intégration déjà
partiellement mappée doit sauter directement à l'étape courante plutôt que réafficher l'écran
d'overview, et permettre de reprendre à la bonne étape. En pratique :
- `showOverview: !this.spaceId && (this.location?.completedSteps ?? 0) === 0` — `location.
  completedSteps` n'est jamais assigné nulle part (`toCard`/`toDigifoodCard` ne le posent pas),
  donc ce terme vaut toujours `0` ; `showOverview` ne dépend en réalité que de `!spaceId`
  (fonctionne "par coïncidence").
- `currentStep: 1` est codé en dur dans `data()`. Rien ne le dérive de la progression réelle
  (`completedStepsList` reste `[]` au départ et n'est jamais utilisé pour l'initialiser). Repro :
  une intégration Weezevent a déjà l'espace (étape 1) ET les shops (étape 2) mappés lors d'une
  session précédente ; à la réouverture, `showOverview` est correctement `false` (grâce à
  `spaceId`), mais `currentStep` reste `1` — l'utilisateur doit re-cliquer sur une étape déjà faite
  avant d'atteindre la première étape réellement incomplète.

## Cause racine

Aucun mécanisme ne calcule/transmet la progression réelle (`completedSteps`) depuis
`DataIntegrationView.vue` vers `IntegrationWizard.vue`. `StepMapSpace.vue` lui-même se comporte
correctement (lit `initialSpaceId` depuis le vrai mapping existant) — le défaut est un niveau
au-dessus, dans l'orchestrateur.

## Correction

Rien à ce jour. Calculer `completedSteps`/`currentStep` à l'ouverture du wizard à partir de la
progression réelle (ex. `getIntegrationProgress`, actuellement mort côté frontend — voir
BUG-201-adjacent code mort — ou une dérivation locale des mappings déjà chargés par
`DataIntegrationView.vue`).

## Risque de régression / à surveiller

Corréler avec le nettoyage du code mort `mapping.api.js::getIntegrationProgress`/
`getAllIntegrationProgress` (actuellement 0 appelant vivant) : leur réactivation pourrait être la
solution la plus directe à ce bug plutôt qu'un nouveau calcul ad hoc.

## Références

- `docs/modules/05_INTEGRATIONS_VENTES.md:648` (comportement attendu tel que documenté).
