# BUG-050 — `unitsPerPack` jamais résolu pour un produit fini/component : casse de pack impossible, retraits valides rejetés

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🔴 Bloquant/impact business (retraits/transferts légitimes rejetés en 400)
- **Domaine** : Stock (Logistic)
- **Repo(s) concerné(s)** : les deux — voir aussi côté front
  `datafriday-web/docs/bugs/33_exceedscap_ignore_casse_de_pack_bloque_retrait_valide.md`
- **Découvert le** : 2026-07-15
- **Fichiers** : `src/features/logistics/logistics.service.ts:261-269` (`createMovement`),
  `:182` (`applyLevelDelta`), nouveau `resolveUnitsPerPackForItemKey`

## Symptôme

Panneau "Supprimer un produit" (BARRE CHOCOLATEE, produit fini `readyForSale=Yes`, 3 Pc/pack) :
stock affiché `Disponible : 2 Cartons (6 Pc)`. Demande : 0 carton + 1 loose (1 Pc), en dessous du
disponible. Après correctif du garde-fou front (BUG-033), le bouton devient actif — mais la
soumission échoue en 400 : `Stock insuffisant sur « 1 A » pour « BARRE CHOCOLATEE » (disponible :
2 packs, 0 vrac)`. Le backend refuse une opération pourtant valide.

## Cause racine

`createMovement` (`logistics.service.ts:261-269`, avant fix) ne résolvait `unitsPerPack` **que**
si `dto.marketPriceId` était fourni (`unitsPerPack = mp.packedUnits`). Or un produit fini
(`kind: 'product'`) ou un component (`kind: 'component'`) n'a **jamais** de `marketPriceId` —
`itemRefsForMenuItem` leur assigne systématiquement `marketPriceId: null`
(`logistics.service.ts:544-548`, `:585-589`, `:609`). Conséquence : pour ces denrées,
`StockLevel.unitsPerPack` ne pouvait **jamais** être appris par un mouvement manuel, et restait
`null` indéfiniment.

`applyLevelDelta` (`:182`, `const upp = unitsPerPack ?? existing?.unitsPerPack ?? null`) recevait
donc systématiquement `upp = null` pour ces denrées, et la vérification stricte
(`:185-196`) retombait sur la branche naïve :

```
insufficient = rawPacked < 0 || rawLoose < -1e-9   // upp inconnu → pas de casse de pack possible
```

au lieu de la branche correcte (casse de pack) :

```
insufficient = rawPacked < 0 || (rawPacked * upp + rawLoose < -1e-9)
```

Résultat : retirer du vrac seul (`loose > 0`, `packed = 0`) était **toujours** rejeté pour un
produit fini/component dès que le stock existant n'avait pas déjà du vrac en excédent — même avec
plusieurs cartons entiers disponibles pour couvrir la demande — alors que le pack size était
parfaitement connu côté référentiel (`MenuItem.inventoryNumberOfUnits` / `MenuComponent.packedUnits`),
juste jamais transmis/résolu côté mouvement.

## Correction

Nouvelle méthode `resolveUnitsPerPackForItemKey(itemKey, tenantId)` : résout le pack size par nom
(`itemKey`), tous kinds confondus — `MarketPrice.packedUnits` (ingredient) →
`MenuComponent.packedUnits` (component) → `MenuItem.inventoryNumberOfUnits` (product,
`readyForSale='Yes'`) — miroir des sources déjà utilisées par `itemRefsForMenuItem` pour construire
le référentiel `/stock`. `createMovement` l'appelle désormais en repli quand `dto.marketPriceId`
n'est pas fourni (au lieu de laisser `unitsPerPack = null`), ce qui permet à `applyLevelDelta` de
prendre la branche "casse de pack" pour ces denrées.

Effet de bord positif : ce repli s'applique aussi si un mouvement `ingredient` est soumis sans
`marketPriceId` (champ vidé par l'utilisateur) — il retombera sur la résolution par nom au lieu de
dépendre uniquement de l'`existing.unitsPerPack`, potentiellement déjà corrompu par BUG-049.

## Risque de régression / à surveiller

- Vérifier qu'un retrait dépassant réellement le total (ex. demander 7 Pc sur 6 disponibles) reste
  bien rejeté.
- Vérifier qu'un retrait de packed strictement supérieur au nombre de cartons entiers disponibles
  reste rejeté même si le total en Pc suffirait (contrainte `rawPacked < 0` toujours active,
  inchangée).
- Cas limite : deux entités de kinds différents portant le même nom (ex. un ingredient et un
  component homonymes) — `resolveUnitsPerPackForItemKey` priorise MarketPrice > MenuComponent >
  MenuItem ; à surveiller si un tel homonyme existe réellement en prod (risque déjà inhérent à
  l'architecture "itemKey = nom", documenté dans `06_STOCK_INVENTAIRE.md` côté front).
- Aucun test automatisé sur `logistics.service.ts` pour ce chemin — vérification manuelle à
  refaire après déploiement : retrait vrac seul sur un produit fini avec cartons disponibles.

## Références

- BUG-033 (front, même session) : le garde-fou UI corrigé en premier, insuffisant seul sans ce
  fix backend.
- BUG-049 : marketPriceId non validé contre itemKey — même famille (résolution de `unitsPerPack`
  dans `createMovement`), cause distincte.
- BUG-048 : `itemRefsForMenuItem`, origine de `marketPriceId: null` systématique pour les produits
  finis.
