# BUG-344-01 — Shopping list / email en pièces : latch `stockPackedModes` persisté + pool manquant de `marketPriceRefFor`

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟠 Majeur (l'email fournisseur partait en pièces)
- **Domaine** : Réarmement / Liste de courses
- **Repo(s) concerné(s)** : `datafriday-web` (frontend seul)
- **Découvert le** : 2026-08-19 (réunion Bertrand 14:46 « quand on va sur Email, on a le nombre
  de pièces et non le nombre de paquets » ; investigation session 2)
- **Fichiers** : `src/views/SpaceRestockView.vue`,
  `tests/unit/restockPackagingRounding.spec.js`

## Symptôme

L'email fournisseur de la Shopping List (étape 3) liste des quantités en pièces au lieu de
paquets — et la table de la même étape aussi, pour les mêmes articles, parfois SANS l'infobulle
« conditionnement non résolu ».

## Cause racine (deux, distinctes)

L'email n'a pas de formateur propre : `buildSupplierEmail` délègue à `formatShoppingQuantity`,
le même que la table et l'impression. Ce formateur exigeait DEUX conditions pour les packs :

1. `item.packaging` résolu — chantier BUG-342-01/131-01 (déjà corrigé) ;
2. `isPackedMode(itemKey) !== false` — et là, le piège : `ensureStockItemDefaults` seedait
   `stockPackedModes[itemKey] = false` pour tout article dont le conditionnement ne se résolvait
   PAS au moment du seed. Valeur **persistée** (snapshot localDb + `inputs` des plans
   sauvegardés). Une fois les résolutions corrigées, ces articles restaient en pièces — table,
   email, impression, et « À déposer » de l'étape 2 (`depositPackSize` gaté pareil) — sans
   infobulle (sa gate est `!item.packaging` seulement). La case UI « Empaqueté » ayant été
   retirée (BUG-295-01), plus aucun moyen utilisateur de lever le latch.

Bug voisin trouvé pendant l'investigation : `marketPriceRefFor` (référence d'achat en tête de
groupe, étape 2) résolvait **sans le pool `marketPrices`** — une ligne libre type « Coca-Cola
Cherry - CAN 33CL », qui n'existe que côté catalogue d'achat, n'affichait jamais sa référence.
Sans influence sur les quantités (affichage pur), mais même famille d'oubli que BUG-342-01
(« Saucisse de Francfort »).

## Correction

Décision JLH 2026-08-19 (session 2) : **purger la mécanique partout** — conditionnement résolu
= affichage en paquets, plus de mode figé.

- `formatShoppingQuantity` : la condition `isPackedMode(…)` disparaît, seul `item.packaging`
  décide. `depositPackSize` : idem.
- Suppression de l'état `stockPackedModes`, du seed dans `ensureStockItemDefaults`, de la
  méthode `isPackedMode`, et des écritures snapshot/plan. À la **lecture**, les
  `stockPackedModes` des vieux snapshots/plans sont **ignorés** (commentés en place) — c'est la
  purge : un `false` hérité ne bloque plus rien.
- `restockPlanSnapshot.js` **non touché** : `inputs.stockPackedModes || {}` et
  `packedMode: !!…` tolèrent l'absence ; `packedMode` figé n'a aucun lecteur (grep repo) — les
  vieux plans chargent, les nouveaux figent un `false` inerte.
- `marketPriceRefFor` : 5e argument `this.marketPrices`. Sûr par construction : dernier pool +
  règle deux passes BUG-299-01 (tous les ids avant tous les noms).
- Test : `restockPackagingRounding.spec.js` — ligne libre + Market Price homonyme portant
  `supplierItem` → résolue avec 5 arguments, null avec 4.

## Limites / hors périmètre (assumés)

- **Plan sauvegardé avant les fixes** : le `packaging` par ligne y est FIGÉ (null photographié
  reste null — `recomputePackaging` est un rejeu arithmétique, pas une re-résolution catalogue).
  Re-générer le plan après déploiement.
- **CSV export** : n'a jamais formaté en packs (quantité brute par construction) — sujet séparé.
- **« Frites » avec infobulle** : trou de DONNÉES, pas de code — l'ingrédient ne porte aucun
  champ de colisage à plat (Prisma), tout vient de son Market Price niché. Remplir la fiche
  Market Price liée : « Item is stored in » (ou « purchased in ») **et** « Packed Units », les
  deux requis ; ou lier l'ingrédient à un Market Price. Discriminant : référence d'achat
  affichée sur le groupe = fiche liée mais vide ; absente = pas de fiche liée.
- L'email n'embarque aucun marqueur pour une ligne non résolue (l'infobulle est écran seul) —
  à discuter si besoin.
- **Dette de données assumée** : `freezeStockLine` (`restockPlanSnapshot.js:140`) fige encore
  `packedMode: !!inputs?.stockPackedModes?.[…]` — la vue ne fournit plus cette entrée, donc tout
  plan sauvegardé désormais écrit `packedMode: false` sur chaque ligne. **Aucun lecteur** dans
  `src/` (grep), DTO backend documentaire uniquement : champ inerte, pas de risque d'exécution.
  Non retiré ici (le plan validé disait « ne pas toucher restockPlanSnapshot.js » ; le retrait
  changerait la shape du snapshot et son test). À nettoyer dans un lot dédié.

## Références

- BUG-342-01 (résolution du conditionnement, même chantier), BUG-299-01 (deux passes id/nom),
  BUG-295-01 (retrait de la case « Empaqueté »), BUG-131-01 (backend
  `purchaseUnitConversion`).
- Réunion : https://fathom.video/share/32quEeoVBR3gAqzW8h9sJNiRSvHvareW (14:46)

JLH
