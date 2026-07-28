# BUG-242-02 — `bulkCreateEvents()` : variable `BATCH` non déclarée, `ReferenceError` dès plus de 5 events à créer

- **Statut** : 🟡 Corrigé non testé
- **Sévérité** : 🔴 Bloquant/impact business
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-28 (audit ciblé du domaine Événements, 4 agents en lecture intégrale)
- **Fichiers** : `src/components/integration/wizard/StepProcessTimeline.vue:1277`

## Symptôme

Dans la fonction `bulkCreateEvents()` (bouton "Créer et lier tout" du wizard d'intégration
Weezevent), la mise à jour de la progression référence une variable `BATCH` :

```js
this.bulkCreateEventsProgress = Math.min(i + BATCH, toCreate.length)
```

`BATCH` n'est déclarée nulle part dans le fichier — seules `BULK_PATCH_BATCH_SIZE` (10) et
`BULK_CREATE_BATCH_SIZE` (5) existent (lignes 588-589). Dès que `toCreate.length > 5` (plus d'un
lot de création), cette ligne lève une `ReferenceError`, capturée par le `catch` englobant
(ligne 1290) qui affiche un message d'échec générique — **sans jamais appeler `loadTimeline()`
ensuite**. Or les events du ou des lots déjà traités par `Promise.allSettled` ont bel et bien été
créés en base (et potentiellement liés au WeezeventEvent correspondant) avant que l'erreur ne soit
levée : l'utilisateur voit un échec alors que des events existent déjà, et la timeline affichée
reste périmée tant qu'il ne recharge pas la page manuellement.

## Cause racine

Coquille probable lors de l'introduction des constantes nommées `BULK_PATCH_BATCH_SIZE`/
`BULK_CREATE_BATCH_SIZE` — la ligne de calcul de progression n'a pas été mise à jour en même temps.

## Correction

Remplacé `BATCH` par `BULK_CREATE_BATCH_SIZE` (la constante pertinente ici, puisque cette ligne vit
dans la boucle de création par lots de `toCreate`, pas celle de patch).

## Risque de régression / à surveiller

- Corrigé par lecture de code (grep confirmant l'absence de toute déclaration de `BATCH` dans le
  fichier), **non exécuté en navigateur** (pas de `pnpm dev` dans cette session, règle du projet).
- À tester manuellement : lancer "Créer et lier tout" avec strictement plus de 5 events non
  mappés sur un tenant de test, vérifier que la barre de progression avance sur tous les lots, que
  le message final ("X events créés/liés") s'affiche sans erreur, et que la timeline est bien
  rafraîchie après.

## Références

- Aucune — bug inédit, non lié à BUG-214/219/220/221 (autres bugs déjà corrigés sur ce même
  fichier, portant sur d'autres aspects du wizard).
