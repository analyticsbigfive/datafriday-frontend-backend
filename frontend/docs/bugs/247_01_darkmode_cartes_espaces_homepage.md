# BUG-247-01 — Dark mode : cartes d'espaces blanches sur la homepage (+ balayage des composants sans moitié sombre)

- **Statut** : 🟡 Corrigé non déployé (correctif écrit, **non vérifié en navigateur**)
- **Sévérité** : 🟡 Mineur (lisibilité en thème sombre)
- **Domaine** : Espaces (homepage `/spaces`) — balayage transverse (shell global, RH, Analyse, Data integration)
- **Repo(s) concerné(s)** : les deux (`datafriday-frontend-backend/frontend` **et** `datafriday-web`, décision utilisateur 2026-07-30)
- **Découvert le** : 2026-07-30
- **Fichiers** : voir tableau en fin de fiche

## Symptôme

Homepage `/spaces` en thème sombre : le bandeau KPI (`SpaceStats`) et la barre « Mes Espaces »
sont sombres, mais **le bloc de métriques de chaque carte d'espace reste blanc** (F&B REVENUE /
PER CAPITA / AVG TX / AVG EVENT) — pavés clairs dans une page sombre. Capture utilisateur du
2026-07-30. Une surface blanche en thème sombre est un défaut au sens du pattern officiel
([BUG-196](196_darkmode_completion_domaines_restants_etoiles_required.md) item 2).

## Cause racine

`SpaceItem.vue` n'implémentait **que la moitié claire** du thème : zéro `isDark`, zéro classe
`--dark`, zéro sélecteur `v-theme` dans tout le fichier.

1. Fond blanc en dur : `spaces/widgets/SpaceItem.vue` `.si-card { background: #fff }` — `.si-stats`
   ne pose aucun fond propre, le blanc du shell traverse → c'est le pavé blanc observé.
   Séparateurs `#f0f0f0`, hover `#fafafa`, label `#9ca3af` : même moitié claire seule.
2. **Le parent calculait déjà `isDark` et le passait… à un autre enfant** :
   `spaces/views/SpaceListView.vue:270` (computed) → passé à `SpaceCreateDrawer` (`:is-dark`) mais
   absent du `<SpaceItem>` (:149) et du `<SpaceDeleteDialog>` (:224).
