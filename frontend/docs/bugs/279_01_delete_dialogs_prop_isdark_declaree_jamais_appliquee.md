# BUG-279-01 — ProductDeleteDialog & SupplierDeleteDialog : prop `isDark` déclarée mais jamais appliquée — modals blanches en dark

- **Statut** : 🟡 Corrigé non déployé (corrigé en code le 2026-08-02, non buildé/testé)
- **Sévérité** : 🟠 Majeur (modal de confirmation aveuglante blanche sur 8 routes en thème sombre)
- **Domaine** : Achats & référentiels / Menu & recettes / Thème
- **Repo(s) concerné(s)** : `datafriday-web` (frontend uniquement)
- **Découvert le** : 2026-08-02 (audit dark mode complet) — JLH
- **Fichiers** : `src/components/products/dialogs/ProductDeleteDialog.vue:71` (prop),
  `src/components/menu-fb/views/suppliers/dialogs/SupplierDeleteDialog.vue:61` (prop)

## Symptôme

En thème sombre, ouvrir une confirmation de suppression sur les 7 routes `/configurations/*`
(catégories/types produits, market-prices, composants, départements) ou `/menu-fb/suppliers` :
carte modale entièrement blanche (`background:#fff`, titre `#111827`) sur page sombre.

## Cause racine

4ᵉ occurrence du défaut type « prop déclarée, classe jamais posée » (précédents : BUG-199,
BUG-247-01, BUG-277-01) : les deux dialogs déclarent `isDark: { type: Boolean }` — et tous
leurs parents la passent correctement — mais aucun des deux ne pose de classe `--dark` sur sa
racine ni n'a de bloc CSS sombre. `v-dialog` téléporté → aucun héritage de tokens possible,
littéraux clairs seuls.

## Correction

Corrigé le 2026-08-02, pattern `RoleDeleteDialog.vue` (classe `--dark` sur racine propre,
overrides uniquement, rouge `#ff3131` conservé) :

- `ProductDeleteDialog.vue` : `:class="{ 'pdd-card--dark': isDark }"` + bloc
  `.pdd-card--dark` (carte `#1f2937`, textes `#f9fafb`/`#94a3b8`/`#d1d5db`, footer `#374151`,
  bouton Annuler sombre).
- `SupplierDeleteDialog.vue` : `:class="{ 'sdd--dark': isDark }"` + bloc `.sdd--dark`
  (carte `#1f2937`, header en dégradé rouge translucide → sombre, erreur en rouge translucide,
  footer `#111827`).

## Risque de régression / à surveiller

- Thème clair inchangé (overrides gatés). Contrôler visuellement les 8 routes en sombre + clair.
- Défaut de classe récurrent : tout nouveau dialog copié depuis ces fichiers doit poser la
  classe `--dark` — 4 occurrences du même oubli en 5 fiches.

## Références

- [BUG-199](199_darkmode_domaines_user_role.md) — pattern de référence (`RoleDeleteDialog`).
- [BUG-247-01](247_01_darkmode_cartes_espaces_homepage.md) — ces 2 dialogs y étaient déclarés
  « couverture partielle, reste à faire ».
- [BUG-277-01](277_01_eventdetailseditor_darkmode_drawer_illisible.md) — occurrence précédente.
