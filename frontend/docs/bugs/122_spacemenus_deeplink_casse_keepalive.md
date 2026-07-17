# BUG-122 — SpaceMenuView.vue : le deep-link ?space=&config= casse au retour sur la page (keep-alive)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes — module Space Menus
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/space-menus/views/SpaceMenuView.vue:472-501,693-710`

## Symptôme

Depuis `EventPredictView.vue`, cliquer "Add shops" navigue vers `/space-menus?space=A` et
présélectionne bien l'espace A. Si l'utilisateur revient en arrière puis reclique "Add shops" pour
un espace B pendant que l'instance `SpaceMenuView` reste en mémoire (route `keepAlive: true`), la
page reste bloquée sur l'espace A au lieu de basculer sur B.

## Cause racine

`applyRouteQuery()` (`:472-501`) — la seule fonction qui lit `?space=&config=` — n'est appelée que
depuis `mounted()` (`:693-694`). Le commentaire de la fonction elle-même affirme pourtant :
*« Appelé au mount ET à l'activated (la route est keepAlive : mounted() ne rejoue pas sur les
visites suivantes) »* — mais `activated()` (`:700-710`) ne l'appelle en réalité jamais. Sur une
route `keepAlive: true` rendue dans `<keep-alive>` (`DashboardView.vue`), `mounted()` ne se
redéclenche pas aux visites suivantes ; seul `activated()` se déclenche — donc la query string
n'est en pratique jamais relue après la première visite.

## Correction

`applyRouteQuery()` ajouté au début de `activated()`, comme le commentaire du code l'affirmait déjà
faire. La garde d'idempotence existante (`_lastRouteQuerySig`) empêche un double traitement de la
même query sur un simple retour sans changement de paramètres.

## Risque de régression / à surveiller

- Reproduire le scénario exact : `EventPredictView` → "Add shops" pour l'espace A → retour → "Add
  shops" pour l'espace B, sans recharger la page — vérifier que `/space-menus` bascule bien sur B.
- Vérifier qu'un simple retour sur `/space-menus` sans changement de query ne redéclenche pas de
  rechargement réseau inutile (garde `_lastRouteQuerySig` toujours active).

## Références

- Aucune.
