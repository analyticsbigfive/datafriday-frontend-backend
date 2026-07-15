# BUG-010 — `assign-shop-items` (batch) émis sans être déclaré dans `emits`

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟡 Mineur (fonctionnel en Options API, risque au portage `<script setup>`)
- **Domaine** : Prévision (Event Predict)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-15
- **Fichiers** : `EventPredictMenusSection.vue`, `handleSelectAllForShop` (ligne 2266) émet ; `emits` (lignes 932-941) ne liste que le singulier `assign-shop-item`

## Symptôme

Aucun aujourd'hui — Vue en Options API ne bloque pas un `$emit` non déclaré, donc ça fonctionne.

## Cause racine

`handleSelectAllForShop` émet `assign-shop-items` (pluriel/batch) mais seul le singulier
`assign-shop-item` est déclaré dans `emits`.

## Correction

Aucune à ce jour — ajouter `assign-shop-items` à `emits` pour documenter le contrat réel.

## Risque de régression / à surveiller

Un futur portage vers `<script setup>`/`defineEmits` perdrait cet événement silencieusement s'il
n'est pas déclaré au préalable.

## Références

- `docs/modules/01_EVENT_PREDICT_ALGORITHME.md` §"Bugs actifs confirmés" #4
