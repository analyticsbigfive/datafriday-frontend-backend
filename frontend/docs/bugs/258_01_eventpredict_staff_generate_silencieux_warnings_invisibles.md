# BUG-258-01 — Event Predict / onglet Staff : « Générer » silencieux (201 vide) et erreurs/warnings invisibles

**Statut : corrigé** — JLH

## Symptôme

Onglet Staff d'Event Predict, état vide : clic sur « Générer le staffing » → le POST
`events/:id/staffing/generate` part (201), mais rien ne change à l'écran — ni cartes PDV, ni
erreur, ni explication.

## Cause

Trois trous d'affichage combinés (`EventPredictStaffSection.vue`) :

1. **201 « vide » indiscernable d'un no-op** : côté backend (`staffing.service.ts`,
   `generate`), si aucun élément staffable n'est rattaché à la config, ou si tous les effectifs
   calculés sont à 0 (CA prédictif / pic Tx absents dans `ElementPerformance`), zéro ligne est
   créée et la réponse est un 201 valide avec `elements: []` — l'état vide se re-rend à
   l'identique, sans aucun warning.
2. **Warnings jetés** : les `warnings` backend (ex. `ROLE_A_CONFIGURER`) ne s'affichaient que
   dans la toolbar… qui n'est rendue que si `elements.length > 0`.
3. **Erreur invisible en régénération** : le bouton « Régénérer » de la toolbar n'avait aucun
   affichage de `generateError` (seul l'état vide l'avait).

## Fix

- **Backend** (`staffing.service.ts`) : deux nouveaux warnings dans le payload —
  `AUCUN_ELEMENT_STAFFABLE` (aucun PDV staffable dans la config) et `AUCUNE_LIGNE_GENEREE`
  (éléments présents mais tous les effectifs à 0, aucune ligne créée ni conservée).
- **Frontend** (`EventPredictStaffSection.vue`) :
  - bandeau `v-alert` dans l'état vide après une génération résolue sans lignes (flag local
    `hasGeneratedOnce`), listant les `warnings` backend, sinon message générique ;
  - `generateError` affiché aussi sous la toolbar (branche « lignes existantes ») ;
  - clés i18n `epsGenerateEmptyTitle` / `epsGenerateEmptyText` (FR/EN, `translations.js`).

## Vérification

1. Event sans performances prédites → « Générer » → bandeau warning explicite (plus de silence).
2. Event valide → cartes PDV apparaissent normalement.
3. Settings RH vides (goal TPE absent) → 400 → message d'erreur visible dans les deux branches.

## Cas réel vérifié (2026-07-31) — cause amont : prédiction de CA absente

Config `cmr8axbc80002sn07gcdh5ley` (space `cmovsjbiz01lzvwyn30wweqpf`), vérifié en base
(`datafriday-dev`) : **pas un bug du generate, problème de données en amont.**

- 18 éléments `shop` bien rattachés à la config (`ConfigurationElement`) → pas le cas
  `AUCUN_ELEMENT_STAFFABLE`.
- Mais les 18 lignes `ElementPerformance` de cette config ont toutes `revenue = 0` et
  `transactionsPerMinute = 0` → le calculateur (`staffing.service.ts:254`) reçoit
  `caPredictif: 0`, `peakTxParMin: 0` → effectifs 0 partout → 0 ligne créée → cas
  `AUCUNE_LIGNE_GENEREE` (`staffing.service.ts:380`). Comportement correct de l'algo.
- Si le bandeau affiche le texte générique anglais au lieu du warning français précis :
  le backend local tourne encore sur l'ancien code (sans `warnings`) — le redémarrer
  (`cd backend && pnpm start:dev`).

**Résolution données** : lancer/recalculer la prédiction de CA Event Predict pour cette config
(remplit `ElementPerformance.revenue` / `transactionsPerMinute`), puis regénérer le staffing —
les cartes PDV apparaissent. Requête de contrôle :

```sql
SELECT se.name, se.type, ep.revenue, ep."transactionsPerMinute"
FROM "ConfigurationElement" ce
JOIN "SpaceElement" se ON se.id = ce."elementId"
LEFT JOIN "ElementPerformance" ep
  ON ep."elementId" = se.id AND ep."configId" = ce."configId"
WHERE ce."configId" = 'cmr8axbc80002sn07gcdh5ley'
  AND se.type IN ('shop', 'fnb_food', 'fnb_beverages', 'fnb_bar', 'fnb_snack')
ORDER BY se.name;
```

Point à creuser côté backend : pourquoi la prédiction n'a pas rempli `ElementPerformance` pour
cette config — jamais lancée, ou pipeline en échec silencieux sur cet event ?
