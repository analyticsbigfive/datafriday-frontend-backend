# BUG-199 — Dark mode absent/incomplet sur les domaines User & Role

- **Statut** : 🟡 Corrigé non déployé (correctif écrit, **non vérifié en navigateur** — cf. « Risque de régression »)
- **Sévérité** : 🟡 Mineur (lisibilité en thème sombre)
- **Domaine** : RBAC / Users
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-24 · **Corrigé le** : 2026-07-24 (emmanuel)
- **Fichiers** : voir la liste en fin de fiche

## Symptôme

Les écrans des dossiers `components/user` et `components/role` restaient partiellement ou
totalement clairs en thème sombre :

- **`user/views/UserCreateView`** et **`user/views/UserListView`** : aucun style sombre du tout
  (fond de page, cartes, table, formulaire, badges de statut).
- **`user/drawers/UserEditDrawer`**, **`user/dialogs/UserDeleteDialog`**,
  **`role/drawers/RoleFormDrawer`**, **`role/dialogs/RoleDeleteDialog`** : reçoivent la prop
  `isDark` mais **ne posaient aucune classe `--dark`** et n'avaient aucune règle sombre → rendus
  entièrement clairs.
- **`role/views/RoleListView`** : dark en grande partie fait, quelques trous (hover d'action,
  chip « +N », sous-titre trop foncé).

## Cause racine

Ces deux domaines n'utilisent pas le contrat `--fb-*` des workspaces F&B : ils suivent le pattern
**autonome** du projet (`useTheme()` → `isDark` → classe racine `--dark` → CSS scopé, cf.
[BUG-196](196_darkmode_completion_domaines_restants_etoiles_required.md)). Le câblage `isDark`
existait (vues via `useTheme`, transmission `:is-dark` aux enfants téléportés), mais :

1. Couleurs claires **codées en dur** (`#fff`, `#e5e7eb`, `#111827`, `#6b7280`…) sans override sous
   `--dark`.
2. Sur les 4 composants téléportés (`v-dialog` / `Teleport to="body"`), la classe racine `--dark`
   n'était **jamais posée** dans le template, alors que la prop `isDark` était bien reçue : leurs
   éventuelles règles dark n'auraient de toute façon rien ciblé.

## Correction

- **Trous comblés** avec la palette des drawers events (fonds `#111827`/`#1a2332`/`#1f2937`,
  bordures `#374151`/`#4b5563`, textes `#f9fafb`/`#d1d5db`/`#9ca3af`) :
  - `RoleListView` : 3 règles ajoutées.
  - `UserListView` : bloc dark complet ; racine `#user-list-page` → sélecteur combiné
    `#user-list-page.ul--dark` pour battre la spécificité de l'ID sur le fond.
  - `UserCreateView` : bloc dark complet (wizard d'étapes, formulaire, table, badges, boutons) ;
    même astuce de spécificité ID.
- **Classe `--dark` posée** sur les 4 composants téléportés (`.rfd--dark`, `.rdd--dark`,
  `.ued--dark`, `.udd--dark`) + blocs dark complets. La classe est sur l'élément lui-même (pilotée
  par `isDark`), donc insensible à la téléportation (contrairement à `.v-theme--dataFridayDark`,
  cf. [BUG-198](198_darkmode_eventpredict_overlay_teleporte.md)).
- **Badges de statut** (actif/pending/blue/green/gray) : « soft bg + texte foncé » (calibrés fond
  clair) → voile translucide + teinte claire.
- **Bandeaux rouges `#ff3131`** et boutons danger/primaire conservés dans les deux thèmes.
- **`user/views/ProfileView` : rien à faire** — déjà entièrement theme-aware, construit sur
  `rgb(var(--v-theme-surface))` / `rgba(var(--v-theme-on-surface), …)` (variables Vuetify qui
  basculent seules). C'est le modèle propre du répertoire.
- **Bug de compilation corrigé en cours de route** : `RoleFormDrawer` s'est retrouvé avec un
  `</style>` en double (l'insertion du bloc dark a ajouté une balise alors que le fichier en avait
  déjà une) → `VueCompilerError: Invalid end tag`. Retiré.

## Risque de régression / à surveiller

- **Non vérifié en navigateur** : contrôle de syntaxe uniquement (une seule paire `<style>` par
  fichier, accolades équilibrées). À reprendre écran par écran, en clair **et** en sombre — le mode
  clair est censé inchangé (rien n'a bougé hors des blocs `--dark`).
- Les 4 composants téléportés dépendent de la prop `:is-dark` transmise par leur vue parente
  (`UserListView`, `RoleListView`) : vérifié présent. Tout nouveau point de montage devra la
  passer, sinon le composant repart en clair.
- Garde-fou d'intégrité : compter **une seule** paire `<style>`/`</style>` par SFC (l'équilibre des
  accolades seul ne détecte pas un `</style>` en double).

## Références

- [BUG-196](196_darkmode_completion_domaines_restants_etoiles_required.md) — pattern autonome
  `isDark`/`--dark` et drawers events téléportés (`.eds--dark`).
- [BUG-198](198_darkmode_eventpredict_overlay_teleporte.md) — pourquoi `.v-theme--dataFridayDark`
  n'atteint pas le contenu téléporté (classe propre à préférer).

## Fichiers touchés

| Fichier | Objet |
|---|---|
| `src/components/role/views/RoleListView.vue` | 3 trous (hover action, chip « +N », sous-titre) |
| `src/components/role/drawers/RoleFormDrawer.vue` | `.rfd--dark` + bloc dark ; fix `</style>` doublé |
| `src/components/role/dialogs/RoleDeleteDialog.vue` | `.rdd--dark` + bloc dark |
| `src/components/user/views/UserListView.vue` | `.ul--dark` + bloc dark (table, badges) |
| `src/components/user/views/UserCreateView.vue` | `.ucp--dark` + bloc dark complet (2 colonnes) |
| `src/components/user/drawers/UserEditDrawer.vue` | `.ued--dark` + bloc dark |
| `src/components/user/dialogs/UserDeleteDialog.vue` | `.udd--dark` + bloc dark |
