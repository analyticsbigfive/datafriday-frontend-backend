# BUG-283-01 — Restock : étapes « Réarmement » et « Courses » hors contrat `--sr-*` — reliquats clairs en dark (reporté depuis BUG-197)

- **Statut** : 🟡 Corrigé non déployé (corrigé en code le 2026-08-02, non buildé/testé)
- **Sévérité** : 🟡 Mineur (reliquats localisés — la cascade `--sr-*` couvrait déjà l'essentiel)
- **Domaine** : Stock / Logistique / Thème
- **Repo(s) concerné(s)** : `datafriday-web` (frontend uniquement)
- **Découvert le** : 2026-08-02 (audit dark mode complet ; dette déclarée « reste à faire » dans BUG-197) — JLH
- **Fichiers** : `src/views/SpaceRestockView.vue` (unique fichier modifié)

## Symptôme

`/spaces/:id/restock?step=restock|shopping` en thème sombre : boutons de confirmation blancs
(`.sr-confirm-btn`), toggle « X PdV » et diagnostics fournisseurs en gris ardoise clair, teintes
vertes « confirmé » (vert 100/700) calibrées fond clair, éditeur d'e-mail WYSIWYG (dialog
téléporté) blanc, bottom-sheet mobile de configuration au panneau clair.

## Cause racine

BUG-197 n'avait passé au contrat `--sr-*`/`--fb-*` que l'étape `?step=stock` (« à la demande »,
reste déclaré reporté). Audit règle par règle : la plupart des littéraux clairs des étapes 2-3
étaient en réalité déjà neutralisés par les couches « harmonisation » et « contrat final » du
même fichier — seuls échappaient au filet : `.sr-confirm-btn`, `.sr-shops-toggle/-detail`,
`.sr-shop-diag`, `.sr-row-confirmed` (variante mobile), 2 styles inline `#64748b`, l'éditeur
WYSIWYG (téléporté, hors racine token) et la bottom-sheet mobile (téléportée — résidu step 1
signalé par BUG-197, corrigé ici au passage).

## Correction

Corrigé le 2026-08-02, méthode BUG-197 (fallback = littéral d'origine → clair inchangé par
construction) :

- Littéraux → `var(--sr-*/--fb-*, littéral)` : confirm-btn, shops-toggle/detail, shop-diag,
  row-confirmed mobile, 2 inline `srUsedIn`.
- Valeurs sans rôle token (hovers ardoise, verts « confirmé ») : règles sombres additives
  `.v-theme--dataFridayDark .space-restock-view …` (vert 100/700 → `#86efac`/`#bbf7d0` sur fond
  translucide — membre clair de la famille).
- Téléportés (hors racine `--sr-*`) via `.dark` sur `<html>` : éditeur WYSIWYG
  (`.sr-wysiwyg*` : toolbar/éditeur `#172033`/`#374151`, focus blanc → transparent) et
  bottom-sheet mobile (`.sr-mobile-config-sheet` : panneau `#1f2937`, head `#1a2332`, outils).
- Volontairement non touchés : dégradés (BUG-198), rouge `#ff3131` et contrôles blancs sur
  rouge, `.sr-unmapped-*` (`color-mix` sur `--destructive`, fonctionne en sombre), bloc
  historique déjà réécrasé plus bas par les règles `var(--sr-*)`.

## `SpaceLogisticView.vue` — vérifié conforme, rien à faire

Tous fonds/bordures/textes sur `var(--lg-*)`/`var(--fb-*)` ; kickers ardoise déjà surchargés en
sombre ; seul dialog téléporté = reset (v-card Vuetify sans couleur en dur). La réserve de
BUG-197 (« pas de bloc `--dark` autonome ») reste vraie mais sans symptôme — rien de téléporté
n'y consomme de token.

## Risque de régression / à surveiller

- Vérifier les 3 étapes en clair (fallbacks identiques aux littéraux d'origine) et en sombre ;
  éditeur d'e-mail (dialog) et bottom-sheet mobile (viewport étroit) explicitement.
- Balance des accolades vérifiée (407/407), une seule paire `<style scoped>`.

## Références

- [BUG-197](197_darkmode_workspaces_fb_inventory_logistic_restock.md) — contrat `--sr-*`,
  périmètre step 1, dette reportée ici soldée.
- [BUG-198](198_darkmode_eventpredict_overlay_teleporte.md) — exclusion des dégradés.
