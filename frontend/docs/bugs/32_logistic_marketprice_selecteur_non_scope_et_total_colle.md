# BUG-032 — Logistic : sélecteur Market Price non scopé (corrompt le pack size) + Total quantité/unité collés

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur (fausse le Total affiché → impacte les décisions de réassort)
- **Domaine** : Stock (Logistic)
- **Repo(s) concerné(s)** : les deux (fix appliqué côté `datafriday-web` ; cause racine backend
  diagnostiquée, non corrigée — voir fiche miroir)
- **Découvert le** : 2026-07-15
- **Fichiers** : `src/components/LogisticMovementDialog.vue`, `src/components/LogisticItemCard.vue`,
  `api-datafriday-staging/src/features/logistics/logistics.service.ts:182,261-269`

## Symptôme

Trois observations remontées par Ulrich (owner Logistic) sur `/spaces/:id/logistic` :

1. Sur les cartes de la grille, la ligne "Total" concatène quantité et unité sans séparateur
   (ex. `40Pc`, `2kg`) — lisibilité. Même défaut sur le libellé de la ligne "Packed"
   (ex. `Number of Boxs of 3Pc` au lieu de `3 Pc`), dans la carte ET dans le panneau
   Ajouter/Retirer (code dupliqué). La ligne "Loose", elle, utilisait un mot générique
   figé (`t('logiLoose')` = "Number of loose units") au lieu de l'unité réelle de la denrée.
2. Le Total affiché peut être manifestement faux : ex. `Packed=2` + `Loose=7` → `Total=55`, alors
   que le pack size affiché juste au-dessus (ligne "X Pc/pack") ne le justifie pas.
3. Pour une denrée `readyForSale=Yes` (produit fini, ex. BARRE CHOCOLATEE), le panneau
   Ajouter/Retirer affiche un champ "Product name" qui est en réalité un sélecteur
   ("Market price for this product") — trompeur, laisse croire qu'il faut choisir un
   ingrédient/fournisseur pour un produit qui n'en a pas.

## Cause racine

Les points 2 et 3 sont **le même bug** :

- Le champ "Product name" du panneau (`t('logiMarketPrice')`) est en réalité lié à
  `form.marketPriceId` et était affiché pour **toute** denrée quel que soit son `kind`
  (`product`/`ingredient`/`component`/`packaging`) — alors que seul `kind === 'ingredient'` a un
  Market Price réel (`logistics.service.ts:544-548` vs `:560-564`, cf. BUG-048 ct. backend).
- `marketPriceOptions` (avant fix, `LogisticMovementDialog.vue`) proposait, en repli, **tout le
  catalogue** Market Price dès qu'aucune correspondance de nom exacte n'existait pour la denrée
  courante — sans scoping métier.
- Soumettre un mouvement avec un `marketPriceId` (même sans rapport avec la denrée) écrase
  **silencieusement** `StockLevel.unitsPerPack` côté backend : `applyLevelDelta`
  (`logistics.service.ts:182`, `const upp = unitsPerPack ?? existing?.unitsPerPack ?? null`) est
  alimenté par `createMovement` (`:261-269`) qui résout `unitsPerPack` depuis le Market Price
  choisi **sans vérifier qu'il correspond à `itemKey`**. Ce pack size persiste pour tous les
  mouvements suivants sur cette ligne (élément × denrée), donc pour le calcul du Total
  (`packed × unitsPerPack + loose`) — un choix malencontreux dans ce dropdown trop permissif
  (ex. un Market Price à `packedUnits=24` au lieu de 3) explique un Total du type
  "2 packed + 7 loose = 55" sans que la formule elle-même soit fautive.
- Le point 1 (`40Pc`/`2kg` collés) vient de `formatTotal()` qui renvoyait
  `` `${formatUnits(total)}${unit}` `` en une seule chaîne (`LogisticItemCard.vue:126` avant fix).

## Correction

- `LogisticItemCard.vue` : l'unité est rendue dans un `<span class="lg-field-unit">` séparé du
  nombre (`formatTotal()` ne renvoie plus que le nombre formaté).
- `LogisticItemCard.vue` + `LogisticMovementDialog.vue` : `packLabel` (dupliqué dans les deux
  fichiers) insère désormais un espace entre `unitsPerPack` et l'unité (`3 Pc` au lieu de `3Pc`).
- `LogisticItemCard.vue` + `LogisticMovementDialog.vue` : nouveau `looseLabel` (même méthode que
  `packLabel`) — affiche l'unité réelle de la denrée (ex. `Number of loose Pc`) au lieu du mot
  générique figé `logiLoose` ("Number of loose units"), avec repli sur ce dernier si l'item n'a
  pas d'unité connue.
