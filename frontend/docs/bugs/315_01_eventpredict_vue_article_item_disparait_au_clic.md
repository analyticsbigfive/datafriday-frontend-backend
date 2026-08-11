# BUG-315-01 — EventPredict / Configuration, vue article : l'item « disparaît » quand on le coche/décoche

- **Statut** : 🟡 Corrigé non testé
- **Sévérité** : 🟠 Majeur (un clic modifie le Space Menu côté serveur pendant que la carte
  disparaît de l'écran — l'utilisateur peut défaire sa configuration sans s'en rendre compte)
- **Domaine** : Prévision (Event Predict)
- **Repo(s) concerné(s)** : `datafriday-web` (frontend seul — aucun changement backend)
- **Découvert le** : 2026-08-11 (repro JLH, chip-filtre actif)
- **Fichiers** : `src/components/EventPredictMenusSection.vue` (vue article),
  `src/components/EventPredictView.vue` (`handleAssignShopItem`), `src/i18n/translations.js`

## Symptôme

Onglet Configuration d'Event Predict, vue « article » (`viewMode === 'item'`), un chip-filtre
global actif (« Article sans prévision » ou « Article hors Space Menu ») : cliquer la checkbox
d'un item le fait disparaître de la liste — parfois en deux temps (saut immédiat, puis
disparition ~1 aller-retour réseau plus tard). L'item n'est pas perdu (il revient en enlevant le
chip), mais rien ne l'indique, et le clic a réellement modifié l'attachement au Space Menu.

## Cause racine

La liste est recalculée en direct à chaque clic, et le clic change précisément les propriétés
que les filtres/tris testent. Cinq mécanismes, par ordre de force (lignes AVANT correctif) :

1. **Chip-filtre actif (cas rapporté)** — `filteredMenuItemsForItemView`
   (`EventPredictMenusSection.vue:1723`) ré-applique `entryMatchesChip` (:2804) à chaque
   recalcul :
   - chip « hors Space Menu » + **cocher** → `assign-shop-item` rattache l'item → `_mapGroup`
     passe `'other'` (:1708) → filtré hors liste ;
   - chip « sans prévision » + **décocher la dernière attache** → `_mapGroup` passe `'unmapped'`
     → échoue le garde `entry._mapGroup !== 'unmapped'` (:2807) → filtré hors liste.
2. **Décocher = détacher, write-through** — `onItemCheckboxChange` (:2592) émet
   `assign-shop-item` ; `handleAssignShopItem` (`EventPredictView.vue:4563`) POSTe puis
   invalide/refetch le cache d'assignation (:4611-4612). Un item présent **uniquement** via son
   assignation (absent de `menuItems`/`syntheticItemsById`) sort alors de
   `groupByMenuItemArray` : `if (!mi) continue` (:1677) ou `if (!shops.length) continue`
   (:1700) → disparition réelle, même sans chip.
3. **Re-tri réactif** — tri « cochés d'abord » (:1747-1751) : la carte se téléporte haut ↔ bas
   de liste à chaque coche.
4. **Bascule « Non rattachés »** — item détaché partout : l'entrée survit mais est repoussée en
   bas sous l'en-tête « Non rattachés » (`groupedItemViewEntries` :1714).
5. **Chemin secondaire** — décocher le dernier item d'un PDV fait passer `menuItemsCount` à 0 →
   MAJ optimiste `isOpen: false` (`EventPredictView.vue:4595-4597`) → `getPredictedQuantity` /
   `getAdjustedQuantity` retournent 0 pour tout le shop (:1998/:2020).

Amplificateur : la case d'en-tête de carte (`handleSelectAllForMenuItem` :2705) détache/rattache
l'item sur **tous** les PDV en un clic (1, 2 et 4 d'un coup).

## Correction

Comportement « naturel » (décision JLH 2026-08-11), vue article uniquement, PDV intouchée :

1. **Tri alphabétique stable** — le critère `hasSelection` est retiré du `sort` de
   `filteredMenuItemsForItemView` (les `disabled` des sliders continuent de le lire) : une coche
   ne déplace plus jamais une carte.
2. **Rétention sous chip actif** (pattern liste de tâches) — `toggleGlobalChip` capture une
   « session » (`chipSessionIds` / `chipSessionEntries`) = les entrées qui matchent à
   l'activation. Le filtre devient `matche le chip OU appartient à la session` : l'item traité
   reste affiché, grisé (`.ep-card-treated`) avec badge vert « ✓ traité »
   (`epmChipTreatedBadge`), pendant que le compteur du chip décrémente (compteurs restés live).
   Il ne sort de la liste qu'à la désactivation/réactivation du chip ou au changement de
   vue/onglet statut (`resetChipSession`). Les entrées sorties de `groupByMenuItemArray`
   (mécanisme 2) sont rendues depuis la dernière entrée connue (« ghost », re-cochable — l'état
   de coche vient de `selectedMenuItems`, toujours vivant ; re-cocher ré-attache et l'entrée
   live revient au refetch).
3. **Animation** — la liste est enveloppée dans un `<transition-group>` (`ep-item-list`,
   ~200 ms) : les mouvements restants (bascule « Non rattachés », recomposition au changement de
   chip) sont vus au lieu d'une disparition sèche. Wrapper `div.ep-item-entry` par entrée
   (transition-group exige un nœud keyé), masqué quand vide (`:empty`).

Non traité ici (question UX ouverte) : rendre plus visible que décocher **détache réellement**
l'article du Space Menu côté serveur (toast / undo) — à trancher avec Bertrand si besoin.

## Risque de régression / à surveiller

- Hydratation en vagues (2a/2b de `useSpaceData`) : un item qui matche le chip APRÈS
  l'activation entre par le filtre live (hors session) — vérifier qu'il apparaît bien en cours
  de chargement.
- `unmappedItemViewCount()` compte désormais aussi les entrées retenues/ghost `unmapped` de la
  session — écart possible avec le compteur du chip (live). Cosmétique, à vérifier.
- Empty state (`groupedItemViewEntries.length === 0`) : inchangé, mais le `v-else` porte
  maintenant sur le `<transition-group>`.
- QA manuelle : les 7 points listés dans le plan de session (tri stable sans chip, rétention
  sous chaque chip, recomposition au changement de filtre, bascule article ↔ PDV, recherche,
  hard refresh, item détaché partout → glisse animé vers « Non rattachés »).

## Références

- [312-01](312_01_eventpredict_maquettes_toolbar_alias_flicker.md) — chips-filtres globaux
  introduits là.
- [313-01](313_01_eventpredict_kebab_article_bulk_space_menus.md) — actions groupées vue
  article (même écran).
- [291-02](291_02_eventpredict_menuitem_indisponible_compte_comme_vente.md) — précédent d'un
  article « qui ressort par une autre porte » selon le bucket.

JLH
