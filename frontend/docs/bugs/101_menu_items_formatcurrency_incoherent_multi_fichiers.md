# BUG-101 — `formatCurrency` réimplémenté de façon incohérente sur toute la page `/menu-items`

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `MenuItemView.vue:680-684`, `MenuItemCreateView.vue:1348-1352`, `ComponentPickerDrawer.vue`, `IngredientPickerDrawer.vue`, `PackagingPickerDrawer.vue`, `SpaceGroupDrawer.vue:177-179`

## Symptôme

Chaque fichier réimplémente sa propre méthode `formatCurrency`/`formatPrice` locale
(`€1234.50`, 2 décimales, sans séparateur de milliers), incohérent avec la décision UI documentée
du domaine (`src/composables/useFormatters.js` : *"Décision UI 2026-07-12 : tous les prix affichés
SANS décimales"*, format `fr-FR` avec séparateur de milliers) déjà utilisée dans une vingtaine
d'autres fichiers du repo.

## Cause racine

```js
formatCurrency(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "-";
  return `€${n.toFixed(2)}`;
}
```
Copié-collé à l'identique dans plusieurs fichiers, sans jamais importer l'utilitaire partagé
`@/composables/useFormatters.js` (ou `@/utils/formatCurrency.js`).

## Correction

Toutes les méthodes locales listées ci-dessus remplacées par un import de `formatCurrency` depuis
`@/composables/useFormatters.js`, en cohérence avec le reste de l'application.

## Risque de régression / à surveiller

Vérifier que l'arrondi à 0 décimale n'introduit pas de confusion sur des coûts unitaires très
précis (ex. coût d'un ingrédient à 0,03€/unité) où 2 décimales avaient un sens — dans ce cas
précis, documenter explicitement l'exception plutôt que de revenir silencieusement à une
implémentation locale.

## Références

- [[60_component_formatcurrency_incoherent_3_implementations]] (même classe de dette sur
  `/components`).
