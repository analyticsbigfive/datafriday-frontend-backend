# BUG-274-02 — Menus des Espaces : les stands Merch apparaissent dans la liste des PDV assignables à un menu item

- **Statut** : 🟢 Corrigé (2026-08-02)
- **Sévérité** : 🟠 Majeur (permet une association métier incohérente : vendre un `MenuItem`
  boisson/nourriture sur un stand merchandising)
- **Domaine** : Menu & recettes (Space Menus)
- **Repo(s) concerné(s)** : `datafriday-web` (frontend uniquement)
- **Découvert le** : 2026-08-02 (signalé par l'utilisateur, capture d'écran à l'appui)
- **Fichiers** : `src/components/menu-fb/views/space-menus/views/SpaceMenuView.vue:291-303`

## Symptôme

Sur `/menu-fb` → Menus des Espaces (les deux onglets « Par boutique » et « Par menu item »), la
liste des points de vente affiche aussi les stands merchandising (« Merch 1 », « Merch 2 », type
`merchshop`) au milieu des vrais PDV F&B (« shop », « VISITEUR », « Vente à la place », « Droit »).
Rien n'empêchait techniquement de cocher un stand Merch pour lui assigner un `MenuItem` type
boisson (« Tsing Tao 25cl »), association qui ne correspond à aucun flux produit réel.

## Cause racine

`SpaceMenuView.vue:291-297` (`shops` computed) ne filtrait que par `configId`, sans filtre de
`type`. La liste vient de `GET /spaces/:id/shops?configId=...`
(`spaces.service.ts:928`, `getSpaceShops`), dont le `shopTypes` inclut délibérément `merchshop` :
```
['shop', 'fnb_food', 'fnb_beverages', 'fnb_bar', 'fnb_snack', 'fnb_icecream', 'merchshop']
```
— une liste copiée de `EVENT_TIMELINE_SHOP_TYPES`/`logistics.SHOP_TYPES`, où `merchshop` a
légitimement sa place (revenu, stock). Ce même endpoint est aussi consommé par Restock, Event
Predict, Analyse et le wizard Weezevent — filtrer côté backend aurait changé le comportement de ces
4 écrans, où `merchshop` doit rester. Confirmé que rien dans le modèle (`MenuAssignment`) n'impose
de contrainte de type d'élément : ça « marchait » par omission, pas par conception — le stock des
stands Merch passe par l'entité `Article`, pas `MenuItem` (cf. `StorageShopsSection.vue`).

## Correction

Filtre ajouté côté frontend, au point de choix unique qui alimente les deux onglets
(`SpaceMenuView.vue:291-303`, `shops` computed) : `shop?.type !== 'merchshop'`. `filteredShops`,
`openShopsCount`/`closedShopsCount` et le compteur "X boutiques" en héritent automatiquement (tous
dérivés de `shops`). Backend et `spaceShops.js` (store partagé) non touchés — aucun effet sur les
autres consommateurs du même endpoint.

## Risque de régression / à surveiller

- Si un tenant avait déjà assigné un `MenuItem` à un stand Merch avant ce correctif, l'association
  reste en base (`MenuAssignment`) mais devient invisible/impossible à modifier depuis cet écran —
  pas de backfill effectué, pas de garde-fou backend ajouté non plus (`POST /space-menu` accepte
  toujours n'importe quel `spaceElementId`). Purement un fix d'affichage/sélection frontend.
- Si un futur type d'élément F&B est ajouté au backend (`ElementType` compte 19 valeurs au total,
  seules 7 remontent déjà via `getSpaceShops`), il apparaîtra ici par défaut sauf s'il s'agit de
  `merchshop` — cohérent avec l'intention (exclure seulement le merchandising, pas le F&B).

## Références

- Précédent dans le code pour un filtre "PDV F&B réel" plus restrictif que `merchshop`-inclus :
  `backend/src/features/staffing/staffing.service.ts:26`
  (`STAFFING_ELEMENT_TYPES`, exclut déjà `merchshop`).