3. Incorrigeable depuis le parent : `SpaceListView` est en `<style scoped>` — ses règles
   `.slv--dark` atteignent la racine de l'enfant (`.si-card`) mais pas ses nœuds internes
   (`.si-stats`, `.si-stat__label`). La correction appartient au composant (même leçon que
   BUG-197 « le thème sombre d'un composant appartient au composant »).
4. Ironique : `hr/HrSpaceCard.vue`, **clone documenté** de cette carte (en-tête :2-4), avait déjà
   sa moitié sombre (:151-160) avec des littéraux clairs identiques ligne pour ligne.

## Correction

Pattern officiel BUG-196 : `useTheme()`/prop → classe `--dark` sur la **racine propre** du
composant → CSS scopé en **overrides uniquement** (aucun littéral clair modifié → mode clair
inchangé par construction). Classe sur la racine propre = insensible à la téléportation
(`v-dialog`/`v-menu`/`Teleport` sortent du `v-app`, `.v-theme--dataFridayDark` n'y descend pas —
cause de BUG-198/199). Palette slate copiée de `HrSpaceCard` (canon BUG-196 §48-51) : surface
`#1e293b`, inset `#0f172a`, bordures `rgba(255,255,255,.08)`, hover `#24324a`, muted `#94a3b8`.

Choix assumés :
- **Rouge de marque `#ff3131` et bandeaux rouges identiques dans les deux thèmes** (parité BUG-197).
- **Teintes sémantiques calibrées pour fond clair → membre clair de la même famille** (pattern
  BUG-197) : vert `#059669`→`#86efac`, violet `#7c3aed`→`#c4b5fd`, ambre `#d97706`→`#fcd34d`.
  ⚠️ Appliqué d'office (contraste ~3:1 du violet sur `#1e293b`), **à valider à l'œil**.
- Badge de type et dégradé du bandeau nom : posés sur la photo, déjà corrects — non surchargés.

### Vague 1 — le bug signalé (répliqué à la main dans `datafriday-web`, divergé de 102 lignes)

| Fichier | Modification |
|---|---|
| `spaces/widgets/SpaceItem.vue` | prop `isDark` + `.si-card--dark` + bloc sombre (11 règles) |
| `spaces/views/SpaceListView.vue` | `:is-dark` ajouté sur `<SpaceItem>` et `<SpaceDeleteDialog>` |
| `spaces/dialogs/SpaceDeleteDialog.vue` | prop `isDark` + `.sdd-card--dark` (racine v-dialog) |

### Vague 2 — même classe de bug ailleurs (littéraux clairs + zéro affordance sombre)

Balayage `src/components` + `src/views` (hors zones mortes). Corrigés (frontend seul) :

| Portée | Fichier | Mécanisme |
|---|---|---|
| Shell global | `NotificationPanel.vue` | `useTheme` + `.np-panel--dark` (racine v-menu) |
| Shell global | `NotificationBell.vue` | `useTheme` + `.notif-menu-surface--dark` (racine v-menu) |
| Shell global | `GlobalConfirmDialog.vue` | `useTheme` + `.gcd-card--dark` (racine v-dialog) |
| Shell global | `DemoModeBanner.vue` | `useTheme` + `.demo-pill--dark:not(.demo-pill-on)` |
| RH | `hr/views/HrSuppliersView.vue` | `useTheme` + `.hsl--dark` (page, table, badges, recherche) |
| RH | `hr/views/HrPositionsView.vue` | idem |
| RH | `hr/views/HrSettingsView.vue` | `.hsl--dark` + **branche la prop `:is-dark` de `HrSpaceCard`** (sa moitié sombre existait, la prop n'était jamais passée) |
| Analyse | `analyse/charts/EventRevenueByShopChart.vue` | `useTheme` + `.erbs--dark` (pills toolbar `!important` vs `!important`) |
| EventPredict | `EventPredictRowActions.vue` | littéraux → `var(--fb-*, littéral)` (le bouton vit sous `.event-predict-overlay` où le contrat existe, style.css) |
| Data integration | `integration/wizard/dialogs/CreateEventDialog.vue` | `useTheme` + `.ced-card--dark` (racine v-dialog) |
| Data integration | `integration/SyncProgressDialog.vue` | `useTheme` + classe `--dark` racine v-dialog |
| Data integration | `integration/wizard/dialogs/EventBreakdownDrawer.vue` | `useTheme` + `.ebd-panel--dark` (racine `Teleport to="body"`) |

**Reportés, avec raison** :
- `spaces/views/builder2/…/inspector/sections/{Inventory,StorageInventory,StorageShops}Section.vue` —
  l'inspector a son patron maison (`rgb(var(--v-theme-surface))`, cf. `SectionCard.vue:54`) ; vague dédiée.
- `views/PredictTestView.vue` — vue de test, non exposée.
- `EventPredictView.vue` (49 littéraux) — déjà couvert par BUG-198/BUG-240 (🟡), pas de 3ᵉ front.
- `BurgerMenu.vue`, `SearchBar.vue`, `MenuComponentsView.vue`, `MenuItemsByShopTable.vue` (racine
  de `components/`, ≠ `analyse/tables/…` qui est thémé) — **zéro importeur**, code mort hors zones
  mortes déclarées ; candidats quarantaine, non corrigés.
- **Couverture partielle** (1-2 règles sombres mais littéraux clairs restants — invisible au
  balayage « zéro affordance ») : `SupplierDeleteDialog`, `ProductDeleteDialog`,
  `EventDetailsEditor`, `InventoryFilterPanel`, `InventoryCountingInterface`, `InventoryShopCard`,
  `SpaceLogisticView`, `MarketPriceFilters` — non traités ici (reste à faire).
- **`datafriday-web`** : seule la vague 1 y a été répliquée ; la vague 2 n'y a pas été rejouée.

**Angles morts assumés du balayage** : fonds `rgba(255,255,255,…)` comptés partiellement ;
`src/styles/workspace-ui.css:7` (`.wsl-card { background:#ffffff }`) et `src/style.css:44,148,173`
(`html, body`, `.btn`, `.card`) sont **globaux et sans contrepartie sombre** — dette de fond hors
périmètre de cette fiche.

## Risque de régression / à surveiller

- **Aucune vérification en navigateur** (série 196→199/240 dans le même état). Priorité 1 : le
  mode **clair** doit être identique à l'avant-correctif (le pattern « overrides uniquement » le
  garantit par construction, à confirmer visuellement).
- Ouvrir réellement chaque surface téléportée en sombre (delete dialog, cloche, confirm global,
  dialogs integration) : c'est là qu'un sélecteur ancêtre échouerait silencieusement.
- Valider le contraste des accents violet/ambre clairs sur `#1e293b` (choix d'office, cf. ci-dessus).
- `EventRevenueByShopChart` : le bloc sombre bat les `!important` clairs par ordre de déclaration
  dans le même fichier — ne pas déplacer ces règles dans un fichier global (piège BUG-197 cause 5).
- Rejouer la vague 2 dans `datafriday-web` si ce repo doit rester iso.

## Références

- [BUG-196](196_darkmode_completion_domaines_restants_etoiles_required.md) — pattern officiel + palette canon.
- [BUG-197](197_darkmode_workspaces_fb_inventory_logistic_restock.md) — contrat `--fb-*`, bandeaux rouges, familles claires.
- BUG-198 / BUG-199 / BUG-240 ([00_INDEX.md](00_INDEX.md)) — téléportation, EventPredict.
- Source du bloc sombre copié : [`components/hr/HrSpaceCard.vue:151-160`](../../src/components/hr/HrSpaceCard.vue).
