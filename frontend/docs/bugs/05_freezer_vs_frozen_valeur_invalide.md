# BUG-005 — "Freezer" vs Frozen — valeur de formulaire invalide

- **Statut** : 🔴 Ouvert (documenté, non corrigé par choix — décision du 2026-07-15)
- **Sévérité** : 🔴 Majeur (écriture DB probablement rejetée)
- **Domaine** : Menu & recettes (Catalogue)
- **Repo(s) concerné(s)** : `datafriday-web`
- **Découvert le** : 2026-07-15
- **Fichiers** : `MenuItemCreateView.vue:504` (seul fichier live désormais —
  `MenuItemFormDrawer.vue`, qui contenait aussi cette occurrence, supprimé le 2026-07-17 en tant
  que fichier orphelin jamais importé, voir [[83_menu_items_formdrawer_orphelin_code_mort]])

## Symptôme

Cocher la case de stockage "Freezer" dans le formulaire MenuItem puis sauvegarder envoie la string
`"Freezer"` dans une colonne enum Postgres qui n'accepte que `Cold/Dry/Frozen` → écriture
probablement rejetée en base.

## Cause racine

Les deux formulaires live utilisent une checkbox `value="Freezer"` au lieu de `"Frozen"`
(`StorageType.Frozen`, `schema.prisma:47-51`). Les fonctions d'affichage (`getStorageColor`)
utilisent, elles, correctement `"Frozen"` — seule la saisie est fautive.

## Correction

Aucune à ce jour, documenté le 2026-07-15.

## Risque de régression / à surveiller

Fix trivial (renommer la `value` dans les deux fichiers) — mais vérifier s'il existe déjà des
lignes en base avec une valeur invalide ou une écriture silencieusement rejetée à nettoyer avant
de considérer le correctif complet.

## Références

- `docs/modules/04_MENU_CATALOGUE.md` §"Bugs actifs confirmés"
- `docs/modules/00_INDEX.md`
