# BUG-265-02 — HrRoleFormDrawer : `notLinked` désynchronisé verrouillait les pastilles de sous-type

<!-- AA = code auteur à 2 chiffres (01 Jean-Luc, 02 Ulrich, 03 Emmanuel) — voir "Comment ajouter un
     bug" dans 00_INDEX.md pour éviter les collisions de numérotation entre branches parallèles. -->

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur
- **Domaine** : RH / Staffing
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-31 (retour utilisateur : "je dois cocher/décocher NOT LINKED pour
  pouvoir en choisir d'autres" + audit sérieux demandé sur tout le fichier après plusieurs bugs
  successifs sur cet écran)
- **Fichiers** : `frontend/src/components/hr/drawers/HrRoleFormDrawer.vue`

## Symptôme

Ouvrir un rôle existant qui n'a actuellement aucun sous-type coché rendait **toutes les pastilles
de sous-type inaccessibles** (grisées, `:disabled`) — impossible d'en cocher une sans d'abord
cliquer sur "NOT LINKED" pour les débloquer, alors que rien n'indiquait que c'était nécessaire.

Deux autres symptômes liés découverts dans le même audit :
- Le bandeau "Save the role first — the department was just changed…" (BUG-264-02) pouvait
  apparaître à l'ouverture d'un rôle sans qu'aucun changement n'ait eu lieu.
- Le `<select>` de catégorie d'une règle Sinking existante s'affichait vide/sans valeur
  sélectionnée si le sous-type qu'elle référence avait été décoché depuis dans la grille.

## Cause racine

`notLinked` était un `ref(false)` indépendant, initialisé dans `reset()` par
`notLinked.value = !form.fnbCategories.length && !!p?.id` — donc **automatiquement `true`** pour
tout rôle existant sans tag. Or `HrRole` n'a aucun champ "not linked" séparé en base : seul
`fnbCategories: String[]` existe, et un tableau vide représente déjà "non lié" sans avoir besoin
d'un état parallèle. `notLinked=true` et `fnbCategories=[]` sont fonctionnellement identiques côté
backend — mais `notLinked` avait un effet de bord supplémentaire côté UI (`:disabled="notLinked"`
sur les pastilles) qui n'avait pas lieu d'être : un ref réglé automatiquement à `true` à
l'ouverture bloquait alors toute action tant qu'on ne le repassait pas manuellement à `false`.

Pour `departmentUnsaved` (BUG-264-02) : le fallback `props.initial?.department || ''` ne
reproduisait pas exactement la chaîne de repli de `reset()`
(`p?.department || p?.sector || 'shop'`) — un rôle chargé uniquement via le champ legacy `sector`
pouvait donc déclencher le garde-fou dès l'ouverture, sans changement réel.

Pour le `<select>` de règle Sinking : `<option v-for="c in form.fnbCategories">` n'incluait jamais
la valeur stockée sur la règle si elle avait été retirée de `form.fnbCategories` entretemps — le
navigateur n'affiche alors aucune option sélectionnée (aucune ne correspond à `v-model`).

## Correction

- `notLinked` devient un **computed dérivé** (`form.fnbCategories.length === 0`) au lieu d'un ref
  indépendant — élimine structurellement tout désync possible. Les pastilles ne sont plus jamais
  désactivées (`:disabled` retiré) ; cliquer une pastille de sous-type fonctionne toujours,
  peu importe l'état précédent. "NOT LINKED" devient un simple raccourci "vider la sélection"
  (`clearFnbCategories()`), plus un mode bloquant.
- `departmentUnsaved` (et son homologue de `reset()`) partagent désormais exactement le même repli
  (`persistedDepartment` computed, `p?.department || p?.sector || 'shop'`).
- Nouveau `ruleCategoryOptions(rule)` : injecte la valeur stockée sur la règle dans les options du
  `<select>` si elle n'est plus dans `form.fnbCategories`, pour qu'elle reste visible/éditable au
  lieu de disparaître silencieusement.
- Dans le même audit : la section "Advanced — Algorithm Mapping" (`<details>` replié par défaut)
  est passée en section normale toujours visible — retour utilisateur : elle "se perdait" en bas
  d'un formulaire pouvant devenir long (Sinking Rules). CSS mort nettoyé (`.hrd-advanced*`,
  `.hrd-pill--off`, plus référencés après ce changement).

## Risque de régression / à surveiller

`submit()` simplifié en conséquence (`fnbCategories: [...form.fnbCategories]`, le ternaire sur
`notLinked` étant devenu une tautologie). Vérifié : `pnpm lint:typo` (0 violation), parsing
SFC/Babel, toutes les clés i18n utilisées présentes dans les deux locales, suite Jest complète
(mêmes échecs pré-existants sans rapport, aucune régression).

## Références

- [BUG-263-02](263_02_drawer_body_flex_min_height_manquant_contenu_coupe.md) (même écran, tour précédent)
- [BUG-264-02](264_02_hrsinkingrule_department_non_enregistre_erreur_trompeuse.md) (même écran, faux positif corrigé plus précisément ici)
