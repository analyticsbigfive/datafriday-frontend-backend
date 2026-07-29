# BUG-236 — HR : `crypto.randomUUID is not a function` en contexte non sécurisé + reconstruction HR (Suppliers + Postes)

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟠 Majeur (création d'enregistrements HR impossible hors localhost/HTTPS)
- **Domaine** : RH / Staffing
- **Découvert le** : 2026-07-28 · **Corrigé le** : 2026-07-28 (emmanuel)
- **Fichiers** : `components/hr/*`, `views/DashboardView.vue`, `router/index.js`

## Symptôme

En ouvrant le formulaire de création (agence ou poste) sur l'app servie via une **IP LAN en
HTTP** (ex. `http://192.168.100.26:8080`) :

```
Uncaught (in promise) TypeError: crypto.randomUUID is not a function
    at reset (HrSupplierFormDrawer.vue:70)
```

Le drawer plantait à l'ouverture, la création était impossible. L'import CSV était aussi affecté.

## Cause racine

`crypto.randomUUID()` **n'existe que dans un contexte sécurisé** (HTTPS ou `localhost`/`127.0.0.1`).
Servie sur une **IP LAN en HTTP**, la page est un *insecure context* → l'API est absente et lève
`is not a function`.

C'est un piège **pré-existant** : l'ancien code HR (`blank()`, import CSV) utilisait déjà
`crypto.randomUUID()`. Il ne se manifestait pas tant qu'on développait sur `localhost` ; il
remonte dès qu'on ouvre l'app depuis un autre appareil du réseau (IP LAN). La refonte UI (ci-dessous)
l'a rendu systématique car l'id est désormais généré à l'ouverture du drawer (`reset()`), pas
seulement au clic « créer ».

## Correction

- **Helper `newId()`** dans [`components/hr/hrShared.js`](../../src/components/hr/hrShared.js) avec
  repli en cascade, valable en contexte **non sécurisé** :
  `crypto.randomUUID()` → sinon `crypto.getRandomValues()` (dispo en HTTP, UUID v4 reconstruit à la
  main) → sinon id horodaté aléatoire. Consommé par le drawer HR pour générer l'id à la création.

> À retenir : ne jamais appeler `crypto.randomUUID()` directement dans du code front susceptible
> d'être servi sur IP LAN/HTTP. Passer par un helper à repli.

## Contexte — reconstruction propre de HR Suppliers (pattern SuppliersListView)

Le HR historique (écrans à onglets Vuetify génériques, puis une 1ʳᵉ tentative d'alignement à base
d'onglets/switcher + feuille `hrForms.css`) a été **entièrement supprimé et reconstruit à neuf**,
en s'inspirant **uniquement** de `menu-fb/.../suppliers` (views / drawers / dialogs). État actuel :
**HR Suppliers ET Postes staff** reconstruits, chacun avec sa vue liste, son drawer et le dialog de
suppression partagé.

- **`hr/views/HrSuppliersView.vue`** — vue liste autonome (root `#hr-suppliers-page`), rendue **dans
  le chrome DashboardView** (comme SuppliersListView), donc **sans header applicatif propre** :
  bandeau rouge + searchbar pleine largeur + `v-data-table` (avatar/initiales ou image, badges
  espaces/secteurs, boutons d'action).
- **`hr/views/HrPositionsView.vue`** — même patron pour les **postes staff** (route `/hr/positions`,
  name `hr-positions`) : colonnes poste / agence / secteur / taux horaire, recherche + compteur.
- **`hr/drawers/HrSupplierFormDrawer.vue`** — drawer coulissant à en-tête rouge (création/édition),
  **upload d'image** (aperçu + base64), sections identité/contact/espaces/secteurs (pills), dark mode.
- **`hr/drawers/HrPositionFormDrawer.vue`** — drawer poste : select agence, nom du poste avec
  **autocomplétion** (`datalist` alimenté par `positionNames`), secteur, taux/heure ; id via `newId()`.
- **`hr/dialogs/HrDeleteDialog.vue`** — suppression à en-tête rouge dégradé, dark mode. **Généralisé**
  (`itemName` + `title` + événement `confirm`) pour servir agences **et** postes.
- **`hr/hrShared.js`** — `HR_SECTORS` + `newId()`.
- **Nav** : les 2 entrées Settings pointent vers `/hr` et `/hr/positions` (chemins distincts, plus
  de `?tab=`).
- Données inchangées : `hrApi` (localStorage), aucune table backend
  (cf. [`modules/11_RH_STAFFING.md`](../modules/11_RH_STAFFING.md), [BUG-231](231_ecrans_rh_routes_restes_prototype.md)).

### Nettoyage — prototype HR mort supprimé

Trois fichiers vestiges d'un ancien prototype HR à la racine `src/components/` (distincts du module
`components/hr/`), non routés et non importés : `ConsolidatedHRView.vue`, `HRSuppliersView.vue`,
`StaffPositionsView.vue` — **supprimés**.

### Fix associé — double header sur `/hr`

`/hr` était listé dans `isSelfHeadedRouteName` **et** `isRailPushRouteName` de
[`views/DashboardView.vue`](../../src/views/DashboardView.vue) (parce que l'ancien `HrView` rendait
son **propre** `WorkspaceAppHeader`). La nouvelle vue n'a plus de header propre → `'hr'` retiré des
deux listes pour qu'elle se comporte comme `/menu-fb/suppliers` (barre + rail Dashboard normaux).
Route `/hr` repointée de `HrView` (supprimé) vers `HrSuppliersView` dans `router/index.js`.

## À surveiller / reste à faire

- **Non vérifié écran par écran** : valider, sur `/hr` **et** `/hr/positions`, liste / création /
  édition (dont image côté agence, autocomplétion côté poste) / suppression, en clair **et** en sombre.
- Le même piège `crypto.randomUUID` peut exister ailleurs dans le front : à auditer si d'autres
  écrans sont ouverts sur IP LAN.
