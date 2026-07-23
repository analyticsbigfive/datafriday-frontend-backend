# BUG-019 — Aucun retry BullMQ sur la queue d'agrégation

- **Statut** : 🟢 Corrigé (2026-07-20)
- **Sévérité** : 🟡 Mineur
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-15 ; corrigé le 2026-07-20
- **Fichiers** : `queue.service.ts:264-283` vs `queue.module.ts:29-37`

## Symptôme

Provoquer un timeout DB transitoire pendant un `synchronize` : le job échoue définitivement, aucune
notification de relance automatique.

## Cause racine

La queue d'agrégation est configurée avec `attempts:1`, ce qui écrase explicitement le défaut
global `attempts:3` + backoff défini par ailleurs.

## Correction

Retiré l'écrasement local `attempts: 1` dans `queueAggregationJob` — hérite maintenant du défaut
global (`attempts: 3`, backoff exponentiel 2s). Le raisonnement du commentaire d'origine
("idempotent donc pas besoin de retry") était en fait inversé : l'idempotence est justement ce qui
**permet** un retry sûr après un échec transitoire, pas une raison de s'en priver. Confirmé
idempotent : `executeProcessEvents` fait un `deleteMany` puis ré-insère à chaque event (voir
BUG-014/015, corrigés dans la même session) — rejouer le job après un timeout DB transitoire ne
duplique rien.

## Risque de régression / à surveiller

Un job d'agrégation qui échoue pour une raison **non transitoire** (erreur de données, bug de
requête) sera maintenant retenté jusqu'à 3 fois avec backoff avant d'échouer définitivement, au lieu
d'échouer immédiatement — légèrement plus lent à remonter un vrai échec permanent, contrepartie
acceptable pour récupérer automatiquement des échecs transitoires.

## Références

- `datafriday-web/docs/modules/02_ANALYSE.md` §"Bugs actifs confirmés" #6
