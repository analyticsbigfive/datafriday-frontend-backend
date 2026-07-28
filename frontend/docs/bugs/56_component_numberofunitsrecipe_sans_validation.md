# BUG-056 — `numberOfUnitsRecipe` sans validation (0 ou négatif accepté), `rules.positive` mort

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟠 Majeur (peut produire une division par zéro/NaN en cascade)
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-16
- **Fichiers** : `src/components/menu-fb/views/component-library/views/ComponentCreateView.vue` (champ "Units per recipe", `rules.positive`)

## Symptôme

Le champ "Units per recipe" (`form.numberOfUnitsRecipe`) n'avait aucune règle de validation Vuetify
(`:rules`) attachée, malgré la présence d'un validateur `rules.positive = (v) => Number(v) > 0 ||
'Must be > 0'` défini dans le composant mais jamais référencé nulle part (`min="1"` sur un
`v-text-field` sans `<form>` HTML natif n'a aucun effet bloquant). Un utilisateur pouvait saisir `0`
ou une valeur négative, sauvegarder quand même (`formValid` restait `true`), et envoyer
`numberOfUnitsRecipe: 0` au backend.

## Cause racine

Ce champ est le dénominateur du calcul de coût côté backend
(`computeComponentUnitCost()`/`refreshCosts()`, déjà documenté comme structurellement faux car il ne
divise jamais par `numberOfUnitsRecipe` — voir `docs/modules/04_MENU_CATALOGUE.md`). Une valeur `0`
ou négative envoyée ici peut donc produire un coût NaN/Infinity pour ce composant, qui se propage à
tous les `MenuItem` l'utilisant. Le validateur existait déjà dans le code (`rules.positive`) mais
n'avait simplement jamais été branché sur ce champ — code mort par oubli.

## Correction

Ajout de `:rules="[rules.positive]"` au `v-text-field` du champ "Units per recipe". Le bouton Save
est déjà désactivé quand `formValid` est faux (`:disabled="saving || !formValid"`), donc une valeur
`0` ou négative bloque désormais la sauvegarde.

## Risque de régression / à surveiller

Vérifier qu'un composant existant ayant déjà `numberOfUnitsRecipe = 0` en base (créé avant ce fix)
peut toujours être ouvert en édition sans crash — seule la sauvegarde est bloquée tant que la valeur
n'est pas corrigée à > 0, pas le chargement. Pas de backfill des données existantes prévu ici (hors
périmètre front).

## Références

- `docs/modules/04_MENU_CATALOGUE.md` §"🔴 Bug actif confirmé — le coût d'un MenuComponent est
  surestimé quand `numberOfUnitsRecipe > 1`" — bug backend voisin, non corrigé, qui rend une valeur
  `0` particulièrement dangereuse ici.
