# BUG-91 — `getMenuKpis`/`getEventKpis` : findMany du tenant entier + agrégation JS

- **Statut** : 🟢 Corrigé (en code, non déployé)
- **Sévérité** : 🟡 Mineur/perf
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `api-datafriday-staging`
- **Découvert le** : 2026-07-18
- **Fichiers** : `src/features/analyse/analyse.service.ts:40-104` (avant fix)

## Symptôme

Chaque appel rapatriait **tous** les MenuItems (resp. tous les Events) du tenant pour les réduire en JS (`reduce`/`filter`) : payload DB et latence croissant linéairement avec la taille du tenant, pour ne renvoyer que ~7 scalaires.

## Cause racine

Agrégation faite côté application au lieu de SQL.

## Correction

2026-07-18 : réécrits en agrégats SQL —
- `getMenuKpis` : 1 requête agrégat (`COUNT/AVG/FILTER`) + 1 `GROUP BY typeId` (au lieu de N lignes).
- `getEventKpis` : 1 requête single-pass (+ scoping `spaceId` optionnel, cf. BUG-89).
**Parité comportementale conservée** : NULL compté comme 0 dans les moyennes (`AVG(COALESCE(x,0))`, PAS `AVG(x)` qui ignore les NULL), mêmes seuils marge (0<m<30 / ≥60), même arrondi 2 décimales. Specs de parité : `analyse.service.spec.ts` (assertions « exactement 2 requêtes SQL, findMany plus jamais appelé »).

## Risque de régression / à surveiller

Les chiffres NE doivent PAS bouger (garde-fou audit : renvoi BUG-15/30 pour les ambiguïtés de sémantique, non touchées ici). Vérifier en staging qu'un tenant réel donne les mêmes valeurs avant/après.

## Références

- BUG-89, BUG-15, BUG-30
