# BUG-011 — `update:viewMode` déclaré mais jamais émis

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟢 Mineur (à vérifier avant de compter sur cet événement)
- **Domaine** : Prévision (Event Predict)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-15
- **Fichiers** : `EventPredictMenusSection.vue`, `emits` (ligne 936)

## Symptôme

Aucun — mais un futur dev pourrait supposer à tort que cocher un onglet Shop/Item remonte l'info au
parent via cet événement.

## Cause racine

`update:viewMode` est déclaré dans `emits` mais un grep exhaustif du fichier ne trouve aucun
`$emit('update:viewMode', ...)`. Le changement de vue Shop/Item est en réalité piloté par un état
local (`shopStatusTab`/`itemTypeTab`) ou côté `EventPredictView.vue`.

## Correction

Aucune à ce jour — retirer la déclaration morte, ou câbler l'émission si le besoin existe
réellement.

## Risque de régression / à surveiller

Vérifier avant de supposer que cocher un onglet ici remonte l'info au parent.

## Références

- `docs/modules/01_EVENT_PREDICT_ALGORITHME.md` §"Bugs actifs confirmés" #5