- `LogisticMovementDialog.vue` : même traitement étendu au bandeau "Available" et aux options de
  transfert (`optionLabel`) — nouveaux `packedShortLabel`/`looseShortLabel` remplacent les mots
  génériques figés `logiPackedShort`/`logiLooseShort` ("packed"/"loose") par le type de
  conditionnement réel (ex. "Crates") et l'unité réelle (ex. "l") quand connus, avec repli sur les
  mots génériques sinon (ex. `Available : 0 Crates · 0 l` au lieu de `Available : 0 packed · 0 loose`).
- `LogisticMovementDialog.vue` : le nombre de "loose" affiché dans ce même bandeau et dans les
  options de transfert était trompeur une fois le pack size connu — "2 Cartons · 0 Pc" laisse
  croire à 0 disponible alors que 2 cartons de 3 Pc = 6 Pc réellement disponibles. Nouveau
  `capTotal()` calcule ce total (`packed × unitsPerPack + loose`, même formule que le Total de la
  carte) et l'affiche entre parenthèses à la place du nombre de loose brut quand le pack size est
  connu (`Available : 2 Cartons (6 Pc)`) ; repli sur l'ancien affichage packed/loose séparé si le
  pack size est inconnu (denrée sans Market Price résolu).
- `LogisticMovementDialog.vue` : le champ Market Price n'est plus rendu du tout quand
  `item.kind !== 'ingredient'` (produit fini / component / packaging) — masquage complet, pas
  lecture seule.
- `LogisticMovementDialog.vue` : `marketPriceOptions` ne renvoie plus que les Market Prices dont
  `itemName` correspond réellement à la denrée (ou déjà lié via `item.marketPriceId`) — plus de
  repli sur le catalogue complet.
- Décisions validées avec Ulrich le 2026-07-15 : masquage complet (pas lecture seule) pour les
  non-ingredients ; restriction stricte du dropdown (pas de repli catalogue complet, quitte à ce
  qu'il soit vide dans un cas limite) pour les ingredients.
- **Non fait dans cette passe** : le backend (`createMovement`/`applyLevelDelta`) fait toujours
  une confiance aveugle à `dto.marketPriceId` sans vérifier qu'il correspond à `itemKey` — un
  appel API direct (hors UI front normale) pourrait donc encore corrompre `unitsPerPack`. Le fix
  ci-dessus élimine le risque via le parcours UI normal mais pas au niveau API. Voir fiche miroir
  backend BUG-049.

## Risque de régression / à surveiller

- Vérifier qu'un ingrédient légitimement lié à **plusieurs** Market Prices (plusieurs
  fournisseurs, même `itemName`) voit toujours toutes ces options dans le dropdown (cas nominal
  du commentaire "4x LARGE PANCO 80gr (Metro Auxerre)").
- Cas limite à surveiller : un ingrédient dont le Market Price a été renommé/désynchronisé
  (`itemName` ne correspond plus au nom du référentiel Logistic, ni `item.marketPriceId` résolu)
  affichera désormais un dropdown **vide** au lieu du repli catalogue complet — compromis accepté
  (empêcher la corruption > flexibilité de secours). Si ça bloque un cas réel de terrain, prévoir
  un mécanisme de correction dédié (ex. lien direct vers la fiche Market Price, comme déjà fait
  pour "Pack not configured", `LogisticItemCard.vue:25-35`).
- Aucun test automatisé sur ces composants — vérification à faire manuellement : un item
  `readyForSale=Yes` (champ masqué) et un ingredient multi-fournisseur (dropdown non vide).
- Les `StockLevel.unitsPerPack` déjà corrompus par un mouvement passé (mauvais Market Price
  sélectionné avant ce fix) ne sont **pas** corrigés rétroactivement — seuls les nouveaux
  mouvements sont protégés. Si un Total du type "55" reste visible sur une ligne déjà affectée,
  un audit/correctif ponctuel de cette ligne sera nécessaire (pas un problème de code).

## Références

- BUG-048 (`readyForSale=Yes` collapse dans son ingrédient) — même famille de code
  (`itemRefsForMenuItem`), racine du champ `item.kind` utilisé ici pour distinguer les cas.
- Fiche miroir backend : `api-datafriday-staging/docs/bugs/49_marketpriceid_mouvement_non_valide_contre_itemkey.md`
  (diagnostic, non corrigé).
