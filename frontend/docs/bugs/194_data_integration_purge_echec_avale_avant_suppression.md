# BUG-194 — Échec de purge des données avalé silencieusement avant la suppression de l'intégration

- **Statut** : 🔴 Ouvert
- **Sévérité** : 🟠 Majeur
- **Domaine** : Intégrations & ventes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-20 (audit ciblé `/data-integration/fb`)
- **Fichiers** : `src/views/DataIntegrationView.vue:1331-1337`

## Symptôme

Si l'appel `purgeWeezeventData(integration.id)` échoue (verrou DB dû à un job de sync concurrent
qui écrit dans les mêmes tables, timeout réseau…), l'utilisateur ne reçoit aucune erreur visible —
seul un `console.error` est émis — et le flux continue directement vers la suppression de
l'intégration.

## Cause racine

```js
if (this.removeDeleteData && integration.type !== 'digifood') {
  try { await purgeWeezeventData(integration.id) }
  catch (err) { console.error('[DataIntegrationView] Failed to purge data:', err) }
}
```
Le `catch` ne fait que logger — pas de `throw`, pas de `this.configError`/bannière, pas
d'interruption du flux. `confirmRemoveIntegration` poursuit ensuite vers
`deleteWeezeventInstance` quel que soit le résultat de la purge (voir aussi BUG-193, qui rend ce
point partiellement moot puisque la suppression cascade de toute façon — mais reste un problème
tant que BUG-193 n'est pas corrigé dans un sens qui redonne un sens réel à la purge séparée).

## Correction

Rien à ce jour. Propager l'échec (bannière d'erreur, interruption du flux ou proposition de
réessayer) plutôt que de logger silencieusement.

## Risque de régression / à surveiller

Corréler avec la correction de BUG-193 : si la purge redevient un mécanisme réellement distinct de
la suppression cascade, son échec doit impérativement être visible.

## Références

- BUG-193 (case de suppression des données sans effet réel).
