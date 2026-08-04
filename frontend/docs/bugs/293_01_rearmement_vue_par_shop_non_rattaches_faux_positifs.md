# BUG-293-01 — Réarmement, vue « Par shop » : le split « Non rattachés au menu — à remapper » badge des PdV entiers en « non mappé »

- **Statut** : ⚪ Diagnostiqué partiellement — **vue masquée** le 2026-08-04 (contournement), cause
  racine du split **pas encore tranchée entre deux candidates** (cf. « Cause racine »)
- **Sévérité** : 🟠 Majeur (l'écran de réarmement affiche un PdV entier comme « à remapper », ce
  qui est faux et pousse l'utilisateur vers une action de remapping inutile ; les quantités,
  elles, restent correctes)
- **Domaine** : Stock (Réarmement)
- **Repo(s) concerné(s)** : `datafriday-web` (frontend uniquement)
- **Découvert le** : 2026-08-04 (capture JLH, PdV « 1 B »)
- **Fichiers** : `src/views/SpaceRestockView.vue:503` (en-tête de section),
  `src/views/SpaceRestockView.vue:2480-2495` (`restockRowAssigned`),
  `src/views/SpaceRestockView.vue:1692-1709` (`restockGroupsByShopSplit`),
  `src/views/SpaceRestockView.vue:2503-2620` (`loadRestockShopAssignment`),
  `src/utils/menuItemExpansion.js:112-214` (identité portée par `sources[]`)

## Symptôme

Étape « Réarmement », vue **Par shop**, PdV « 1 B » : **26 articles sur 26** tombent dans la section
rouge « Non rattachés au menu — à remapper (26) », chacun badgé « non mappé ». **Aucun tableau
« rattachés » n'est rendu au-dessus** — le PdV bascule en entier.

Les lignes listées sont des **éléments** (ingrédients / composants / packagings) issus de la
décomposition : « Bun - Burger », « Cheddar Tranche », « Cup 50CL », « Coca-Cola Cherry - CAN 33CL ».
Leur détail « Utilisé dans » est correct et nomme bien des menu items réels du PdV (« Burger frites
25/26 (Aux) », « Sandwich Américain + Frites 25/26 », « Tsing Tao 25cl 25/26 ») — donc la
décomposition et les quantités fonctionnent ; c'est **le verdict de rattachement** qui est faux.

## Cause racine

Le test de rattachement est appliqué **au mauvais grain**. `restockRowAssigned(row)`
(`SpaceRestockView.vue:2480`) reçoit une ligne d'**élément** alors que l'assignation menu est une
notion de **menu item** :

```js
const set = this.restockAssignmentByName.get(normalizeStr(row.shopName))
if (!set) return !this.restockAssignmentActive     // shop inconnu de la map → NON rattaché
const ids = [...row.sources.map(s => s.menuItemId), row.menuItemId, row.id]
if (ids.some((id) => set.ids.has(id))) return true
const best = findBestMatch({ name: row.itemName, basePrice: null }, set.items)
return !!(best && (best.matchScore || 0) >= 70)
```

Trois faiblesses, **toutes confirmées par lecture du code** :

1. **Le repli par nom ne peut jamais aboutir.** `row.itemName` est un nom d'**ingrédient**
   (« Cup 50CL ») comparé à `set.items` = les **menu items** du PdV. Un score ≥ 70 est hors
   d'atteinte. Le seul critère réellement discriminant est donc l'appariement d'ids.
2. **Les ids portés par les lignes ne sont pas ceux de l'article racine dès qu'il y a récursion.**
   `expandMenuItem` (`menuItemExpansion.js:207-208`) émet `menuItemId` = l'id du **niveau courant**
   de la récursion tandis que `menuItemName` = `rootMenuItemName`, l'article **racine**. Sur un
   combo (« Burger frites 25/26 (Aux) » → « Burger 25/26 (Aux) »), les lignes filles portent donc
   l'id du **sous-article**, qui n'est en général pas assigné au menu du PdV : id introuvable dans
   `set.ids` → repli par nom (cf. point 1) → « non mappé ». Cette incohérence id/nom existait déjà
   dans l'ancien `expandMenuItemStock` (même schéma) ; BUG-292-01 l'**amplifie**, puisque la
   nouvelle règle ouvre systématiquement les combos.
3. **Un PdV absent de la map bascule en entier.** `if (!set) return !this.restockAssignmentActive`
   traite « je n'ai pas l'assignation de ce PdV » comme « rien n'est rattaché ». Or la map
   (`loadRestockShopAssignment:2584-2604`) est **keyée par nom de shop normalisé**, alimentée par
   `/spaces/:id/shops` filtré sur `configId`, et un shop **sans aucun item `enabled === true`** est
   sauté (`continue`) — indistinguable d'un shop absent. Une clé qui ne joint pas (nom de l'élément
   de config ≠ nom renvoyé par `/shops`, config synthétique, `enabled` absent du payload lourd
   `/space-menu/shop/:id`) fait donc basculer **tout** le PdV.

