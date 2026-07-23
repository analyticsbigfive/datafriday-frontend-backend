# BUG-211 — Un échec de suppression de mapping ne produit strictement aucun indicateur visible

- **Statut** : 🟢 Corrigé (2026-07-20)
- **Sévérité** : 🟠 Majeur
- **Domaine** : Intégrations & ventes (wizard, étape 2)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-20 (audit ciblé `/data-integration/fb`)
- **Fichiers** : `src/components/integration/wizard/StepMapShops.vue:149-178`

## Symptôme

Quand un utilisateur démappe une location (sélectionne l'option vide), `updateMapping` supprime
`localMappings[locationId]` de façon optimiste (ligne 1383) *avant* d'appeler
`deleteLocationShopMapping`. Si ce DELETE échoue pour une raison non-409,
`savingRows[locationId]` passe bien à `'error'` — mais le template ne rend le badge d'erreur
(`sms-status--error`, ligne 167) que dans la branche `<template v-else>`, qui requiert que
`localMappings[item.id]` soit **truthy** (ligne 163). Comme la suppression a déjà vidé
`localMappings[locationId]`, la ligne tombe dans la branche "non mappée" (ligne 149) au lieu de
ça — branche qui n'a aucune notion d'état `savingRows==='error'` : la ligne se rend silencieusement
comme une location non mappée normale (boutons créer/suggestion), **sans aucun texte d'erreur,
aucun badge rouge, rien**. Pendant ce temps, le mapping peut toujours exister côté serveur (la
suppression a échoué), donc l'état client et serveur divergent complètement, sans que
l'utilisateur ait aucun moyen de s'en rendre compte avant un rechargement ou un 409 qui surgirait
plus tard sur une autre action.

## Cause racine

L'UI d'erreur est conditionnée à la branche "mappée" du `v-if/v-else`, mais l'échec que cela est
censé signaler (un DELETE raté) est précisément le cas qui fait basculer la ligne vers la branche
"non mappée".

## Correction

Résolu par le rollback ajouté pour BUG-210 : `deleteLocationShopMapping` n'a qu'un seul point
d'appel, dans `updateMapping` (branche `elementId == null`). Avec le rollback, un DELETE en échec
restaure `localMappings[locationId]` à sa valeur précédente (le mapping existant, donc truthy) au
lieu de le laisser supprimé — la ligne retombe donc dans la branche `v-else` ("mappée") du
template, qui affiche déjà le badge d'erreur (`sms-status--error`) quand
`savingRows[item.id] === 'error'`. Vérifié qu'aucun autre appelant de
`deleteLocationShopMapping` n'existe dans le fichier ; aucune modification de template n'a donc été
nécessaire.

## Risque de régression / à surveiller

Bug jumeau de BUG-210 (même méthode, même fichier), plus grave car totalement silencieux plutôt
que "juste" trompeur.

## Références

- BUG-210 (`updateMapping` sans rollback — cas de la création/modification).
