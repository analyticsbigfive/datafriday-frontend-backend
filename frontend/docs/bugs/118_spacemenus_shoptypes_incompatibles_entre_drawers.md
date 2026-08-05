# BUG-118 — Deux tiroirs éditent les "types de shop" avec des noms de champ incompatibles → écrasement silencieux

- **Statut** : 🟢 Corrigé (2026-07-30 — le correctif du 2026-07-17 ci-dessous était incomplet, voir
  "Correction complémentaire" en bas de fiche)
- **Sévérité** : 🟠 Majeur
- **Domaine** : Menu & recettes — module Space Menus
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-17
- **Fichiers** : `src/components/menu-fb/views/space-menus/drawers/SpaceMenuEditShopDrawer.vue:159-166,172-173,205-209`,
  `src/components/menu-fb/views/space-menus/drawers/ShopDetailEditDrawer.vue:178-186,221-226`,
  `src/components/menu-fb/views/space-menus/views/SpaceMenuView.vue:445-470` (`normalizeShop`)

## Symptôme

Ouvrir le tiroir d'édition d'un shop depuis `SpaceMenuView.vue` (icône crayon sur la carte shop,
`SpaceMenuEditShopDrawer`) et cliquer "Save Changes" **sans toucher aux pills de type** écrase
silencieusement les types réels du shop (ex. `Beer`, `GP Premium`) par la valeur par défaut
`['food', 'beverages']`. L'utilisateur qui venait juste changer l'image perd la configuration de
type du shop sans aucun avertissement.

## Cause racine

`SpaceMenuEditShopDrawer.vue:172-173` lit `this.shop.selectedTypes` pour initialiser le formulaire :
```js
this.form = { ...this.shop, selectedTypes: this.shop.selectedTypes || ['food', 'beverages'] };
```
Mais `normalizeShop()` (`SpaceMenuView.vue:445-470`) — la seule fonction qui construit les objets
`shop` passés à ce tiroir — ne définit **jamais** de champ `selectedTypes` (seulement
`id/name/image/location/address/city/country/type/isOpen/menuItemsCount/_raw`). `shop.selectedTypes`
est donc toujours `undefined`, et le tiroir retombe **systématiquement** sur le défaut codé en dur,
quel que soit le type réel du shop. Le `save()` (`:200-216`) PATCHe ensuite ce défaut vers le
backend.

En parallèle, `ShopDetailEditDrawer.vue` édite le *même concept* sous un nom de champ et des
valeurs différents : `subTypes` avec les valeurs `Food/Beverages/Beer/GP Premium/Temporary/Drinkee`
(casse capitalisée), contre `selectedTypes` avec `food/beverages/beer/gp_premium/temporary/drinkee`
(minuscules/snake_case) côté `SpaceMenuEditShopDrawer`. Les deux tiroirs ne peuvent jamais lire ce
que l'autre a écrit — la duplication de code entre les deux (~70% identique, cf. BUG-121) a laissé
diverger leurs contrats de données sans que personne ne s'en aperçoive.

## Correction

`SpaceMenuEditShopDrawer.vue` aligné sur le contrat réel du backend/du shop (`subTypes`, valeurs
capitalisées `Food/Beverages/Beer/GP Premium/Temporary/Drinkee`, identique à
`ShopDetailEditDrawer.vue`) : le formulaire lit et écrit désormais `shop.subTypes` au lieu de
`shop.selectedTypes`, sans valeur par défaut arbitraire qui écraserait un type existant non lu.

## Risque de régression / à surveiller

- Vérifier qu'un shop avec un type existant (`Beer`, `Temporary`, etc.) garde bien ce type après un
  save "sans y toucher" depuis `SpaceMenuEditShopDrawer`.
- Vérifier que les types édités depuis `SpaceMenuEditShopDrawer` sont bien lus/affichés
  correctement par `ShopDetailEditDrawer` sur le même shop, et réciproquement.

## Correction complémentaire (2026-07-30)

Le correctif du 2026-07-17 ci-dessus alignait les deux tiroirs entre eux (`subTypes`, valeurs
capitalisées) mais n'avait jamais été confronté au contrat réel du backend — trois bugs
supplémentaires, tous plus graves, subsistaient :

