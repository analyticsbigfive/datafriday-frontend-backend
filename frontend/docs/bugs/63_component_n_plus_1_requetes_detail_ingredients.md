# BUG-063 — N+1 requêtes API pour charger le détail des ingrédients (tiroir sub-items + formulaire d'édition)

- **Statut** : ⚪ Diagnostiqué (root cause connue, fix différé — nécessite un endpoint backend batch)
- **Sévérité** : 🟢 Mineur (perf, pas de perte de données)
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : les deux (fix propre nécessite un endpoint backend)
- **Découvert le** : 2026-07-16
- **Fichiers** : `src/components/menu-fb/views/component-library/views/componentListView.vue:loadSubItemsData`,
  `src/components/menu-fb/views/component-library/views/ComponentCreateView.vue:loadComponentData`

## Symptôme

Ouvrir le tiroir "sub-items" d'un composant sur `/components`, ou ouvrir `/components/edit/:id` d'un
composant ayant beaucoup d'ingrédients, déclenche un appel `getIngredient(id)` **par ingrédient** (via
`Promise.all`), au lieu d'un seul appel batch. Pour un composant à 20+ ingrédients, cela fait 20+
requêtes concurrentes à chaque ouverture, sans indicateur de chargement par ligne (seul un spinner
global existe).

## Cause racine

Aucun endpoint backend `GET /ingredients?ids=...` (batch) n'existe actuellement — seul `GET
/ingredients/:id` (unitaire) et `GET /ingredients/by-market-price/:marketPriceId` sont exposés
(`ingredients.controller.ts`). Les deux écrans front doivent donc boucler.

## Correction

Non traité dans ce lot : un fix propre nécessite un nouvel endpoint backend batch (`GET
/ingredients?ids=a,b,c` ou équivalent), ce qui dépasse le périmètre "page /components front" de cette
série de corrections et mérite un arbitrage produit/perf séparé (le volume réel de composants avec
beaucoup d'ingrédients n'a pas été mesuré). Documenté ici pour que le prochain dev qui retouche ces
deux écrans sache que le pattern N+1 est connu et pourquoi il n'a pas été traité.

## Risque de régression / à surveiller

Si un tenant crée des composants avec un nombre d'ingrédients très élevé (50+), surveiller le temps
de chargement du tiroir/formulaire d'édition et le nombre de requêtes concurrentes envoyées au
backend.

## Références

- `backend/src/features/ingredients/ingredients.controller.ts` — routes actuelles, aucune variante
  batch.
