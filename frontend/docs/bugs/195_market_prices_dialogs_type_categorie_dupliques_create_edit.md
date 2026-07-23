# BUG-195 — Dialogs de création (Type / Category / Industriel / Packaging) dupliqués entre les 3 drawers market-prices

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur (dette technique — duplication de markup + logique)
- **Domaine** : Achats & référentiels (market-prices)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-22 (en complétant le dark mode, [BUG-194](194_darkmode_incomplet_component_library_market_prices.md)) · **Corrigé le** : 2026-07-22 (emmanuel)
- **Fichiers** : `MarketPriceCreateDrawer.vue`, `MarketPriceEditDrawer.vue`, `MarketPriceEditSupplierDrawer.vue` (les 3 drawers) ; nouveaux composants `dialogs/MarketPriceNew{Type,Category,Industrial,Packaging}Dialog.vue`

## Symptôme

Les mini-dialogs de création inline étaient **dupliqués (jusqu'à triplés)** à travers les trois drawers
du domaine, chacun ré-implémentant les mêmes dialogs avec un préfixe CSS et des noms d'état différents :

| Dialog | Create (`.mpcd-`) | Edit (`.mped-`) | EditSupplier (`.mpesd-`) |
|---|---|---|---|
| Add Good Type | `newTypeOpen` | `newTypeOpen` | `goodTypeCreateOpen` |
| Add Category | `newCategoryOpen` | `newCategoryOpen` | `goodCategoryCreateOpen` |
| Add Industriel | ✔ | — | ✔ |
| Add Packaging | ✔ | — | ✔ |
| Add Supplier | ✔ | — | ✔ |

Conséquences : dark mode à corriger **3 fois**, et risque de divergence de comportement entre copies
(ex. le handler Type de Create vérifiait l'`id` de réponse et re-poussait l'option locale sur
`Unique constraint`, pas celui d'Edit).

## Cause racine

Ré-implémentation **inline** du dialog dans chaque drawer au lieu d'un composant partagé —
contrairement au domaine `component-library` qui fait déjà proprement l'extraction.

## Correction

Extraction en **quatre composants partagés** (100 % frontend — aucun endpoint touché), calqués sur le
patron `component-library`. Interface commune : `props { modelValue, isDark }`, emit `created`, API +
refetch/ajout store + gestion `Unique constraint` **internes** ; l'**effet post-création reste au
parent** (`@created` → sélection dans le formulaire + push des options locales).

- `MarketPriceNewTypeDialog.vue` — emit `created(name)`. Utilisé par **Create, Edit, EditSupplier**.
- `MarketPriceNewCategoryDialog.vue` — prop `typeId` (= `selectedTypeId` parent), emit `created(name)`.
  Utilisé par **Create, Edit, EditSupplier**.
- `MarketPriceNewIndustrialDialog.vue` — champ sélectionné **par id** → emit `created(industrial)`
  (l'objet), le parent fait `form.industrialId = industrial.id`. Utilisé par **Create, EditSupplier**.
- `MarketPriceNewPackagingDialog.vue` — emit `created(name)` ; le parent l'affecte au champ ciblé
  (`purchasePackaging`/`inventoryPackaging`) mémorisé par `onPackagingSelectChange`. Utilisé par
  **Create, EditSupplier**.

Nettoyage associé : suppression du state mort, des handlers `confirm*/submit*Create`, des imports API
inutiles, des lignes de reset, et du CSS mini-dialog devenu mort (`.mped-mini-dialog*` dans EditDrawer,
`.mpcd-mini-dialog*` dans CreateDrawer). `.mpesd-mini-dialog*` **conservé** (encore utilisé par le
dialog Supplier, non extrait).

## Risque de régression / à surveiller

- **Non testé en build** (règle de session : build côté dev). À valider : créer type / catégorie /
  industriel / packaging **depuis chaque drawer concerné**, vérifier l'auto-sélection (dont le bon
  champ purchase/inventory pour le packaging) et le dark mode.
- Les composants adoptent la version **stricte** des handlers (throw si pas d'`id`, gestion
  `Unique constraint`), ce qui **aligne** légèrement le comportement des drawers qui ne l'avaient pas.
  Risque faible.
- **Hors périmètre — dialog « Add Supplier »** : laissé inline (Create + EditSupplier). Raison : son
  payload diverge (`configurationIds`/`sectors` envoyés dans Create, pas dans EditSupplier) → un
  partage nécessiterait un flag `with-configurations` pour ne pas changer ce qui est envoyé au backend.
  À traiter séparément si souhaité.

## Références

- Analyses de faisabilité (session 2026-07-22) — Type/Category (« quasi identiques »),
  Industriel/Packaging (« id-based / champ cible, isolables via emit »), Supplier (« divergence payload »).
- [BUG-194](194_darkmode_incomplet_component_library_market_prices.md) — dark mode (contexte de découverte).
- Patron : `component-library/dialogs/NewTypeDialog.vue` / `NewCategoryDialog.vue`.
