# BUG-166 — Analyse : `futureEventsCount` en double (getter store mort `>` vs computed vivant `>=`)

- **Statut** : 🟢 Corrigé (2026-07-18)
- **Sévérité** : 🟢 Faible (code mort + écart sémantique dormant)
- **Domaine** : Analyse & agrégation
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-15 (bug #10 de `docs/modules/02_ANALYSE.md`)
- **Fichiers** : `src/store/modules/analyse.js` (getter supprimé), `src/components/analyse/AnalyseView.vue` (computed conservé)

## Symptôme

Aucun visible — mais deux implémentations coexistaient avec des conditions différentes : le getter
store comptait les events strictement futurs (`d > today`), le computed local d'`AnalyseView.vue`
inclut l'event du jour (`d >= today`). Un event ayant lieu le jour même aurait donné deux
comptages différents selon la source consultée.

## Cause racine

Le getter store n'était lu nulle part (`store.getters['analyse/futureEventsCount']` : zéro
occurrence, grep exhaustif) — `AnalyseView.vue` avait recodé sa propre version locale, avec la
condition `>=` (choix cohérent : un event du jour est encore prédictible).

## Correction

2026-07-18 : getter store supprimé. La version locale d'`AnalyseView.vue` (condition `>=`)
devient l'unique implémentation, avec un commentaire actant la sémantique « l'event du jour
compte comme futur ».

## Risque de régression / à surveiller

Aucun (code supprimé jamais lu). `eventDateOf` reste utilisé par d'autres getters du store.

## Références

- `docs/modules/02_ANALYSE.md` §"Bugs actifs confirmés" #10.
