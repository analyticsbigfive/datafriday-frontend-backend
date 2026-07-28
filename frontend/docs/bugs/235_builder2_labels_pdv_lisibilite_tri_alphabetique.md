# BUG-235 — Builder v2 — libellés PDV illisibles (ton sur ton) + liste non triée

- **Statut** : 🟡 Corrigé non déployé
- **Sévérité** : 🟡 Mineur (lisibilité / confort d'usage)
- **Domaine** : Espaces & builder (builder v2)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-28
- **Fichiers** :
  - `src/components/spaces/views/builder2/components/canvas/PlanCanvas.vue:318-328`
  - `src/components/spaces/views/builder2/components/panels/ElementListPanel.vue:180-201`

## Symptôme

Deux remarques faites par Bertrand (PO) sur le 3D builder v2 :

1. **Noms des PDV illisibles.** Dans la vue 2D « Drawing: shop », le nom de chaque PDV (point de
   vente / shop) est écrit **par-dessus** sa forme, dans une couleur dérivée de celle de la forme
   → effet « ton sur ton », texte quasi invisible (ex. « Food Court 1 » noyé dans le rectangle).
2. **Liste des éléments non triée.** Quand on sélectionne un type dans l'Element Palette, le
   panneau de droite affiche la liste des éléments existants de ce type, groupés par niveau. À
   l'intérieur de chaque niveau, les éléments étaient affichés dans l'ordre des zones/de création,
   pas par ordre alphabétique.

## Cause racine

Aucun défaut logique — comportement d'origine du builder v2 :

1. `PlanCanvas.vue:318-328` — le `<text>` du nom était centré sur la forme
   (`y = element.y*scale + element.depth*scale / 2`, `dominant-baseline="middle"`) et hérite d'une
   couleur proche de celle du remplissage → contraste insuffisant.
2. `ElementListPanel.vue` — le computed `groups` (~L180) empile les éléments dans l'ordre de
   `filtered` (lui-même dans l'ordre de `store.zonesSorted`), sans tri par nom.

## Correction

Faite sur la branche courante (voir commit associé) :

1. **Label sous la forme** (`PlanCanvas.vue:319-324`) : `y` passe au bord bas de la forme
   (`element.y*scale + element.depth*scale + 12`) avec `dominant-baseline="hanging"`. Centrage
   horizontal (`text-anchor="middle"`) conservé. Le libellé étant hors du `<g rotate>`, il reste
   horizontal même si le PDV est pivoté.
2. **Tri alphabétique** (`ElementListPanel.vue`, computed `groups`) : chaque groupe trie ses
   éléments par `el.name` via `localeCompare(..., { numeric: true, sensitivity: 'base' })` —
   couvre les deux modes d'affichage (`floor` et `type`) et gère l'ordre naturel des nombres
   (« Food Court 2 » avant « Food Court 10 »).

Tri appliqué **uniquement au panneau de droite** (demande explicite) ; l'ordre de rendu dans la
vue 2D/3D est inchangé.

## Risque de régression / à surveiller

- **Décalage du label (12 px)** : valeur unique à ajuster dans `PlanCanvas.vue:320` si le rendu est
  trop collé/éloigné après build.
- **Chevauchement des labels** : les noms étant désormais hors de la forme, deux PDV très proches
  peuvent voir leurs libellés se superposer. À surveiller sur des plans denses ; prévoir au besoin
  un fond/troncature.
- **`PlanElement.vue`** (même dossier) rend un `<text>` similaire mais est **code mort** (aucun
  import) — ne pas le modifier, ça n'aurait aucun effet visible.

## Références

- Module : [`../modules/03_BUILDER_ESPACES.md`](../modules/03_BUILDER_ESPACES.md)
- Remarque PO (Bertrand) transmise le 2026-07-28 (2 captures : vue Drawing + panneau de droite).