**Ce qui reste à trancher** (26/26 sans aucun rattaché est la signature du point 3, mais le point 2
suffirait si tous les articles du PdV étaient des combos — ce que la capture ne permet pas
d'affirmer) :

- soit la clé « 1 b » est **absente** de `restockAssignmentByName` (point 3) ;
- soit elle est présente mais **aucun id source** ne joint (points 1+2, ou espaces d'ids
  différents entre `/space-menu/shop/:id` et le catalogue).

Le log déjà présent (`[RESTOCK] assignation NestJS chargée : X/Y shops avec menu`,
`SpaceRestockView.vue:2612`) départage partiellement : `X < Y` oriente vers le point 3. Un log
ponctuel du couple (`normalizeStr(row.shopName)`, `ids` de la ligne, échantillon de `set.ids`)
tranche définitivement.

> À noter : la vue **Par article** (`restockGroupsByItem`) n'applique **aucun** de ces tests — elle
> affiche les mêmes lignes, les mêmes quantités, sans split ni badge. C'est ce qui rend le
> contournement ci-dessous sans perte de donnée.

## Correction

**Contournement livré (2026-08-04, demande JLH)** : la vue « Par shop » est **masquée**, seule la
vue « Par article » est servie.

- `SpaceRestockView.vue:383-389` — segmented « Par shop / Par item » retiré du slot `#filters`
  d'`AppSearchBar` (commentaire de réactivation en place).
- `SpaceRestockView.vue:1207-1209` — `restockViewMode` par défaut à `'item'` (était `'shop'`).
- `SpaceRestockView.vue:2232` — la restauration d'état ignore un `restockViewMode` persisté à
  `'shop'` : sans bascule dans l'UI, l'utilisateur ne pourrait plus en sortir.
- `SpaceRestockView.vue:431-435` — le bloc de rendu « Par shop » est **conservé** tel quel, mais
  inaccessible (`v-if` sur `restockViewMode === 'shop'`, jamais vrai). `restockGroupsByShopSplit`,
  `restockRowAssigned`, `toggleRestockUnmapped` et les styles `.sr-unmapped-*` restent en place.

**Correctif de fond, à faire avant toute réactivation** (aucune ligne écrite à ce stade) :

1. faire porter aux lignes l'**identité de l'article racine** (`rootMenuItemId` à côté de
   `menuItemName: rootMenuItemName`, dans `menuItemExpansion.js`), et tester **cet** id ;
2. remplacer le repli par nom : comparer les **noms des articles sources** (`sources[].menuItemName`)
   aux `set.items`, jamais `row.itemName` ;
3. distinguer « menu du PdV non chargé / PdV inconnu de la map » de « non rattaché » — un PdV sans
   assignation connue ne doit pas basculer en rouge (état neutre, ou message dédié).

## Risque de régression / à surveiller

- Le masquage ne touche **ni** les quantités, **ni** la génération, **ni** l'export CSV, **ni** la
  feuille de course : `restockRows`, `filteredRestockRows` et `markAllVisibleRestocked` sont
  indépendants de `restockViewMode` (vérifié).
- `restockViewMode` continue d'être **persisté** (`:1986`) — seule sa **restauration** est filtrée.
  Réactiver la vue = restaurer le segmented + le défaut, rien d'autre.
- Le point 2 (id de sous-article dans `sources[]`) n'est **pas** propre au réarmement : toute
  consommation de `sources[].menuItemId` comme « article vendu » est concernée. À vérifier lors de
  la phase 2 de [BUG-292-01](292_01_decomposition_unique_stockup_inventaire_restock_feuille_de_course.md).
- Aucun test unitaire ne couvrait la vue « Par shop » (aucune spec ne référence `restockViewMode`
  ni `restockGroupsByShopSplit`) — à écrire avec le correctif de fond.

## Références

- Module : [`06_STOCK_INVENTAIRE.md`](../modules/06_STOCK_INVENTAIRE.md) (§ « Réarmement — le moteur
  de calcul »)
- [BUG-292-01](292_01_decomposition_unique_stockup_inventaire_restock_feuille_de_course.md) —
  décomposition unique (ouvre les combos → amplifie le point 2)
- [BUG-288-01](288_01_restock_composant_partage_lignes_dupliquees.md) — identité catalogue des
  lignes d'élément + détail « utilisé dans »
- [BUG-291-02](291_02_eventpredict_menuitem_indisponible_compte_comme_vente.md) — même map
  d'assignation keyée par nom de shop, mêmes pièges de jointure

---

JLH
