# BUG-258 — Composants supprimés « restés localement » (cache TTL 15 min du store)

- **Statut** : 🟢 Corrigé (front)
- **Sévérité** : 🟡 Mineur (donnée périmée transitoire, pas de perte)
- **Domaine** : Menu & recettes (Composants) / Cache
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-08-01
- **Fichiers** : [`src/store/modules/menuComponents.js`](../../src/store/modules/menuComponents.js)

## Symptôme

Après suppression d'un ou plusieurs composants (suppression unitaire ou groupée dans
`componentListView`), les composants supprimés **restaient visibles localement** — notamment en
quittant puis revenant sur la liste, ou dans les sélecteurs de composants
(`ComponentPickerDrawer`).

## Cause racine

Le store Vuex `menuComponents` mettait en cache la liste avec un **TTL de 15 min**
(`cachedAt` + getter `isCacheValid`). `fetchComponents({ forceRefresh })` court-circuitait l'appel
réseau tant que le cache était « valide ». La suppression forçait bien un `forceRefresh` sur la
vue liste, mais **tout autre accès** (nav retour → remount, pickers qui dispatchent
`fetchComponents()` sans `forceRefresh`) réutilisait la liste **périmée** encore en cache, ré-affichant
les composants supprimés jusqu'à expiration du TTL.

## Correction

Cache TTL **retiré** (demande utilisateur 2026-08-01, commit `c137f59`) :
- Suppression de `TTL` / `cachedAt` / getter `isCacheValid` / mutation `INVALIDATE`.
- `fetchComponents` **refetch toujours frais** (le payload `{ forceRefresh }` est toléré mais ignoré).
- Garde `fetching` conservé (évite les appels concurrents en double — le fetch en vol est frais).
- Action `invalidate` conservée en **no-op** (encore dispatchée par `ComponentCreateView`).

## Risque de régression / à surveiller

- **Coût réseau** : chaque ouverture d'un `ComponentPickerDrawer` / remount de la liste refait
  l'appel paginé (avant : 1 fois / 15 min). Acceptable (fraîcheur > cache), mais à garder en tête
  pour les tenants à beaucoup de composants.
- **Réserve backend (non couverte par ce fix)** : le `GET /menu-components` est aussi **caché
  côté serveur (Redis, 60 s)**. Le code du repo invalide bien ce cache à la suppression, mais si le
  backend **déployé (Render)** est en retard, il peut encore renvoyer un composant supprimé jusqu'à
  60 s → voir **[backend/docs/bugs/123](../../../backend/docs/bugs/123_menu_components_cache_redis_invalidation_deploy.md)** (Ulrich) et [BUG-255](255_hr_supplier_departments_rejete_backend_render_obsolete.md).

## Références

- Module : [`modules/04_MENU_CATALOGUE.md`](../modules/04_MENU_CATALOGUE.md)
- Backend (Redis) : [`backend/docs/bugs/123`](../../../backend/docs/bugs/123_menu_components_cache_redis_invalidation_deploy.md)
