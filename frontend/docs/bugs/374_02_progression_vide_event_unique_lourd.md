# BUG-374-02 — Barre de progression figée ("vide") pendant tout le traitement d'un event lourd, seul ou dans un lot

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur (UX — aucun impact sur la correction des données)
- **Domaine** : Analyse & agrégation / Intégrations & ventes
- **Repo(s) concerné(s)** : backend (source du défaut) + frontend (où il se voit)
- **Découvert le** : 2026-08-26 — KOUAME Ulrich, après le fix BUG-372-02 : "un vide qui dure
  longtemps avant la mise à jour de l'interface frontend" en cliquant "Agréger" sur
  SFP-Cardiff (qui traite désormais ses vraies 6327 transactions au lieu de 100).
- **Fichiers** :
  - `backend/src/features/aggregation/aggregation.service.ts` (`executeProcessEvents`,
    `getJobProgress`)
  - `frontend/src/components/integration/wizard/StepProcessTimeline.vue`
    (`handleProcessSingle`, `handleAggregateAll`)

## Contexte

Vérifié en base : le run qui a enfin correctement agrégé SFP-Cardiff a pris **27 secondes**
(`startedAt` → `completedAt`), contre 2-5 s pour les runs précédents qui ne trouvaient rien
(BUG-370/371/372-02, avant fix).

`getJobProgress` (aggregation.service.ts:918-949) calcule le pourcentage sur
`job.transactionsProcessed / eventIds.length` — un compteur incrémenté **une seule fois par
EVENT entier traité** (`processedCount++`, après tous ses `$executeRaw` + rollup). Pour un clic
"Agréger" sur **un seul** event (`eventIds.length = 1`), ce compteur ne bouge JAMAIS avant la fin
— le front reste bloqué sur "Initialisation..." 0% pendant toute la durée du traitement, puis
saute d'un coup à 100%. Pour "Tout agréger" (plusieurs events), la progression est plus fluide
event par event, mais si UN event du lot est lourd (comme SFP-Cardiff), la barre reste figée sur
son palier le temps de son traitement avant d'avancer au suivant.

Pas un bug de données — uniquement un manque de granularité dans le suivi de progression.

## Fix

3 paliers intermédiaires posés DANS le traitement d'un seul event, après chacune des 3 premières
grosses étapes SQL (agrégat minute `SpaceRevenueMinuteAgg`, agrégat produit/jour
`SpaceProductRevenueDailyAgg`, agrégat minute×article `SpaceRevenueMinuteItemAgg`) — le rollup
`Event` final coïncide avec la fin normale de l'event (palier 4/4 implicite). Portés par
`metadata.currentEventStep`/`currentEventTotalSteps` (JSON, pas de migration), remis à 0 dès
l'event terminé pour ne pas fausser la fraction pendant l'event suivant.

Volontairement **pas** de changement de l'échelle/sens de `transactionsProcessed` (compte
d'events ENTIÈREMENT traités, colonne `Int`, lu ailleurs) — la granularité fine vit uniquement
dans `metadata`, combinée par `getJobProgress` : `percentage = (current + currentEventStep /
currentEventTotalSteps) / total`.

Tests : `aggregation.service.spec.ts` — vérifie les paliers posés dans l'ordre (1/4, 2/4, 3/4,
puis 0) et le calcul de `percentage`/`phase` côté `getJobProgress` (avec et sans metadata,
non-régression du comportement précédent quand absente).

## Références

- [BUG-370-02](370_02_job_integrationid_incompatible_avec_integration_range.md),
  [BUG-371-02](371_02_frontiere_voisin_meme_jour_deux_integrations.md),
  [BUG-372-02](372_02_resolveseasoncontainer_scope_job_integrationid.md) — les fixes qui ont
  rendu ce trou de progression visible (SFP-Cardiff traite désormais 60× plus de transactions
  qu'avant, d'où un temps de traitement bien plus long qu'auparavant).
