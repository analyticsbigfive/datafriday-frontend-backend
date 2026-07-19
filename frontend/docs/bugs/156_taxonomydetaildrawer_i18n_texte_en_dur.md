# BUG-156 — `TaxonomyDetailDrawer.vue` : texte en dur (FR), i18n non branché + 3 boutons "Enregistrement…" en dur

- **Statut** : 🟢 Corrigé
- **Sévérité** : 🟡 Mineur
- **Domaine** : Événements
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-18
- **Fichiers** :
  - `src/components/events/drawers/TaxonomyDetailDrawer.vue`
  - `src/components/events/dialogs/EventTypeDialog.vue:46`
  - `src/components/events/dialogs/EventCategoryDialog.vue:82`
  - `src/components/events/dialogs/EventSubcategoryDialog.vue:63`
  - `src/i18n/translations.js`

## Symptôme

Retour utilisateur : "la traduction n'est pas gérée". `TaxonomyDetailDrawer.vue` (introduit par
BUG-153) affichait tout son contenu en français en dur (statut, libellés de section, état vide,
message d'erreur, bouton "Fermer") sans passer par `useI18n()`/`t()` — contrairement à toute
convention établie de ce domaine (`docs/FRONTEND_ARCHITECTURE.md` : "no hardcoded user-facing text
in templates"). L'app resterait donc figée en français dans ce tiroir quel que soit `appLocale`.
En creusant plus large sur les mêmes fichiers touchés par BUG-155, 3 dialogs pré-existants
(`EventTypeDialog.vue`, `EventCategoryDialog.vue`, `EventSubcategoryDialog.vue`) avaient également
un bouton "Enregistrement…" câblé en dur au lieu de passer par `t()`, malgré `t()` déjà utilisé pour
le reste du texte de ces mêmes fichiers — écart pré-existant, pas introduit par ce passage.

## Cause racine

`TaxonomyDetailDrawer.vue` créé directement avec du texte français littéral au lieu de suivre le
pattern `useI18n()` + clés `translations.js` utilisé par tous ses composants voisins
(`EventCategoryDialog.vue`, `TaxonomyImportDrawer.vue`, les 3 écrans `Events*ListView.vue`). Pour
les 3 dialogs, seul le texte du bouton "Save"/"en cours" avait été oublié lors de leur écriture
initiale — la ternaire `loading ? 'Enregistrement…' : t('xDialogSave')` mélangeait déjà `t()` et
littéral sur la même ligne.

## Correction

`TaxonomyDetailDrawer.vue` : ajout de `useI18n()`, toutes les chaînes affichées passées par `t()`.
`entityConfig` (computed) retourne désormais des **clés** i18n (`taxonomyDetailDrawer*`) résolues
dans le template, plutôt que du texte déjà traduit en dur. Bouton "Fermer" utilise la clé commune
`close` déjà existante ; état "Chargement…" utilise la clé commune `loading` déjà existante — pas de
nouvelle clé pour ce qui existait déjà. 14 nouvelles clés ajoutées à `translations.js` (`en`/`fr`)
sous le bloc "Taxonomy Detail Drawer".

Les 3 dialogs : `'Enregistrement…'` remplacé par une nouvelle clé dédiée par dialog
(`eventTypeDialogSaving`/`eventCategoryDialogSaving`/`eventSubcategoryDialogSaving`), suivant la
convention déjà en place dans ce fichier de traductions (une clé "saving" par composant plutôt
qu'une clé générique partagée, cf. `spaceBuilderSaving`/`edeSaving`/`b2Saving` déjà existants). Les
règles de validation `rules.required` de ces 3 mêmes dialogs (`'Ce champ est obligatoire'` en dur)
également basculées sur la clé commune déjà existante `required`.

## Risque de régression / à surveiller

Non reproduit en navigateur (pas de `pnpm dev` dans cette session) — à valider manuellement :
basculer la langue (`en`/`fr`) depuis les paramètres et vérifier que le tiroir de détail taxonomie
et les 3 dialogs de création affichent bien le texte dans la langue sélectionnée, y compris pendant
l'état "saving".

## Références

- [BUG-153](153_taxonomie_view_popup_non_conforme_liste_evenements_absente.md) — introduction de `TaxonomyDetailDrawer.vue`.
- [BUG-155](155_events_domaine_popups_v_dialog_remplaces_par_tiroirs.md) — même session, fichiers communs.
