# BUG-224 — « Inventaire pré-événement » absent du sélecteur Outils sur Analyse et Prédire

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟢 Mineur (écran atteignable par URL et depuis les autres pages — mais la nav
  inter-écrans, censée être identique partout, avait un trou sur 2 des 6 écrans)
- **Domaine** : Analyse & agrégation / Stock
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-20 (retour utilisateur : « dans la liste des outils, je ne vois pas
  "inventaire pré événement" sur les pages analyse et prédire »)
- **Fichiers** : `src/components/analyse/filters/FilterPanel.vue:596-603` (`toolboxItems`),
  `:578-592` (`onToolboxSelect`)

## Symptôme

Le sélecteur « Outils » (`WorkspaceToolSelect`) listait `space-pre-inventory` sur Space Inventory
(`SpaceInventoryView.vue:685`), Logistique (`SpaceLogisticView.vue:443`), Réarmement
(`SpaceRestockView.vue:1065`) et Event Predict (`EventPredictView.vue:1260`) — mais **pas** sur
Analyse ni sur Prédire. Depuis ces deux écrans, l'inventaire pré-événement n'était atteignable
qu'en tapant `/spaces/:spaceId/pre-inventory` ou en passant par un autre écran.

## Cause racine

Analyse et Prédire ne sont **pas deux pages** : « Prédire » est le mode `predict` du toolbox
*interne* à `AnalyseView` (même route `/spaces/:spaceId`, `?toolbox=predict`). Les deux partagent
donc le même `FilterPanel.vue`, dont la liste `toolboxItems` — écrite avant l'ajout de la route
`space-pre-inventory` (branche `feat/postEventInventory`) — n'a jamais été mise à jour. Elle
sautait de `event-predict` à `space-inventory`.

`onToolboxSelect` n'avait pas non plus de branche de navigation pour cette valeur : même ajoutée à
la liste, elle serait tombée dans le `localToolbox.value = v` final (valeur inconnue du toolbox
interne, qui ne connaît que `analyse` / `predict` / `event-predict`).

## Correction

Appliquée le 2026-07-20 sur `feat/postEventInventory`, dans `FilterPanel.vue` uniquement :

- computed `spacePreInventoryPath` → `/spaces/${spaceId}/pre-inventory` ;
- branche `if (v === 'space-pre-inventory')` dans `onToolboxSelect`, avant `space-inventory` ;
- entrée `{ value: 'space-pre-inventory', label: t('anToolPreInventory'), icon: 'mdi-clipboard-arrow-up-outline' }`
  insérée **avant** `space-inventory` — même ordre et même icône que sur les 4 autres écrans ;
- clé i18n `anToolPreInventory` (FR « Inventaire pré-événement » / EN « Pre-event Inventory »),
  conforme au préfixe `anTool*` du fichier.

**Pas de champ `permission`** : aucune entrée de `toolboxItems` dans `FilterPanel` n'en porte
(`space-inventory`, `logistic`, `restock` non plus) — l'accès est garanti par le guard de la route
`space-pre-inventory` (`permission: 'front.fb.spaceInventory'`, `router/index.js:183`). Gater ici
seulement aurait été incohérent avec les 3 voisines.

## Risque de régression / à surveiller

- Divergence connue et **non traitée ici** : les listes d'outils de `SpaceInventoryView` /
  `SpaceLogisticView` / `SpaceRestockView` / `EventPredictView` sont filtrées par permission,
  celle de `FilterPanel` ne l'est pas. Un utilisateur sans `front.fb.spaceInventory` verra donc
  l'entrée depuis Analyse/Prédire et sera renvoyé par le guard — comportement **inchangé** par ce
  correctif (déjà le cas pour `space-inventory`). Factorisation des 5 listes = candidat à une
  fiche dédiée.
- **Non reproduit en navigateur** dans cette session (pas de `pnpm dev`) — à valider manuellement,
  sur les deux modes (`?toolbox=predict` inclus).

## Références

- [`../modules/10_POST_EVENT_INVENTORY.md`](../modules/10_POST_EVENT_INVENTORY.md) § 8 (route
  `space-pre-inventory`, même composant en mode `pre`).

---

Rédaction : **JLH**, 2026-07-20.
