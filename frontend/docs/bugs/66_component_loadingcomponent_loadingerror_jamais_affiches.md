# BUG-066 — `loadingComponent`/`loadingError` jamais affichés dans le template de ComponentCreateView.vue

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Menu & recettes
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-16
- **Fichiers** : `src/components/menu-fb/views/component-library/views/ComponentCreateView.vue`

## Symptôme

Si `getMenuComponent(id)` échouait à l'ouverture de `/components/edit/:id` (réseau, 404, permission),
`loadingError` était bien renseigné par `loadComponentData()`, mais rien dans le template ne
l'affichait — la page restait silencieusement vide, sans aucun message d'erreur pour l'utilisateur.
`loadingComponent` (mis à `true` pendant le chargement) n'avait pas non plus d'indicateur visuel.

## Cause racine

Les deux propriétés `loadingComponent`/`loadingError` étaient bien déclarées et mises à jour dans
`loadComponentData()`, mais aucun `v-if` correspondant n'avait été ajouté dans le template au moment
de leur introduction — état "mort" côté affichage.

## Correction

Ajout dans le corps du formulaire (juste après l'alerte d'erreur de sauvegarde existante) : une
`v-alert type="error"` pour `loadingError`, et un `v-progress-circular` pour `loadingComponent`.

## Risque de régression / à surveiller

Simuler un échec de `getMenuComponent` (ex. id invalide) et vérifier que le message d'erreur
s'affiche bien au lieu d'un formulaire vide silencieux.

## Références

- Aucune fiche liée.
