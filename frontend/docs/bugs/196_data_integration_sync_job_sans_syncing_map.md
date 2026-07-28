# BUG-196 — La sync par job (bissection) ne bascule jamais `syncingMap` : pas de spinner, pas de garde anti double-clic

- **Statut** : 🟢 Corrigé (2026-07-20)
- **Sévérité** : 🟠 Majeur
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-20 (audit ciblé `/data-integration/fb`)
- **Fichiers** : `src/views/DataIntegrationView.vue:1365-1375` (routage), `:1624-1645`
  (`handleSyncJob`), template `:148-160` (bouton lié à `syncingMap`)

## Symptôme

Quand des dates `fromDate`/`toDate` sont renseignées, `handleSync` route vers `handleSyncJob` et
retourne avant d'atteindre la garde `syncingMap` (qui ne protège que le chemin legacy).
`handleSyncJob` ne touche jamais `syncingMap`. Résultat : le bouton "Synchroniser" ne montre jamais
le spinner/`sync-btn--loading` et n'est jamais `:disabled` pendant une sync par job — un utilisateur
peut cliquer plusieurs fois de suite et déclencher plusieurs `startWeezeventSyncJob` en parallèle.
Le backend ne rejette un doublon que si un job est déjà `COLLECTING` (409) — sans garde
client, la fenêtre de course est réelle avant que le premier appel n'ait eu le temps de créer le
job.

## Cause racine

`syncingMap[integration.id] = true` n'est posé que dans la branche legacy
(`DataIntegrationView.vue:1396`) ; la branche job n'a pas l'équivalent.

## Correction

`handleSyncJob` (`DataIntegrationView.vue`) pose désormais `syncingMap[integration.id] = true` en
tout premier, avant l'appel `startWeezeventSyncJob`, et le nettoie dans un bloc `finally` (ajouté)
qui retire la clé de `syncingMap`. Le bouton "Synchroniser" (`:disabled`/`sync-btn--loading` liés à
`syncingMap[integration.id]`) est donc bien désactivé pendant la durée de l'appel de démarrage du
job, empêchant les double-clics qui déclenchaient plusieurs `startWeezeventSyncJob` en parallèle.
Le nettoyage est indépendant du polling du job/dialog qui prend le relais ensuite.

## Risque de régression / à surveiller

Vérifier que le nettoyage de `syncingMap` dans `handleSyncJob` ne casse pas le flux job normal (le
polling du job/dialog reste indépendant de cette map).

## Références

- BUG-204 (syncJobId jamais réinitialisé — même zone de code, sync par job).
