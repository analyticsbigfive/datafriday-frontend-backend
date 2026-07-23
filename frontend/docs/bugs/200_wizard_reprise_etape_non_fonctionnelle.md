# BUG-200 — "Reprendre où on s'était arrêté" ne fonctionne pas dans le wizard d'intégration

- **Statut** : 🟢 Corrigé (2026-07-20)
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

Dérivation locale (pas de réactivation de `getIntegrationProgress`, pas de nouvel appel API) :
nouvelle méthode `getCompletedStepsForIntegration(integration)` dans `DataIntegrationView.vue`
retourne `1` si `getSpaceForIntegration(integration)` trouve un mapping (espace déjà lié), `0`
sinon — seule donnée de progression déjà chargée en mémoire (`this.mappings`). `openWizard()` passe
maintenant `{ ...integration, completedSteps: this.getCompletedStepsForIntegration(integration) }`
comme `location` au wizard au lieu de l'objet intégration brut (qui n'avait jamais `completedSteps`).
Côté `IntegrationWizard.vue`, `data()` calcule `completed = min(location.completedSteps ?? 0,
lastStepForLocation)` et initialise `currentStep = min(completed + 1, lastStepForLocation)` et
`completedStepsList = [1..completed]` au lieu de `currentStep: 1` codé en dur — le wizard saute donc
à l'étape 2 (au lieu de re-proposer l'étape 1 déjà faite) dès que l'espace est mappé. `showOverview`
utilise la même variable locale `completed` plutôt que de relire `location.completedSteps`.

## Risque de régression / à surveiller

Corréler avec le nettoyage du code mort `mapping.api.js::getIntegrationProgress`/
`getAllIntegrationProgress` (actuellement 0 appelant vivant) : leur réactivation pourrait être la
solution la plus directe à ce bug plutôt qu'un nouveau calcul ad hoc.

## Références

- `docs/modules/05_INTEGRATIONS_VENTES.md:648` (comportement attendu tel que documenté).
