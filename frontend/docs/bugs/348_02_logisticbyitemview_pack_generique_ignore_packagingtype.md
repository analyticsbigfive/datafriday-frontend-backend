# BUG-348-02 — Écran Logistique : conditionnement générique "pack" au lieu du vrai type, à 5 endroits (en-tête, lignes dépliées, besoin prédit — vue "Par article" ET carte par PDV)

- **Statut** : 🟡 Corrigé non testé
- **Sévérité** : 🟠 Majeur
- **Domaine** : Stock (Logistique)
- **Repo(s) concerné(s)** : `datafriday-web` (frontend seul)
- **Découvert le** : 2026-08-20 (suite au signalement Ulrich sur le panneau Inventaire du
  Builder, BUG-347-02 — capture d'écran de `/spaces/:id/logistic`, ligne "Twix 25/26 · 32
  Pc/pack" alors que le Market Price est configuré "purchased in Carton of 32 Pc"). Question de
  suivi ("et pour la liste des menu item dans la vue par shop ?") a fait remonter un second foyer
  dans la carte article par PDV, puis un balayage complet du module Logistique ("tu peux
  regarder tout ce qui est dans logistique pour ne rien oublier ?") un troisième foyer dans les
  lignes dépliées par PDV, puis une nouvelle capture ("il reste maintenant à utiliser le bon
  pack derrière le predicted") deux derniers foyers sur le libellé "N predicted" du besoin
  prédit, aux deux mêmes composants.
- **Fichiers** :
  - `frontend/src/components/LogisticByItemView.vue:41` (en-tête groupe), `:73`/`:74` (lignes
    dépliées par PDV, quantité et besoin prédit), `:43` (besoin prédit groupe), `:161-185`
    (`groupedItems`)
  - `frontend/src/components/LogisticItemCard.vue:17-19` (en-tête), `:63` (besoin prédit)

## Symptôme

Sur l'écran Logistique (`/spaces/:id/logistic`), le conditionnement réel configuré ("Carton"
pour Twix, "Fût"/Keg pour Tsingtao, "Pipette" pour Chimichuri...) était remplacé par un mot
générique à CINQ endroits :

1. Onglet "Par article", en-tête de groupe replié — `"{N} {unit}/pack"` littéral
   (`LogisticByItemView.vue:41`).
2. Onglet "Par article", lignes dépliées par PDV, quantité — `"{N} Packed · {M} Loose"`
   générique (`LogisticByItemView.vue:73`).
3. Onglet "Par article", besoin prédit (en-tête ET lignes dépliées) — `"{N} predicted packs"`
   générique (`LogisticByItemView.vue:43,74`), alors que l'en-tête (point 1, une fois corrigé)
   affiche déjà "32 Pc/Carton" pour ce même groupe.
4. Carte article dans la grille niveau 2 (après clic sur un PDV/Storage) — ligne d'en-tête
   `LogisticItemCard.vue:17-19`, juste au-dessus du champ "Packed" plus bas dans la même carte,
   qui lui affichait déjà le bon libellé ("Number of Cartons of 1kg" via `packLabel`).
5. Même carte, besoin prédit — `"{N} packs"` générique (`LogisticItemCard.vue:63`).

Dans tous les cas, une autre partie du MÊME écran (ou de la MÊME carte) prouve que la donnée
réelle est disponible et déjà exploitée correctement ailleurs — d'où l'impression persistante
d'un bug non réglé même après un premier correctif, en changeant d'onglet ou en dépliant une
ligne. Les points 3 et 5 (besoin prédit) ont été trouvés dans un second temps, après une
capture montrant "27 predicted packs" alors que l'en-tête du même article affichait déjà "0.75
Kg/Pipette".

## Cause racine

Littéral `/pack` codé en dur, couple "Packed"/"Loose" générique reconstruit à la main, et mot
générique `logiPacksShort` ("packs") utilisé pour le besoin prédit — au lieu de l'utilitaire/du
champ déjà disponibles pour cet exact usage :

```vue
&lt;!-- LogisticByItemView.vue:41 --&gt;
&lt;template v-if="group.unitsPerPack"&gt;{{ group.unitsPerPack }} {{ group.unit || t('logiUnits') }}/pack&lt;/template&gt;

&lt;!-- LogisticByItemView.vue:73 --&gt;
{{ row.packed }} &lt;small&gt;{{ t('logiPackedShort') }}&lt;/small&gt; · {{ formatUnits(row.loose) }} &lt;small&gt;{{ t('logiLooseShort') }}&lt;/small&gt;

&lt;!-- LogisticByItemView.vue:43 et :74 --&gt;
{{ group.totalPredictedPacks }} {{ t('logiByItemPredictedTotal') }}  &lt;!-- = "predicted packs" --&gt;
{{ row.predictedNeedPacks }} &lt;small&gt;{{ t('logiPacksShort') }} {{ t('logiPredictedShort') }}&lt;/small&gt;

&lt;!-- LogisticItemCard.vue:17-19 --&gt;
&lt;div v-if="unitsPerPack" class="lg-item-unit"&gt;
  {{ unitsPerPack }} {{ item?.unit || t('logiUnits') }}/pack
&lt;/div&gt;

&lt;!-- LogisticItemCard.vue:63 --&gt;
{{ predictedNeedPacksDisplay }}&lt;span class="lg-field-unit"&gt;{{ t('logiPacksShort') }}&lt;/span&gt;
```

Dans tous les cas, `item.packagingType` (résolu côté backend, `LogisticsService.getStock`) est
disponible sur l'objet consommé (`row.item`/`item`/`group.packagingType`), mais n'était
simplement jamais lu par CES lignes précises. Pour le point 2, l'utilitaire partagé
`compactQtyLabel` (`@/composables/useLogisticUnitLabels.js`) fait déjà exactement ce travail et
est déjà utilisé avec succès ailleurs dans le même module (`LogisticLossesDrawer.vue`,
`LogisticItemCard.vue` pour les transferts en attente) — il n'était simplement pas
importé/utilisé ici. Ce n'est donc pas un repli sur une résolution manquante (comme
BUG-347-02/345-01, catalogue tronqué + résolution par nom) : c'est une valeur déjà résolue et
disponible, mais ignorée par ces lignes précises.

## Correction

- `LogisticByItemView.vue` (en-tête, `:41`) : `groupedItems` capture désormais
  `item.packagingType` sur `group.packagingType` (même pattern que `group.unit`/`group.picture`).
  Nouvelle fonction `packagingTypeLabel(group)` (réutilise `translatePackagingType`), repli sur
  le mot générique `logiPacksShort` ("packs") uniquement si aucun type n'est configuré.
  Template : `/pack` → `/{{ packagingTypeLabel(group) }}`.
- `LogisticByItemView.vue` (lignes dépliées, quantité `:73`) : remplacé par un appel à
  `compactQtyLabel` importé de `useLogisticUnitLabels.js` — même helper, même signature que
  dans `LogisticLossesDrawer.vue`.
- `LogisticByItemView.vue` (besoin prédit, `:43` et `:74`) : nouvelle fonction
  `predictedPacksLabel(group)` (réutilise `translatePackagingType` + `pluralize`, même repli
  `logiPacksShort`), remplace `t('logiByItemPredictedTotal')` et
  `t('logiPacksShort') + t('logiPredictedShort')` aux deux endroits — libellé désormais
  cohérent entre en-tête et lignes dépliées.
- `LogisticItemCard.vue` (en-tête, `:17-19`) : réutilise `localizedPackagingType` déjà calculé
  dans ce même fichier pour `packLabel` : `/pack` → `/{{ localizedPackagingType || t('logiPacksShort') }}`.
- `LogisticItemCard.vue` (besoin prédit, `:63`) : même `localizedPackagingType`, pluralisé
  (`pluralize`, déjà importé) au lieu de `logiPacksShort` systématique.

## Risque de régression / à surveiller

- Vérifier en recette que "Twix 25/26" affiche "32 Pc/Carton" et que "Chimichuri 25/26" affiche
  "0.75 Kg/Pipette" partout — en-tête, lignes dépliées, ET besoin prédit ("N Pipettes
  predicted" au lieu de "N predicted packs") — aux deux composants (onglet "Par article" ET
  carte par PDV).
- Vérifier que "Tsingtao - fut 30L" affiche son type réel plutôt que "pack"/"Packed" générique
  partout.
- Vérifier qu'un article sans conditionnement configuré affiche toujours le repli générique
  sans erreur, partout.
- Le nouveau format des lignes dépliées (`compactQtyLabel`, ex. "5 Cartons (32 Pc) + 1,2 Pc
  vrac") remplace l'ancien affichage à deux colonnes distinctes ("5 Packed · 1.2 Loose") — à
  valider visuellement, changement de format assumé pour rester cohérent avec le reste du
  module, pas juste une correction de texte.
- `logiByItemPredictedTotal` (i18n) devient orpheline (plus référencée) — laissée en place,
  pas de nettoyage de clé i18n dans ce fix.
- Pas de changement backend, pas de migration — uniquement ces deux fichiers frontend.
- Balayage complet du reste du module Logistique (tous les `Logistic*.vue`, le composable
  `useLogisticUnitLabels.js`, le store `logistics.js`) effectué le 2026-08-20 : aucun autre
  foyer du même littéral trouvé. Quelques écrans (`LogisticHistoryDrawer.vue`,
  `LogisticSimulateSaleDialog.vue`) utilisent encore le mot générique "Packed"/"Loose", mais
  légitimement : ils ne reçoivent que des clés `itemKey` (string), pas l'objet `item` complet —
  pas une donnée ignorée, une donnée non plombée jusque-là (amélioration possible, pas un bug).

## Références

- BUG-347-02 (panneau Inventaire Builder, même symptôme visuel "Pack" générique, cause
  différente : catalogue tronqué + résolution par nom, alors qu'ici la donnée était déjà
  disponible et simplement ignorée).

Ulrich
