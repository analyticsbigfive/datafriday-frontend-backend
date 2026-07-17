# BUG-106 — MenuItemView : aucun indicateur de chargement, et tout le catalogue chargé d'un coup

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`, `datafriday-api` (backend, même repo)
- **Découvert le** : 2026-07-17 (signalé par l'utilisateur après le lot BUG-068 à 105 — finding identifié dans l'audit initial mais omis par erreur de ce premier lot)
- **Fichiers** : `frontend/src/components/menu-fb/views/menu-items/views/MenuItemView.vue`, `frontend/src/api/endpoints/menu-item.api.js`, `frontend/src/store/modules/menuItems.js`, `frontend/src/components/menu-fb/views/menu-items/drawers/MenuItemCsvImportDrawer.vue`, `backend/src/features/menu-items/menu-items.controller.ts`, `backend/src/features/menu-items/menu-items.service.ts`

## Symptôme

1. Le `<v-data-table>` de `/menu-items` n'avait aucune prop `:loading` — au premier chargement ou
   après un refresh forcé, l'utilisateur voit un flash "Aucun article trouvé" avant l'arrivée des
   données, sans aucun indicateur que ça charge.
2. Le chargement de la page était systématiquement lent sur un catalogue volumineux :
   `getAllMenuItems()` va chercher **tout le catalogue tenant** en un seul montage (boucle sur
   toutes les pages backend, 150 lignes/page en parallèle), avant de faire de la pagination
   *purement visuelle* côté client (`:items-per-page="-1"`, `hide-default-footer`).

## Cause racine

`GET /menu-items` supportait déjà une vraie pagination serveur (`page`/`limit`/`skip`/`take`
Prisma), mais uniquement `spaceId` comme filtre — pas de recherche texte, filtre type/catégorie/
readyForSale, ni tri. Le front n'exploitait donc jamais cette pagination pour l'écran liste : il
la contournait en rappelant toutes les pages à la suite pour reconstituer le catalogue complet en
mémoire, seul moyen de faire fonctionner la recherche/les filtres/le **regroupement par
type+catégorie avec totaux** (qui suppose que toutes les lignes d'un groupe sont chargées
simultanément pour calculer des totaux corrects).

## Correction

**Backend** (`menu-items.controller.ts`/`menu-items.service.ts`) : `GET /menu-items` accepte
désormais aussi `search` (nom, insensible à la casse), `typeId`, `categoryId`, `readyForSale` en
plus de `page`/`limit`/`spaceId` — répercutés dans le `where` Prisma et dans la clé de cache Redis
(tri resté fixe `name asc`, non ajouté dans ce lot).

**Frontend** — nouveau mode hybride sur `MenuItemView.vue` :
- Nouveau toggle "Grouper par type/catégorie" (`groupByEnabled`, **désactivé par défaut**).
- **Par défaut (non groupé)** : la vue tableau utilise une vraie pagination serveur
  (`getMenuItemsPage()`, nouvelle fonction dans `menu-item.api.js`) — recherche/filtres/
  changement de page déclenchent un appel réseau ciblé (recherche debouncée 300 ms) au lieu de
  filtrer en mémoire sur un catalogue déjà tout chargé. `:loading` branché sur l'état de fetch.
- **Regroupé, ou vue grille** : comportement historique conservé (catalogue complet via
  `menuItems/fetchMenuItems`, filtrage/groupement client, totaux par groupe corrects) — plus lent
  sur un gros catalogue, mais assumé (l'utilisateur choisit explicitement ce mode).
- `mounted()`/`activated()` et tous les points de rafraîchissement post-mutation (suppression,
  import CSV, import recettes, refresh costs) passent par un point d'entrée unique
  (`ensureDataLoaded()`) qui recharge la bonne source selon le mode actif.
- `onExportCsv()` force désormais un chargement du catalogue complet avant l'export (l'export
  reste sur "tout le filtré", pas juste la page visible) — sans ce fix, l'export serait
  silencieusement vide en mode paginé par défaut puisque le store `menuItems.rows` n'est plus
  peuplé automatiquement au montage.
- `MenuItemCsvImportDrawer.vue` (dédoublonnage par nom à l'import, cf. BUG-086) déclenche
  désormais lui-même `menuItems/fetchMenuItems` à l'ouverture, pour la même raison.

## Risque de régression / à surveiller

- Vérifier visuellement en navigateur (non fait ici, `pnpm dev` interdit dans cette session) :
  spinner du tableau, recherche/filtres en mode paginé, bascule vers le mode groupé, export CSV,
  et le comportement du dédoublonnage à l'import CSV.
- Le tri des colonnes (`sortBy`) n'a pas été câblé côté backend dans ce lot — un clic sur un
  en-tête de colonne triable en mode paginé n'aura pas d'effet réel (à vérifier/compléter si
  besoin).
- Le déploiement du changement backend (nouveaux query params) doit être fait par l'utilisateur —
  aucun build/déploiement lancé depuis cette session.

## Références

- Signalé directement par l'utilisateur après la revue initiale de `/menu-items` (BUG-068 à 105).
