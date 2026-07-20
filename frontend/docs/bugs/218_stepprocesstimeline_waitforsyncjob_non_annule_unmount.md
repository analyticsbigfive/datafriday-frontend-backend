# BUG-218 — `waitForSyncJob` (poll 2.5s/10 min) n'est jamais annulé si le composant est démonté

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟠 Majeur
- **Domaine** : Intégrations & ventes (wizard, étape 4)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-20 (audit ciblé `/data-integration/fb`)
- **Fichiers** : `src/components/integration/wizard/StepProcessTimeline.vue:976-991` (boucle),
  `:794-796` (`unmounted()`)

## Symptôme

`unmounted()` ne nettoie que `this.timerInterval` (le ticker de secondes écoulées). La boucle
`while (Date.now() - start < MAX_WAIT_MS)` de `waitForSyncJob` n'a aucune garde de démontage. Comme
`IntegrationWizard.vue` démonte `StepProcessTimeline` en changeant d'étape
(`v-else-if="currentStep === 4"`) et à la fermeture du wizard (`v-if="open"`), un utilisateur qui
déclenche la sync finale puis navigue en arrière ou ferme le wizard laisse cette boucle tourner en
arrière-plan — jusqu'à 10 minutes d'appels `checkProgress()` toutes les 2,5s contre un composant
qui n'existe plus (inoffensif mais gaspille des requêtes réseau et écrit dans un état réactif
orphelin).

## Cause racine

Aucune vérification de flag "toujours monté"/abandon à l'intérieur de la boucle `while`.

## Correction

Rien à ce jour. Ajouter un flag d'abandon posé dans `unmounted()`, vérifié à chaque itération de la
boucle.

## Risque de régression / à surveiller

Second mécanisme de poll similaire dans le même fichier (~120×1s pour le traitement par événement,
BUG-217) — envisager une factorisation commune plutôt que deux correctifs séparés.

## Références

- BUG-206 (même classe de fuite, autre composant).
- BUG-217 (second poll non coordonné dans le même fichier).
