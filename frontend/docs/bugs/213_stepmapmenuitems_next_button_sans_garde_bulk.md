# BUG-213 — Le bouton "Suivant" du wizard n'est pas bloqué pendant un bulk-create/bulk-price-apply en cours

- **Statut** : 🟢 Corrigé (2026-07-20)
- **Sévérité** : 🟠 Majeur
- **Domaine** : Intégrations & ventes (wizard, étape 3)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-20 (audit ciblé `/data-integration/fb`)
- **Fichiers** : `src/components/integration/wizard/StepMapMenuItems.vue:312` (bouton),
  `:889-891` (`hasPendingSaves`), `:1729-1992` (`bulkCreateAndMap`), `:1331-1352`
  (`applyAllPrices`)

## Symptôme

`:disabled="mappedCount === 0 || hasPendingSaves"` (ligne 312), et `hasPendingSaves` (889-891)
n'inspecte que `this.savingRows`. Ni `bulkCreateAndMap` (qui utilise `bulkCreateRunning`, jamais
`savingRows`) ni `applyAllPrices` (`applyAllRunning`, pareil) ne sont vérifiés. Repro : cliquer sur
"Créer et mapper tout" (`bulkCreateAndMap`, opération de plusieurs secondes/minutes qui synchronise
tout le catalogue Weezevent, crée des centaines/milliers de `MenuItem`s par lots, et les mappe en
masse — lignes 1729-1992), puis cliquer immédiatement sur "Suivant" dans le pied du wizard. Rien ne
bloque : l'utilisateur passe à l'étape 4 (`StepProcessTimeline`) pendant que la création/le mapping
en masse de l'étape 3 continue d'écrire en arrière-plan. Même chose pour `applyAllPrices`.

## Cause racine

`hasPendingSaves` a été conçu autour du seul flux de sauvegarde de mapping ligne-par-ligne et n'a
jamais été étendu quand les fonctionnalités de création en masse et d'application de prix en masse
ont été ajoutées.

## Correction

`hasPendingSaves` (computed, `StepMapMenuItems.vue`) étend désormais sa condition à
`bulkCreateRunning` et `applyAllRunning`, en plus de `savingRows` :

```js
hasPendingSaves() {
  return this.bulkCreateRunning || this.applyAllRunning
    || Object.values(this.savingRows).some(s => s === 'saving')
},
```

Choix : étendre `hasPendingSaves` lui-même plutôt que d'ajouter les deux flags directement dans le
binding `:disabled` du bouton, car c'est le seul point de vérité déjà utilisé à la fois par le
bouton "Suivant" (`:disabled`, spinner) et par `handleSave` (garde en tête de méthode) — un seul
endroit à maintenir si d'autres flags "opération longue" apparaissent. Le bouton "Suivant" est
donc désormais aussi bloqué pendant `bulkCreateAndMap` et `applyAllPrices`, pas seulement pendant
une sauvegarde ligne-par-ligne.

## Risque de régression / à surveiller

Vérifier le comportement si l'utilisateur ferme complètement le wizard (pas juste "Suivant")
pendant un bulk-create — la même classe de risque s'applique probablement là aussi.

## Références

- BUG-210 (StepMapShops, même classe de problème : état "en cours" pas assez gardé).
