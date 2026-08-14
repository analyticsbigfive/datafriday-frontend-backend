# BUG-323-02 — Liste des composants ne se rafraîchit pas après duplication/suppression

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-08-14
- **Fichiers** : `src/store/modules/menuComponents.js`, `src/components/menu-fb/views/component-library/views/componentListView.vue`

## Symptôme

Après avoir dupliqué ou supprimé un composant depuis `componentListView.vue`, l'action réussissait
côté API (confirmé via l'onglet Network) mais la liste affichée ne se mettait pas à jour : l'élément
dupliqué n'apparaissait pas, l'élément supprimé restait visible. Un rechargement complet de la page
(F5), après une longue attente, finissait par montrer le bon état.

## Cause racine

`menuComponents.js` (action `fetchComponents`) avait un garde `if (state.fetching) return` : si un
appel arrivait pendant qu'un fetch précédent était encore en vol (catalogue volumineux, pagination
`while(true)` séquentielle page par page), l'appel était **silencieusement ignoré** — pas d'erreur,
pas de retry, pas de mise à jour du store, jusqu'au prochain rechargement complet de page (qui repart
d'un état Vuex vierge). `onDuplicateComponent`/`confirmDelete` (`componentListView.vue`) appelaient
`loadComponents(true)` juste après la mutation, exactement le genre d'appel susceptible de tomber
pendant un fetch encore en cours.

## Correction

Deux couches de fix, appliquées le 2026-08-14 :

1. **Store** (`menuComponents.js`) : les appels concurrents à `fetchComponents` partagent désormais
   la même Promise au lieu d'être abandonnés ; si un appel arrive pendant un fetch en vol, un second
   fetch s'enchaîne juste après pour garantir des données réellement fraîches.
2. **UI optimiste** (`componentListView.vue`) : plutôt que de dépendre d'un refetch réseau (latence,
   cache backend — voir [BUG-128-02](../../../backend/docs/bugs/128_02_redis_cache_jamais_invalide_double_prefixe.md)),
   `onDuplicateComponent`/`confirmDelete`/`confirmBulkDelete` appliquent directement le résultat
   connu de l'opération à l'état local via 2 nouvelles mutations Vuex, `UPSERT_ROW`/`REMOVE_ROW` —
   affichage instantané, sans dépendre du cache ni d'un refetch.

## Risque de régression / à surveiller

Le fix (1) seul aurait suffi à corriger la non-mise-à-jour, mais restait dépendant du temps de
réponse réseau et du cache backend (voir BUG-128-02, corrigé le même jour) ; le fix (2) rend le
comportement indépendant de ces deux facteurs. L'import CSV garde le refetch complet classique (on
ne connaît pas le contenu importé sans requête serveur) — bénéficie quand même du fix (1). Pas de
test automatisé ajouté.

## Références

- [`128_02_redis_cache_jamais_invalide_double_prefixe.md`](../../../backend/docs/bugs/128_02_redis_cache_jamais_invalide_double_prefixe.md) (backend, cause racine associée du délai observé avant ce fix).