1. **Champ rejeté (bloquant)** — `PATCH /configurations/elements/:id`
   (`update-space-element.dto.ts`) n'accepte que `shopTypes`, jamais `subTypes`. Avec le
   `ValidationPipe` global (`whitelist` + `forbidNonWhitelisted`, `main.ts:84-90`), toute sauvegarde
   de type depuis les deux tiroirs était rejetée en 400 — **aucune sauvegarde de type n'avait
   jamais fonctionné**, y compris après le correctif du 17/07.
2. **Mauvaise colonne** — même avec le bon nom de champ, cet endpoint écrit dans
   `SpaceElement.shopTypes` (colonne v1 héritée), jamais dans `SpaceElement.subtypes`, la seule
   colonne lue en priorité par Analyse (`analyse.js::getBuilder2SubtypesByName`) et par le Builder
   v2 — un save "réussi" aurait été silencieusement ignoré partout ailleurs.
3. **Vocabulaire incompatible** — la liste de pastilles des deux tiroirs (`Food`, `GP Premium`,
   `Drinkee`… 6 valeurs capitalisées) ne correspond pas à la taxonomie canonique Builder v2
   (`elementTaxonomy.js` : `food`, `gppremium`, `drinkee`… 9 valeurs minuscules, incluant
   `mixology`/`front_food`/`kitchen_food`) utilisée par la création Weezevent
   (`mapShopTypeTags`) et par la détection F&B du staffing RH (`fnb-tags.util.ts`).

### Fix réel

- Les deux tiroirs écrivent désormais via `PATCH /builder-v2/elements/:id` (`patchElement`,
  `builder-v2.api.js`) avec le champ `subtypes` — le seul endpoint/colonne réellement lu par
  Analyse et le staffing. Vérifié : les 725 `SpaceElement` de type shop en base sont déjà tous
  rattachés à une `Zone` (`zoneId` non nul, 0 élément legacy floor/forecourt), donc aucun shop
  n'est laissé de côté par ce changement.
- Les deux tiroirs partagent maintenant les valeurs canoniques via `TOOLS` (`elementTaxonomy.js`)
  + une présentation commune (`src/constants/shopSubtypePresentation.js`, icônes + clés i18n),
  au lieu de deux listes capitalisées dupliquées et déjà désynchronisées entre elles.
- `normalizeShop()` dans `SpaceMenuView.vue` ne propageait **aucun** champ de type vers le shop
  passé au tiroir (bug distinct, jamais documenté) : le formulaire s'ouvrait donc toujours avec
  une sélection vide quel que soit le vrai type du shop. Corrigé pour lire `s.shopTypes` (le champ
  de la réponse `GET /spaces/:id/shops`, déjà subtypes-prioritaire côté backend).
- `ShopDetailView.vue::normalizeShop()` (source de `ShopDetailEditDrawer`) avait le même trou, sur
  un troisième endpoint (`GET /space-menu/shop/:shopId` → `space-menus.service.ts::getShopMenu`)
  qui ne sélectionnait même pas la colonne `subtypes` en base — corrigé côté backend (ajout de
  `subtypes: true` au `select`, priorité `subtypes` > `shopTypes` dans la réponse), et côté
  frontend (rename `subTypes` → `subtypes`, badges du header traduits via la présentation
  partagée plutôt qu'affichés en valeur brute).
- Vérifié par test isolé direct (Prisma, shop fictif créé/nettoyé) : écriture via `subtypes`,
  relecture par les deux endpoints (`getShopMenu` et `getSpaceShops`) — les deux retournent bien
  la valeur à jour en priorité sur l'ancienne colonne `shopTypes`.

### Hors scope (à surveiller)

`SpaceMenusPanel.vue` (écran `MenuBuilder.vue`, distinct de Space Menus) édite aussi les types de
shop via `api.updateSpaceElement` (`utils/api.js`, monolithe legacy) — envoie déjà `shopTypes`
(bon nom de champ, pas cassé), mais écrit toujours dans la colonne `shopTypes` v1, pas
`subtypes`. Non corrigé ici (écran hors du signalement initial) ; à absorber dans le chantier de
taxonomie unifiée (RH/Builder/Space Menus) plutôt que patché isolément une 3e fois.

## Références

- [BUG-121](121_spacemenus_drawers_i18n_darkmode_incomplet.md) — dette de duplication entre les 2 tiroirs, cause racine de cette divergence.
