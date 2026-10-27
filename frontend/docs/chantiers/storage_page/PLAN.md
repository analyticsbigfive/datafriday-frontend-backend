# Page Stockage (Paramètres > Menu F&B) - plan

Statut : frontend codé (branche `feat/storage-page-fe`), non testé en navigateur, spec jest écrite mais non exécutée (pas de `node_modules` dans le worktree).

## Décisions
- Aucune table ni champ nouveau : on réutilise `ElementInventory` (`inventoryByConfig` du builder state). Une ligne = le NOM du produit (itemName du Market Price), `isCustom` true. Case cochée = `isRowStored(ligne)`, tampon = `quantity`.
- Exclusion « utilisé en recette » PAR PRODUIT (itemName) : une seule ligne Market Price du produit dans `recipe-usage` exclut tout le produit.
- Espaces d'une ligne Market Price = `Supplier.sites`. Une carte par produit et par ensemble d'espaces distinct ; à ensemble identique, la ligne la plus récente (createdAt/updatedAt). Produit sans espace : une carte sans pastille.
- Référence affichée `[ref]` : `supplierItem` de la ligne retenue, sinon le nom du produit (hypothèse, à confirmer).
- Drawer : PDV (shop, merchshop) et Storage via `normalizeType`, données du store `storageInventory` (builder state, relu en force à l'ouverture, invalidé après écriture). Tampon uniquement sur les Storage cochés. Pas de tampon sur PDV (question #91 chez Bertrand).
- Écritures : `PUT /builder-v2/elements/:id/inventory-row` sans configId (toutes configs membres), une requête par élément, regroupement 350 ms, sérialisé par élément. Décocher met `isStored:false`, ne supprime pas. Erreur : retour à l'état serveur et message.

## Contrat API
- `GET /market-prices/recipe-usage` -> `{ marketPriceIds: string[] }`
- `PUT /builder-v2/elements/:id/inventory-row?configId=` body `{ name, quantity?, isStored?, minStock?, maxStock?, unit? }`, droit `space.edit`, 400 si configId non membre.

## Fichiers
- Page : `components/menu-fb/views/storage/{views,components,drawers,utils}`
- Composables : `useStoragePage`, `useStorageSpots`, `useStorageRowWriter`
- Test : `tests/unit/storageProducts.spec.js`

## Reste à faire
- Recette navigateur (grille, filtres, Edit, drawer, écritures multi-configs).
- `unit` n'est pas envoyé à l'upsert (pas de règle définie).
- Permissions : la page est sous `menu.fb.components`, l'écriture exige `space.edit` côté backend ; un utilisateur sans ce droit verra l'erreur d'enregistrement.

## Tampon PDV et Commande étape 1 (réponse Bertrand 2026-10-27)
- Le tampon d'un PDV est saisi dans le drawer (même champ que les Storage, `ElementInventory.quantity`). Base prod au 2026-10-27 : 10 lignes de tampon, toutes sur des Storage, donc aucun conflit.
- `utils/pdvBufferRequirements.js` : lit les tampons des PDV de la config (types `shop`, `hospitality`, `kitchen`, comme le réarmement), pose `bufferQuantity` sur les lignes de besoin ou crée une ligne de besoin nul pour un produit hors recette.
- `SpaceRestockView.vue` (`stockRowsRaw`, `liveRestockRowsAll`) : cible = max(prévu ajusté, tampon). Le restant Logistic est ensuite soustrait par le calcul existant, soit un écart tampon moins Logistic.
- A confirmer en recette : cumul éventuel avec le prévu.
