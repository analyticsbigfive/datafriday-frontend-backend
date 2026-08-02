# BUG-275-02 — Merch (`merchshop`) infiltré dans l'assignation menu (Event Predict) et dupliqué (Inventory)

- **Statut** : ⚪ Diagnostiqué (root cause connue, correctif écrit et testé, **retiré de
  `develop` le 2026-08-02** à la demande de l'utilisateur — préservé sur la branche
  `fix/bug-275-merchshop-predict-inventory`, à merger séparément)
- **Sévérité** : 🟠 Majeur (Event Predict : écriture d'une association métier incohérente,
  même famille que BUG-274, atteignable depuis un 2ᵉ écran non couvert par ce fix-là) /
  🟡 Mineur (Inventory : affichage dupliqué, pas d'écriture)
- **Domaine** : Prévision (Event Predict) & Stock (Inventory)
- **Repo(s) concerné(s)** : `datafriday-web` (frontend uniquement)
- **Découvert le** : 2026-08-02, lors d'un audit demandé après BUG-274 ("y a-t-il d'autres
  cas du même genre ?")
- **Fichiers** : `src/components/EventPredictMenusSection.vue:1001-1019`,
  `src/composables/useInventoryData.js:35-41`

## Symptôme

**Event Predict → onglet Menus** : possible de cocher un `MenuItem` F&B (ex. "Tsing Tao 25cl") sur
une carte de stand Merch — écrit via le même `POST /space-menu` que BUG-274 avait corrigé côté
Space Menus, mais accessible depuis un second écran totalement différent, non couvert par ce
premier correctif.

**Inventory → onglet "Shops"** : chaque stand Merch apparaît en double — une fois (à raison) dans
son propre onglet "Merch", une seconde fois (à tort) dans l'onglet "Shops" sous forme de carte
vide "aucun menu" (le Merch n'a jamais de `MenuAssignment`, son stock passe par l'entité `Article`).
Ce doublon fausse aussi les agrégats qui concatènent `realShops`/`realMerch`
(`SpaceInventoryView.vue`, plusieurs endroits) — un même élément compté deux fois.

## Cause racine

Même origine que BUG-274 : `GET /spaces/:id/shops` renvoie délibérément `merchshop` dans son
`shopTypes` (légitime pour le revenu/stock, cf. `EVENT_TIMELINE_SHOP_TYPES`/`logistics.SHOP_TYPES`)
— cet endpoint alimente plusieurs écrans, et chacun doit filtrer selon SON propre contexte métier,
pas se fier à un filtre déjà fait ailleurs. BUG-274 n'avait fixé que `SpaceMenuView.vue` ; deux
autres consommateurs du même endpoint souffraient du même manque de filtre :

- **`EventPredictMenusSection.vue`** (`fbElements` computed, branche "source AUTORITAIRE"
  `configShops`, :1001-1016) : `configShops` (prop, dérivée de `/spaces/:id/shops` côté
  `EventPredictView.vue`) était réutilisée telle quelle, sans filtre de `type`. Le nom même du
  computed (« fbElements » = F&B elements) trahit l'intention jamais appliquée.
- **`useInventoryData.js`** (`buildConfigShopList`, boucle sur `rows` = résultat brut de
  `/spaces/:id/shops`, :35) : contrairement à la boucle jumelle sur `floors` juste en dessous
  (:61, `if (el?.type !== 'shop') continue`), celle-ci ingérait tout sans filtre de `type`.

## Correction

**⚠️ Écrite, testée, puis retirée de `develop` le 2026-08-02** à la demande de l'utilisateur —
non pas parce que le correctif serait incorrect, mais pour le faire vivre sur une branche dédiée
plutôt que mêlé au reste des commits de cette session. Le commit d'origine (`4298fd9e`, qui
groupait aussi BUG-274 — **conservé sur `develop`**, non concerné par ce retrait) reste
accessible sur la branche `fix/bug-275-merchshop-predict-inventory` pour merge séparé.

Même principe que BUG-274 : filtre ajouté **au point de consommation**, jamais dans l'endpoint ou
le store partagés (pour ne pas affecter les autres consommateurs légitimes du même endpoint —
revenu event, CA par shop dans `EventPredictView.vue`, agrégats logistique).

- `EventPredictMenusSection.vue:1001-1019` : `this.configShops` filtré (`el?.type !== 'merchshop'`)
  avant utilisation dans `fbElements` — propage correctement à tous les usages downstream du même
  computed (compteurs shops ouverts/fermés, CA par shop **dans l'onglet Menus**, recherche/filtre).
  `configShops` lui-même (la prop) reste inchangé : `EventPredictView.vue` continue de l'utiliser
  tel quel pour le CA global de l'event, où merch doit rester.
- `useInventoryData.js:35-41` : `rows` filtré en tête de boucle dans `buildConfigShopList`
  (`if (r?.type === 'merchshop') continue`), avant construction des entrées. `merchElements`/
  `merchWithInventory` (onglet Merch dédié) restent sourcés indépendamment depuis `floors` —
  aucune régression sur l'affichage réel du Merch, seul le doublon dans l'onglet Shops disparaît.

## Risque de régression / à surveiller

- Vérifié : la boucle jumelle de `buildConfigShopList` sur `floors` (:61) filtrait déjà
  `type !== 'shop'`, donc n'introduisait pas ce même bug par un autre chemin — seule la boucle
  `rows` avait le trou.
- Vérifié : `configShops` (la prop elle-même, non filtrée) reste utilisée sans modification par
  `EventPredictView.vue` pour son propre calcul de CA d'event (`configShopElements`,
  `closedShopNormSet`) — intentionnellement non touché, merch y est un revenu légitime.
- **Écarté du périmètre** (audit fait, verdict "correct en l'état", pas de fix nécessaire) :
  `StepMapShops.vue` (picker de TYPE, `merchshop` y est une option légitime, pas un bug),
  `store/modules/analyse.js` (dimension revenu, merch légitime), `SpaceRestockView.vue`
  (lecture seule de `MenuAssignment` existants, aucune écriture, un merchshop sans assignation ne
  produit aucune ligne fantôme). `StepMapSpace.vue`/`StepMapShops.vue`/`analyse.js` non modifiés.
- **Dette cosmétique identifiée, non corrigée** (hors périmètre, faible priorité) :
  `elementTaxonomy.js:150` (`SELLER_TYPES`) fait apparaître les sections Builder2 "Menu"/
  "Inventory" (lecture seule) sur un élément Merch sélectionné — toujours vides/non pertinentes
  pour ce type, jamais de mauvaise écriture possible (lecture seule), pure UX à améliorer plus tard.
- Aucun garde-fou backend ajouté sur `POST /space-menu` (même remarque que BUG-274) : un appel
  API direct avec un `spaceElementId` de type `merchshop` resterait accepté côté serveur — les deux
  fiches documentent ce même risque résiduel, à traiter ensemble si jamais arbitré.

## Références

- [BUG-274](274_02_spacemenu_merchshop_visible_dans_assignation_menuitem.md) — même cause racine,
  premier écran corrigé (Space Menus).
