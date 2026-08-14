# BUG-326-02 — Composants : colonne Supplier jamais peuplée (toujours "-")

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web` + `api-datafriday-staging` (voir fiche miroir backend)
- **Découvert le** : 2026-08-14
- **Fichiers** : `src/components/menu-fb/views/component-library/views/ComponentCreateView.vue`

## Symptôme

Dans le tableau "Sub-Components & Ingredients" (édition d'un composant), la colonne SUPPLIER
affichait systématiquement "-", pour toutes les lignes (ingrédients et sous-composants), quel que
soit le fournisseur réel associé.

## Cause racine

Double cause, en couches :

1. **Front** : `loadComponentData()` construisait les lignes d'ingrédients (via `getIngredient(id)`)
   sans jamais lire `marketPrice.supplier`/`marketPrice.supplierId` dans l'objet retourné — le champ
   `supplierName` n'était simplement jamais renseigné. Pour les sous-composants, aucune notion de
   fournisseur n'existait du tout (ni champ, ni résolution).
2. **Données** : même une fois le champ correctement lu, certaines lignes `MarketPrice` réelles ont
   leur colonne `supplier` (texte dénormalisé) **vide** alors que `supplierId` pointe vers un
   `Supplier` bien défini (vérifié en base : ex. `Metro Auxerre`, id
   `cmpa2xuy20000cmg80y4p2jpv`) — désynchronisation de données historiques. Un fix qui ne lit que
   `marketPrice.supplier` sans repli sur la relation `supplierRel.name` restait donc vide pour ces
   lignes précises.

## Correction

- Front : ingrédients → `supplierName: marketPrice.supplierRel?.name || marketPrice.supplier || ing.supplierName || "-"`.
  Sous-composants → un appel `getMenuComponent(childId)` par enfant résout la liste dédupliquée des
  fournisseurs de **ses propres ingrédients directs** (pas récursif au-delà, pour éviter un fan-out
  réseau non borné — un sous-composant peut agréger plusieurs fournisseurs, contrairement à un
  ingrédient qui n'en a qu'un).
- Colonne Supplier unifiée dans le tableau : affiche les 2 premiers fournisseurs en badges, et un
  badge "+N" cliquable (popup) pour le reste si plus de 2 — plutôt que de tout lister en ligne.
- Backend (voir fiche miroir) : `includeRelations`/`include` des 2 services concernés étendus pour
  exposer `marketPrice.supplier`/`supplierId`/`supplierRel.name`.

## Risque de régression / à surveiller

Le payload du GET composant (et de la liste catalogue, même `includeRelations`) grossit légèrement
(2-3 champs par ligne d'ingrédient) — scopé volontairement (pas l'image MarketPrice) pour limiter
l'impact. Un sous-composant avec beaucoup de children peut désormais déclencher plusieurs appels
`getMenuComponent` en parallèle à l'ouverture de l'écran d'édition (1 par enfant) — pas mesuré en
conditions réelles de charge. Pas de test automatisé ajouté.

## Références

- Fiche miroir backend : [`129_02_composants_supplier_marketprice_non_inclus_champ_denormalise_vide.md`](../../../backend/docs/bugs/129_02_composants_supplier_marketprice_non_inclus_champ_denormalise_vide.md)
- [`325_02_componentcreateview_sous_composants_mapping_champs_incorrect.md`](325_02_componentcreateview_sous_composants_mapping_champs_incorrect.md) (même bloc de code, corrigé dans le même passage).
