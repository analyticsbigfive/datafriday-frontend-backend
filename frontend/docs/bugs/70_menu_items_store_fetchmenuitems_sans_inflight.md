# BUG-070 — `menuItems.js` : `fetchMenuItems` sans registre `inflight`, risque de course

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/store/modules/menuItems.js:65-90`

## Symptôme

Un appel concurrent à `fetchMenuItems` pendant qu'un premier est déjà en vol se résout
immédiatement (retourne `undefined`) sans attendre la fin réelle du fetch, alors que l'appelant
fait `await this.$store.dispatch('menuItems/fetchMenuItems', ...)` en s'attendant à ce que les
données soient à jour une fois la promesse résolue.

## Cause racine

```js
if (state.isFetching) {
  if (forceRefresh) commit('SET_PENDING_REFRESH', true);
  return; // ne retourne pas la promesse en vol, ne l'attend pas
}
```

Exemple concret : `MenuItemView.vue` (`onRefreshCosts`) fait `this.refreshing = false` juste après
le `await dispatch('menuItems/fetchMenuItems', {forceRefresh:true})` — si un autre fetch était déjà
en vol (ex. `activated()` sur retour de keep-alive, cf. [[69_menu_items_activated_force_refetch_ignore_cache_ttl]]),
le spinner s'arrête avant que les coûts recalculés soient réellement affichés.

Ce pattern naïf (`if (state.fetching) return`) est précisément celui que le domaine a déjà identifié
comme buggé et corrigé ailleurs : `shopMenuItems.js` maintient un registre `inflight` (`Map`, hors
state réactif) pour que les appelants concurrents attendent la **même** promesse, avec un
commentaire explicite expliquant le bug de course évité.

## Correction

Repris le même pattern `inflight` (Map hors state réactif, clé fixe puisque `fetchMenuItems` n'a
pas de scope par id) dans `menuItems.js` : un appel concurrent retourne désormais la promesse déjà
en vol au lieu de retourner immédiatement `undefined`. La queue `pendingForceRefresh` existante est
conservée pour la sémantique `forceRefresh` (un forceRefresh demandé pendant un fetch en cours
déclenche un second fetch juste après).

## Risque de régression / à surveiller

Vérifier que deux composants montés simultanément (ex. `MenuItemView.vue` + un widget dashboard qui
lirait aussi `menuItems`) ne se bloquent pas mutuellement, et que l'`inflight` est bien nettoyé
même en cas d'erreur réseau (sinon tout appel suivant resterait bloqué sur une promesse rejetée
déjà consommée).

## Références

- `src/store/modules/shopMenuItems.js` (pattern de référence).
