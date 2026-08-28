# BUG-375-02 — "Tout agréger" : un échec sur UN event du lot est absorbé silencieusement, le job reste "réussi"

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur (un échec réel peut passer totalement inaperçu sur un gros lot)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : backend + frontend
- **Découvert le** : 2026-08-26 — analyse de "Tout agréger" demandée par KOUAME Ulrich après
  la série de fixes BUG-370/371/372-02, pour vérifier que le flux en lot ne cache pas le même
  genre de défaut.
- **Fichiers** :
  - `backend/src/features/aggregation/aggregation.service.ts` (`executeProcessEvents`, boucle
    `for (const event of events)`, bloc `catch (err)`)
  - `frontend/src/components/integration/wizard/StepProcessTimeline.vue` (`handleAggregateAll`)

## Contexte

Dans `executeProcessEvents`, chaque event du lot est traité dans son propre `try/catch` :

```ts
} catch (err) {
  results.push({ eventId: event.id, eventName: event.name, status: 'error', error: err.message });
}
```

Cette erreur n'est JAMAIS loggée (pas de `this.logger.error`, contrairement à
`AggregationProcessor.onFailed` qui ne se déclenche que si le job ENTIER rejette). Le job
continue sur l'event suivant, et à la fin `aggregationJobLog.status` est mis à `'completed'`
**inconditionnellement** (`aggregation.service.ts:756-759`), peu importe le contenu de `results`.

Côté front, `handleAggregateAll` ne regarde que le statut GLOBAL du job
(`bulkAggregateProgress?.status`) pour afficher succès/échec — jamais le détail `results` par
event. Sur un lot de 77 events (Jean Bouin, "Tout agréger"), si UN SEUL event lève une exception
(erreur réseau transitoire, donnée malformée, etc.), l'utilisateur voit "Agrégation terminée"
sans jamais savoir qu'un event a été silencieusement sauté.

## Fix

- Backend : à la fin de `executeProcessEvents`, `failedResults = results.filter(status==='error')`
  résumé dans `aggregationJobLog.error` (texte, `null` si aucun échec) et son compte dans
  `metadata.errorCount` — `status` reste `'completed'` (les autres events du lot ont bien
  réussi). Un `this.logger.warn(...)` explicite liste les events en échec (invisible avant ce
  fix, faute de tout logging). `getJobProgress` expose `errorCount` dans sa réponse.
- Frontend : `handleAggregateAll` et `handleProcessSingle` vérifient désormais `errorCount > 0`
  en plus de `status === 'failed'` — un lot `completed` avec des échecs affiche un message
  distinct (`intgTimelineBulkPartialFailure`) plutôt que le message de succès générique. Pour un
  event UNIQUE (`handleProcessSingle`), c'était plus grave qu'annoncé : un event seul qui échoue
  individuellement faisait afficher "Agrégation terminée" (succès) puisque le job restait
  `completed` — corrigé de la même façon.

Tests : `aggregation.service.spec.ts` — un event en échec dans un lot de 2 n'empêche pas la
complétion, résume l'erreur et le compte ; aucun échec → `error: null` (pas de résidu d'un run
précédent) ; `getJobProgress` expose `errorCount` correctement (présent et absent de `metadata`).

## Références

- [BUG-370-02](370_02_job_integrationid_incompatible_avec_integration_range.md),
  [BUG-371-02](371_02_frontiere_voisin_meme_jour_deux_integrations.md),
  [BUG-372-02](372_02_resolveseasoncontainer_scope_job_integrationid.md) — la série de fixes qui
  a motivé cette relecture de "Tout agréger" en profondeur.
