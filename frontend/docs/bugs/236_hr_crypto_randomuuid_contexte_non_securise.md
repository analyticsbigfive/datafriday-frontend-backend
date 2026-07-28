# BUG-236 — HR : `crypto.randomUUID is not a function` en contexte non sécurisé + alignement UI sur le pattern Settings

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟠 Majeur (création d'enregistrements HR impossible hors localhost/HTTPS)
- **Domaine** : RH / Staffing
- **Découvert le** : 2026-07-28 · **Corrigé le** : 2026-07-28 (emmanuel)
- **Fichiers** : `components/hr/*`

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
  main) → sinon id horodaté aléatoire.
- Remplacement des **5 occurrences** de `crypto.randomUUID()` par `newId()` (drawers + tabs).

> À retenir : ne jamais appeler `crypto.randomUUID()` directement dans du code front susceptible
> d'être servi sur IP LAN/HTTP. Passer par un helper à repli.

## Contexte — alignement UI de HR sur le pattern Settings (même commit)

À la demande, les écrans HR (auparavant en Vuetify générique : `v-dialog` plats, table brute) ont
été alignés sur le pattern des autres écrans Settings (réf. `menu-fb/.../SuppliersListView` +
`SupplierFormDrawer` + `SupplierDeleteDialog`) :

- **Feuille partagée** [`components/hr/hrForms.css`](../../src/components/hr/hrForms.css) : bandeau
  rouge, drawer coulissant (`.hrd-*`), delete-dialog à en-tête rouge dégradé (`.hrdd-*`), switcher
  d'onglets (`.hr-tabsw`), searchbar pleine largeur (`.hr-searchbar`) — avec dark mode, tokens de la
  charte typo.
- Nouveaux composants : `HrDeleteDialog`, `HrSupplierFormDrawer`, `HrPositionFormDrawer`,
  `HrTabSwitcher`.
- Onglets déplacés **dans le bandeau rouge** (switcher segmenté remplaçant le titre) → `<v-tabs>`
  retiré de `HrView` ; le switcher remonte `switch-tab`. Recherche pleine largeur collée sous le
  bandeau. En-tête d'app nettoyé (retrait de « · Édition RH » et de l'icône home).
- Toute la logique `hrApi`/localStorage/CSV est conservée à l'identique.

Réf. données HR : [`modules/11_RH_STAFFING.md`](../modules/11_RH_STAFFING.md) (localStorage via
`utils/hrApi.js`, aucune table backend — cf. [BUG-231](231_ecrans_rh_routes_restes_prototype.md)).

## À surveiller / reste à faire

- **Non vérifié écran par écran** au-delà des captures fournies : valider création/édition/suppression
  réelles (agences ET postes), le switcher, la recherche, le dark mode des drawers.
- Le même piège `crypto.randomUUID` peut exister ailleurs dans le front (hors HR) : à auditer si
  d'autres écrans sont ouverts sur IP LAN.
