# BUG-030 — "Good Category" écrasé à l'ouverture du drawer Edit Item (Market Prices)

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Achats & référentiels (Market Prices)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-15
- **Fichiers** : `src/components/menu-fb/views/market-prices/drawers/MarketPriceEditDrawer.vue:383-426`

## Symptôme

Sur `/market-prices`, en ouvrant le drawer "Edit Item Name" d'un item qui a déjà une "Good
Category" enregistrée, le champ "Good Category" s'affiche vide dès l'ouverture (avant toute
interaction utilisateur). En cliquant "Save Changes" sans y toucher, la catégorie précédemment
enregistrée est écrasée en base par une valeur vide — le champ semble "ne pas persister" alors
qu'en réalité il est effacé avant même d'être sauvegardé.

Le bug est intermittent : il ne se manifeste pas quand l'item ouvert a le même `goodType` que
l'item précédemment édité dans la même session (le watcher ne se déclenche alors pas car la
valeur ne change pas).

## Cause racine

Deux `watch` s'exécutent en course à l'ouverture du drawer
(`MarketPriceEditDrawer.vue:383-426`) :

- Le watcher `modelValue(val)` (ligne 388) réaffecte `this.form` en bloc à partir de
  `initialItem`, préremplissant `goodType` et `category` en une seule assignation synchrone
  (lignes 402-417 avant fix).
- Le watcher `'form.goodType'()` (ligne 384 avant fix) observe la valeur de `form.goodType` et
  réinitialise `form.category = ''` dès qu'elle change — comportement voulu quand l'utilisateur
  change manuellement le type, mais qui se déclenche aussi lors de la réhydratation en bloc
  ci-dessus, puisque `form.goodType` change alors aussi (nouvel item ≠ état précédent du
  formulaire).

Résultat : `form.category` est vidé par le watcher juste après avoir été préremplli, avant même
que le render n'affiche le formulaire à l'utilisateur.

`submit()` (lignes ~552-561) construit ensuite le payload PATCH à partir de ce `form.category`
déjà vidé :

```js
category: this.form.category || '',            // '' à cause de la course ci-dessus
marketPriceCategoryId: this.selectedCategoryId, // null, car '' ne matche aucune productCategory
```

`updateMarketPrice()` (`src/api/endpoints/menu.api.js:326-328`) envoie ce payload tel quel en
`PATCH /market-prices/:id`.

Le backend n'est pas en cause : DTO (`create-market-price.dto.ts` / `update-market-price.dto.ts`),
service (`market-prices.service.ts:262-315`, méthode `update()`) et schéma Prisma
(`MarketPrice.category` / `MarketPrice.marketPriceCategoryId`, `schema.prisma:799-849`) traitent
correctement le champ reçu — ils persistent fidèlement la valeur vide envoyée par le front.

## Correction

Ajout d'un flag `isHydratingForm` (data, `MarketPriceEditDrawer.vue`) mis à `true` juste avant la
réaffectation en bloc de `this.form` dans le watcher `modelValue`, et remis à `false` via
`$nextTick()` une fois la réhydratation terminée. Le watcher `'form.goodType'` ignore le reset de
`category` tant que `isHydratingForm` est vrai — il ne se déclenche donc que sur un changement de
type réellement initié par l'utilisateur.

## Risque de régression / à surveiller

- Vérifier manuellement : ouvrir Edit Item Name sur un item avec catégorie déjà définie → le
  champ "Good Category" doit être prérempli à l'ouverture, et rester inchangé après Save + réouverture.
- Vérifier que le comportement voulu est toujours actif : changer manuellement "Good Type" dans le
  formulaire doit toujours vider "Good Category" (puisque les catégories dépendent du type).
- Pas de test automatisé ajouté (composant Vue sans suite de tests unitaires existante sur ce
  drawer) — à couvrir si une suite est introduite sur ce composant.

## Références

- Bug voisin sur le même drawer : [04](04_dropdown_packaging_mauvaise_taxonomie.md) (taxonomie
  packaging Market Price incorrecte).
